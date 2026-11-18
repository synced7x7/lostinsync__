# Architecture

> **Verified against source on 2026-11-19.** Cross-cutting details and exact line references live in `agent/PROJECT_CONTEXT.md`; this document is the concise architecture overview.

## Overview

Lost in Sync follows a layered architecture: domain logic, persistence, and UI are separated, but **routing, shared state, the Library views, and the Game Details view live in `src/main.tsx`**. The Rust backend is a command layer over a single-row SQLite document store plus an IGDB proxy. React state drives the entire UI from one `AppData` document.

```
index.html ──> src/main.tsx (React root: manual routing, AppData state, Library, Details)
                    │  imports src/features/*, src/components/*, src/domain/*
                    │  calls AppRepository.load()/save()
                    ▼
      src/data/repository.ts  ── web swap ──> web/src/repository.web.ts (IndexedDB + vault)
                    │ Tauri IPC (invoke)
                    ▼
      src-tauri/src/lib.rs
        15 #[tauri::command] functions
        SQLite: app_state.data_json (1 row)
        IGDB proxy: Twitch OAuth + REST
        images/ folder: content-addressed files

web/index.html ──> web/src/entry.tsx ──> init() Drive sync ──> import("../../src/main")
                    web/vite.config.ts swaps 3 modules; everything else shared as-is
                    web/src/igdb.web.ts ──> Cloudflare Worker ──> IGDB
```

---

## Frontend Structure

### `src/domain/` — pure TypeScript (no React, no I/O)

| File | Contents |
|---|---|
| `game.ts` | `STATUSES`, `Status`, `View`, `Game`, `BundleGame`, `Profile`, `GridSize`, `LibraryLayout`, `LibrarySort`, `SortDirection`, `AppSettings`, `CollectionItem`, `Collection`, `AppData`, `defaultData`, and helpers `validateGame`, `formatPlaytime`, `formatCount`, `formatHours` |
| `gametype.ts` | IGDB game-type constants (`GAME_TYPES`), `matchesGameType`, `isBundle`, `slimBundle`, `sameBundle` |
| `library-session.ts` | `LibraryPrefs`, `libraryDefaults`, `SORT_OPTIONS`, module-level `librarySession` (memory only) |
| `stats.ts` | `index()` row model, `CATEGORIES`, 13 section builders, ECharts option builders, `build()` |
| `trophies.ts` | Six rarity tiers (`RARITY_RANK`, `RARITY_LABEL`), `TROPHIES`, `DEV_FAVORITES`, `GOTY`, `evaluate`, `topBadge`, `RARITY_COLOR` |
| `game.test.ts` | The only existing test file (2 Vitest tests for `validateGame` / `formatPlaytime`) |

### `src/data/`

| File | Purpose |
|---|---|
| `repository.ts` | `AppRepository` interface, `LocalAppRepository` (localStorage), `TauriAppRepository` (IPC), `createAppRepository()`, image externalization, `normalizeStatuses` |
| `igdb.ts` | Typed wrappers for all 11 IGDB commands plus `hasTauri`; `memo()` provides a **bounded LRU + 20-minute TTL** cache (`igdbDetailsCached`, `igdbImagesCached`, `igdbDiscoverCached`, `igdbDiscoverFeedCached`, bundle cache) |
| `sync.ts` | `syncWithIgdb`: refresh only IGDB-owned fields from an explicit `FIELDS` allow-list; chunked import with patch reports |
| `backloggd.ts` | Backloggd CSV importer: `mapEntry`, `withRetry`, `importBackloggd`, dedupe by `igdbId`, abort/report helpers |
| `platform.ts` | `ALL_PLATFORMS`, `PC`, aliases, `emulatedOn()` |

### `src/components/`

Shared presentational components reused across features:

- `layout.tsx` — `AppLayout`, collapsible `Sidebar`, version footer, error toast
- `navigation.ts` — the 7-item `navigation` array
- `shared.tsx` — `Header`, `Empty`, `StarRating`, `TrophyToggle`, `formatDate`, `parseDate`, `DateField`, `PlatformPicker`
- `rarity-badge.tsx` — `RarityBadge`

### `src/features/`

Self-contained view components with co-located CSS:

| Feature | Description |
|---|---|
| `dashboard.tsx` | Overview feed, recents, wishlist, "pick up where you left" |
| `library-components.tsx` | `AddGame` portal modal — also used for editing games |
| `journey.tsx` | Interactive timeline: SVG strands, lanes, LOD, zoom/pan, Fit All |
| `discover.tsx` | IGDB feeds, search, feed pages, `DiscoverGameDetails`, `draftFromIgdb` |
| `stats.tsx` | Lazy-loaded Apache ECharts analytics view; `ChartCard`/`Chart` |
| `trophies.tsx` | Badge gallery and trophy backgrounds |
| `overview.tsx` | `ProfileSection`, collection actions, canvas image helpers |
| `media.tsx` | Screenshot carousel + YouTube embeds |
| `series.tsx` / `bundle.tsx` | Franchise tree browser / bundle contents |
| `settings.tsx` / `settings-data.tsx` | Settings view, appearance defaults / JSON + CSV export, JSON import, Backloggd import, IGDB sync |

**Note:** `Details`, `LibraryView`, `PS4ShelfView`, and `GridLibraryView` are defined in **`src/main.tsx`**, not in `library-components.tsx`.

### `src/main.tsx`

The application root. Responsibilities:

- Loads `AppData` from the repository on mount; merges with `defaultData`.
- Owns the single `data` state plus `update`, `addGame`, `saveGame`, `deleteGame`. `update` uses a **500 ms debounce** and flushes on `pagehide` / `visibilitychange` / unmount (`src/main.tsx:161-197`).
- **Manual routing**: `view = location.pathname.slice(1) || "dashboard"` cast to `View`; `setView` calls `navigate()`. There are no `<Routes>`/`<Route>` declarations and no 404 fallback.
- Renders `AppLayout` with the active view; lazy-loads Stats inside `Suspense`.
- Defines the Library views and the `Details` hero (including inline Favorite updates and read-only journey fields that open the `AddGame` modal for editing).
- Hosts the global error boundary and window error handlers.

---

## Backend (Tauri Commands)

All commands live in `src-tauri/src/lib.rs`; the binary entry is `src-tauri/src/main.rs`. There are no controllers, services, middleware, or background processes. All 15 commands are registered in `generate_handler!` at `lib.rs:1187-1204`.

### Persistence / file commands

| Command | Signature | Description |
|---|---|---|
| `load_app_data` | `() → Option<JsonValue>` | Reads the single `app_state` row |
| `save_app_data` | `(data: JsonValue) → ()` | UPSERT the full `AppData` document |
| `images_path` | `() → String` | Path to `<app_data>/images/` |
| `store_image` | `(dataUri: String) → String` | Writes a hash-named image file, returns filename |
| `save_text_file` | `(defaultName, contents, filterName, ext) → Option<String>` | Native save dialog (text only) |

### IGDB proxy commands

`IgdbAuth` holds a token behind an async mutex; `igdb_token()` refreshes it 300 seconds before expiry. On HTTP 401 the token is cleared and the call fails **without retry**; there is no HTTP timeout, no 429 handling, and a fresh `reqwest::Client` per request.

| Command | Description |
|---|---|
| `igdb_search` | Fuzzy, exact (`/ `), or ID (`& <id>`) search → `Vec<IgdbHit>` |
| `igdb_details` | Full metadata + TTB + artwork selection → `IgdbGame` |
| `igdb_images` | Covers/artworks/screenshots gallery → `IgdbDebugImage[]` |
| `igdb_discover` | Legacy 10-feed snapshot (unused by current UI) |
| `igdb_discover_feed` | **Active** paginated feed loader (`offset` 0–90, `limit` 1–30) |
| `igdb_series` | Franchise tree traversal (4 levels up/down) → collections + games |
| `igdb_bundle_contents` | Games in a bundle/edition (limit 50) |
| `igdb_platforms` | Full IGDB platform list in 500-row pages |
| `igdb_sync_check` | Bulk `updated_at` check (500 IDs/request) |
| `igdb_import_batch` | Details + images + TTB in ~3 requests (bulk import/sync) |

### Web proxy

`web/worker/src/index.ts` is a **stateless Cloudflare Worker**: `POST /igdb/<endpoint>` only, with an endpoint allow-list, exact-origin CORS (`ALLOWED_ORIGINS`), per-IP rate limit (40 req/10 s), credential headers, in-memory token cache, one 401 retry, and `Cache-Control: no-store`. It is not a browser service worker.

### Security / capabilities

`src-tauri/capabilities/default.json` grants `core:default`, `opener:default`, and `dialog:default` to window `main` only — no `fs`, `shell`, `http`, or `notification` permissions. CSP and the `$APPDATA/images/**` asset scope are in `src-tauri/tauri.conf.json:23-26`. The opener plugin is initialized only in debug builds (`lib.rs:1181-1183`).

---

## Data Flow

**Write:**

```
User action → addGame / saveGame / deleteGame / update (src/main.tsx)
  → setData(next) + pendingSave.current = next
  → 500 ms timer → flushSave() → repo.save(next)
  → Tauri: externalize images → save_app_data IPC → serde_json::to_string
     → SQLite UPSERT app_state (id = 1, data_json)
  → browser dev: localStorage["lost-in-sync.data"]
  → web: IndexedDB kv/data + image Blobs → emitDirty() → queued Drive push
```

**On startup:**

```
App mounts → repo.load()
  → Tauri: load_app_data → SQLite read → JSON parse
  → dev: localStorage read → web: IndexedDB read
  → merge with defaultData → normalizeStatuses → setData(merged) → render
```

---

## Interactive Journey Timeline

`JourneyView` (`src/features/journey.tsx`) renders the history timeline with **React DOM + SVG** vector strands and Level-of-Detail (LOD) optimizations.

### Architecture

- SVG `<path>` cubic beziers for connecting strands and axis ticks.
- Game cards are React DOM nodes positioned with CSS `transform`; `startedAt`/`finishedAt` determine position and span.
- A dynamic branching algorithm assigns lanes to avoid overlapping strands; short completions use pillars (`SHORT = 5`).
- **LOD**: below `LOD_Z = 0.4`, covers/titles/dates are culled to single strands.
- Zoom 10–240%, range presets (`all`, `month`, year), and a virtualized `Fit All` overview.
- Navigation state (`session`) is **memory only** — explicitly never saved to the database.

### Key design decisions

- React + SVG avoids a WebGL dependency while staying crisp on high-DPI displays.
- LOD culling and positional virtualization keep DOM node counts manageable.
- Both Fit All and the timeline share the same `base.sorted` array (ascending by `start`), so any sorting change affects lane colors and branches too.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Single JSON blob in SQLite | Avoids complex migrations while the model evolves; costs a full-document write per mutation. Additive TS fields need no SQL migration. |
| `AppRepository` adapter | Keeps one UI for Tauri, browser dev (localStorage), and web (IndexedDB). |
| IGDB proxy in Rust / Cloudflare Worker | Browsers cannot call IGDB directly (CORS); credentials are held server-side and refreshed automatically. |
| Bounded LRU + TTL IGDB caches | 20-minute TTL and per-cache size caps prevent unbounded session heap growth and stale feeds. |
| Image externalization | Large base64 values become hash-named files/blobs; saves stay small. |
| Session-only Library/Journey prefs | Memory-only by design; `AppSettings.journeyRange/Zoom/Fit` are declared but unused. |
| Web via 3 module swaps | Web reuses all shared `src/` code unchanged; only IGDB, repository, and settings-data are swapped. |
| Single static "Aurora" theme | CSS variables exist, but there is no runtime theme switching and many hard-coded colors remain. |
