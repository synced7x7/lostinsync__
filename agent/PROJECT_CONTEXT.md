# PROJECT_CONTEXT.md — Lost in Sync (technical reference)

> Generated from direct source inspection on 2026-11-19, refreshed for desktop store import on 2026-11-21 and for generic CSV import + dashboard motion on 2026-11-22. **The code is the source of truth.** The `docs/` folder and root `README.md` were refreshed for these features; `web/README.md` is still partially stale. This document is the permanent technical reference for AI agents; `PROJECT_STATUS.md` tracks changing progress and `future_implementation_guide.md` tracks planned features.

---

## 1. Project Overview

**Project name:** Lost in Sync (repository / brand `lostinsync__`; package name `lost-in-sync`; desktop product name `Lost in Sync`).

**Purpose and objectives:** A personal, offline-first "game library OS" for cataloguing an owned/played game collection, discovering new games through IGDB, and visualizing gaming history on an interactive timeline. Local-first: user data lives on the user's machine; external metadata is optional enrichment.

**Target users:** Individual game collectors and players who want a private, local database with rich analytics and no mandatory account or cloud service.

**Main features (verified in source):**

- Seven game lifecycle statuses: `Backlog`, `Wishlist`, `Playing`, `Completed`, `Shelved`, `Abandoned`, `On hold` (`src/domain/game.ts:3`).
- Library views: PS4-style focused shelf with spring transitions, optional fullscreen shelf, and a virtualized catalog grid (`src/main.tsx`).
- Search (title substring), filters (status, IGDB game type, favorites only), 10-key sorting with ascending/descending direction (`src/main.tsx:300-377`).
- Rich game details hero: cover/backdrop, rating, time-to-beat metadata, "Played on" platform chips, notes, journey info, series and bundle browsers.
- Interactive Game Journey timeline with SVG strands, lane assignment, zoom/pan, LOD culling, and a virtualized "Fit All" overview (`src/features/journey.tsx`).
- Discover: 9 IGDB feeds, Rust-ranked For You/Top Rated/Indie Spotlight/Story-Driven feeds, search with `/ ` exact-name and `& ` ID syntax, one-click import of metadata/images (`src/features/discover.tsx`, `src-tauri/src/lib.rs`). See `docs/discovery-and-recommendation-algorithms.md`.
- Trophies/badge gallery with six rarity tiers including `lostinsync` (`src/domain/trophies.ts`).
- Statistics: 13 visible categories built from `src/domain/stats.ts` (including a Playtime category aggregated from recorded `totalSeconds` by `src/domain/playtime.ts`) and rendered with Apache ECharts (`src/features/stats.tsx`).
- Settings: defaults, IGDB credentials, JSON/CSV export, JSON import, Backloggd import, generic CSV import (`title`/`igdb_id` keyed, IGDB-enriched), IGDB metadata sync; web build adds encrypted credential vault and Google Drive backup.
- Dashboard presentation: animated favorites stage (flowing wave, mouse spotlight, staggered rising/floating cards, cover sheen, pulsing stem dots) and a stats strip whose numbers spin as odometer reels when scrolled into view, with `prefers-reduced-motion` fallbacks.
- **Find My Next Game** (desktop/Tauri): session-cached, history-driven backlog recommender that scores Backlog games from long-term/recent taste profiles, Bayesian IGDB quality, diversity, and explanations (`src-tauri/src/lib.rs`, `src/data/recommendations.ts`, `src/features/dashboard.tsx`). See `docs/discovery-and-recommendation-algorithms.md`.
- Desktop-only one-way store import (`src/data/stores/`, `src/features/stores-settings.tsx`, `src-tauri/src/stores.rs`): Steam owned/free games, public wishlist, playtime and achievements map into the existing library; Epic ownership uses the same pipeline and catalog-id IGDB matching. Credentials never enter exports or web snapshots. User guide: `docs/store-import-guide.md`.
- Media gallery (screenshots, YouTube embeds), franchise/series tree, dedicated `/franchises` completion view, bundle contents, profile banner editor.

**Core application functionality:** CRUD over a single `AppData` JSON document; optional IGDB metadata enrichment; local image storage; analytics; timeline visualization; web variant with cloud backup.

---

## 2. Technology Stack

### Languages and versions (verified)

| Layer | Technology | Version / source |
|---|---|---|
| Frontend language | TypeScript | `^5.7.2` (`package.json:24`) |
| UI runtime | React / ReactDOM | `^18.3.1` (`package.json:21-22`) — note `@types/react` / `@types/react-dom` are `^19.3.0` (`package.json:29-30`), a typing mismatch to watch |
| Routing | `react-router-dom` | `7.9.4` (`package.json:23`); used only via `useLocation`/`useNavigate` — routing is manual, not `<Routes>` |
| Build tool | Vite | `^6.0.5` (`package.json:25`); plugin `@vitejs/plugin-react ^4.3.4` |
| Desktop shell | Tauri | Rust crate `tauri 2.12.5` (`src-tauri/Cargo.toml:24`, lock 2.12.5); CLI / API `2.12.4` (`package.json:15,28`) |
| Rust | Cargo / edition | `edition 2024`, `rust-version 1.90` (`src-tauri/Cargo.toml:6-9`) |
| Database | SQLite via `rusqlite` | `0.32` → `0.32.1`, bundled (`src-tauri/Cargo.toml:26`) |
| HTTP client | `reqwest` | `0.12` → `0.12.28`, `rustls-tls` (`src-tauri/Cargo.toml:27`) |
| Serialization | `serde` / `serde_json` | `1.0.229` / `1.0.154` (lock) |
| Image storage | `base64` | `0.22.1` (`src-tauri/Cargo.toml:30`) |
| Animation | Framer Motion | `^14.7.1` (`package.json:19`) |
| Charts | Apache ECharts | `^6.1.0` (`package.json:18`) |
| Icons | Lucide React | `^0.468.0` (`package.json:20`) |
| Testing | Vitest + jsdom | `^2.1.8` / `^25.0.1` (`package.json:31-32`) |
| Other Tauri plugins | `tauri-plugin-dialog 2.8.4`, `tauri-plugin-opener 2.7.2`, unused `tauri-plugin-log 2.10.1` | `src-tauri/Cargo.toml:23-29` — see §14 |
| Web infrastructure | Cloudflare Worker (IGDB proxy), Google Identity Services + Drive REST, Vercel/Cloudflare Pages static hosting | `web/worker/wrangler.toml`, `web/src/drive.ts`, `vercel.json`, `web/README.md` |
| Package manager | pnpm (lockfile `pnpm-lock.yaml`) | scripts in `package.json:6-13` |

**No backend web framework** exists: there is no Node server, no Express/Fastify, no controllers or HTTP middleware. The "backend" is the Tauri Rust command layer plus a stateless Cloudflare Worker used only by the web build.

---

## 3. Overall Architecture

```
index.html ──> src/main.tsx (React app root, all routes, single AppData state)
                    │  imports src/features/*, src/components/*, src/domain/*
                    │  calls AppRepository.load()/save()
                    ▼
        ┌───────────────────────────────────────┐
        │ src/data/repository.ts                │
        │  TauriAppRepository  |  LocalAppRepo  │  (web build swaps in web/src/repository.web.ts)
        └──────────┬────────────────────────────┘
                   │ Tauri IPC (invoke)                    web: IndexedDB + vault
                   ▼                                       (web/src/db.ts, vault.ts, codec.ts)
        ┌───────────────────────────────────────┐
        │ src-tauri/src/lib.rs                  │
        │  28 #[tauri::command] functions       │
        │  SQLite: app_state.data_json (1 row)  │
        │  IGDB proxy: Twitch OAuth + REST      │
        │  images/ folder: content-addressed    │
        └───────────────────────────────────────┘

web/index.html ──> web/src/entry.tsx ──> init() Drive sync ──> dynamic import("../../src/main")
                    web/vite.config.ts swaps 3 modules at build time; everything else is shared as-is
                    web/src/igdb.web.ts ──> Cloudflare Worker (web/worker/src/index.ts) ──> IGDB
```

**Communication between modules:** React props and callbacks for UI; module-level in-memory session objects for non-persisted UI prefs; `invoke()` for frontend→Rust; WebView `asset://` URLs for local images; `fetch()` to the Cloudflare Worker for web IGDB requests; `fetch()` to Google Drive REST for web backup.

**Data flow (write):**

```
User action → updater in src/main.tsx (addGame / saveGame / deleteGame / update)
  → setData(next) + pendingSave.current = next
  → 500 ms debounce → flushSave() → repo.save(next)
  → Tauri: externalize images → save_app_data IPC → serde_json::to_string
     → SQLite UPSERT app_state (id=1, data_json)
  → browser dev: localStorage["lost-in-sync.data"]
  → web: IndexedDB kv/data + image blobs + emitDirty() → queued Drive push
```

**Data flow (read):** `repo.load()` on mount (`src/main.tsx:150-158`) → merge with `defaultData` → `setData` → render.

**Important architectural decisions:**

- **Single JSON document** in one SQLite row (`src-tauri/src/lib.rs:80-83`) avoids relational migrations while the model evolves; cost is full-document serialization on every save.
- **Repository adapter** (`src/data/repository.ts:17`) keeps one UI for Tauri, browser dev (localStorage), and web (IndexedDB).
- **Rust IGDB proxy** because browser CORS and credential handling; token cached with a 5-minute early refresh (`src-tauri/src/lib.rs:349-376`).
- **Desktop store import** keeps all store HTTP, Steam keys/SteamID64 handling and Epic tokens in Rust; the shared UI only sees normalized records/status and hides the panel in web builds. Optional store fields survive JSON exports without credentials.
- **Connection-driven OAuth UI**: Epic's sign-in page/code/complete controls render only while disconnected; switching tabs or a failed fetch refreshes status so a removed token brings them back.
- **Externalized images**: large base64 images are written to `images/` as content-addressed files; the saved record holds `img:<filename>` refs (`src/data/repository.ts:41-79`).
- **Session-only UI prefs**: `librarySession` (`src/domain/library-session.ts:36`) and Journey `session` (`src/features/journey.tsx:135`) are deliberately not persisted.
- **Bounded LRU + TTL caches** for IGDB (`src/data/igdb.ts:36-52`, 20 min TTL, max 10–150 entries depending on cache); `docs/performance-optimization-report.md` was corrected to reflect this.
- **Web isolation**: only three modules are swapped; shared `src/` is never edited by web code (`web/vite.config.ts:14-18`).

---

## 4. Directory Structure

Meaningful paths only (no build artifacts, no `node_modules`, no individual badge images).

| Path | Purpose / contents | Depends on / depended on by | Inspect when |
|---|---|---|---|
| `index.html` | Desktop entry: `<div id="root">` + `/src/main.tsx` | Vite root config | Changing boot HTML/CSP |
| `src/main.tsx` | App root: manual routing, `AppData` state, debounced save, Library/PS4 shelf/catalog grid/Details views (separate TTB panel, exact storefront icon row, IGDB ID pill), global error boundary | All features; `src/data/*`, `src/components/*`, `src/style.css` | Any cross-cutting UI or state change |
| `src/style.css` | Global theme tokens, layout, shared components (2486 lines) | Everything visual | Styling or theming work |
| `src/domain/game.ts` | `STATUSES`, `Game`, `Profile`, `AppSettings`, `AppData`, `defaultData`, helpers (`formatPlaytime`, `formatHours`, `validateGame`, `formatCount`) | Nearly every module | Adding/changing data fields |
| `src/domain/gametype.ts` | IGDB game-type constants, `matchesGameType`, `isBundle`, `slimBundle`, `sameBundle` | Library filters, Discover, bundle UI | Game-type/bundle logic |
| `src/domain/library-session.ts` | `LibraryPrefs`, `libraryDefaults`, `prefsToSettings`, `SORT_OPTIONS`, `librarySession` | `src/main.tsx` LibraryView | Library sort/filter changes |
| `src/domain/journey-sort.ts` | `sortJourneyRows` — chronological comparator with `id` tie-break, reversible for Fit All | `src/features/journey.tsx` | Journey Fit All sort changes |
| `src/domain/playtime.ts` | `playtimeHours`, `summarizePlaytime`, `playtimeBuckets` — pure aggregation of recorded `totalSeconds` | `src/domain/stats.ts` | Playtime stats changes |
| `src/domain/franchise.ts`, `src/domain/franchise.test.ts` | `ALL_TYPES`, `WANTED_TYPES`, `wantedType`, `libWanted`, `groupByFranchise`, `buildFranchise`, `baseTitle`, `norm` — franchise grouping, game-type switch, slot dedupe and completion metrics | `src/features/franchises.tsx` | Franchise totals/grouping changes |
| `src/domain/store-links.ts` | `storeLinksFromExternal`, `storeLabel` — validate, deduplicate and priority-order IGDB `external_games` storefronts | `src/main.tsx` Details hero | Store-link filtering/order changes |
| `src/domain/stats.ts` | Row index (`index`), `yearsOf`, `CATEGORIES`, 14 section builders (incl. `playtime()`), ECharts option builders, `build` | `src/features/stats.tsx`, `src/domain/playtime.ts` | Any analytics change |
| `src/domain/trophies.ts` | Rarity tiers, `TROPHIES`, `DEV_FAVORITES`, `GOTY`, `evaluate`, `topBadge`, `RARITY_COLOR` | Trophy UI, sidebar badge, stats milestones | Badge/rarity work |
| `src/domain/*.test.ts`, `src/data/stores/*.test.ts` | 9 Vitest files / 67 tests: game 2, journey-sort 4, playtime 8, store-links 5, Epic parser 2, Steam parser 9, matcher 12, import pipeline 21, franchise 4; 66 pass while `ALL_TYPES = true` (expected filter-test failure) | `pnpm test` | Adding pure-function tests |
| `src/data/repository.ts` | `AppRepository`, `LocalAppRepository`, `TauriAppRepository`, `createAppRepository()`, image externalization | `src/main.tsx`; swapped in web | Persistence changes |
| `src/data/igdb.ts` | Typed wrappers for 13 IGDB commands (including `igdbFranchise` / `igdbGamesByIds` and `igdbExternalGames`), bounded LRU cached variants, `hasTauri`, `saveTextFile` | Discover, sync, importers, Details store links, Franchise completion | Adding IGDB calls (mirror in web!) |
| `src/data/franchiseCache.ts` | Key-scoped `franchise_cache_load` / `franchise_cache_save` adapter; no-op when `hasTauri` is false | `src/features/franchises.tsx` | Franchise cache/TTL changes |
| `src/data/sync.ts` | `syncWithIgdb`, `FIELDS` allow-list, `buildPatch`, `applyPatches`, sync reports | Settings sync section | IGDB refresh behavior |
| `src/data/backloggd.ts` | `importBackloggd`, `withRetry`, `mapEntry`, import reports | Settings Backloggd section | Import pipeline work |
| `src/data/recommendations.ts` | `getBacklogRecommendations`, `BacklogRecommendation` type, desktop Tauri guard | `src/features/dashboard.tsx`, Rust `get_backlog_recommendations` | Dashboard backlog recommendation work |
| `src/data/stores/` | `ipc.ts`, `types.ts`, `steam.ts`, `epic.ts`, `match.ts`, `import.ts` plus 4 Vitest files; desktop-only Steam/Epic connector catalog, parsers, IGDB matching, one-way import, **and the generic CSV importer** (`parseCsv`, `parsePlaytimeSeconds`, `importCsv`, `CsvImportProgress`/`CsvImportReport`, `csvReportSections`, `csvReportToText`) | `src/features/stores-settings.tsx`, `src/features/settings-data.tsx`, Rust store commands | Store import/status/mapping and generic CSV import work |
| `src/data/platform.ts` | `ALL_PLATFORMS`, `PC`, `emulatedOn` | Stats, AddGame, importers | Platform lists/derivation |
| `src/components/shared.tsx` | `Header`, `Empty`, `StarRating`, `TrophyToggle`, `formatDate`, `parseDate`, `DateField`, `PlatformPicker` | All features | Reusable form/display controls |
| `src/components/layout.tsx` | `AppLayout`, collapsible `Sidebar`, error toast | `src/main.tsx` | Navigation/layout changes |
| `src/components/navigation.ts` | `navigation` array (7 items) | Sidebar | Adding a route to the sidebar |
| `src/components/rarity-badge.tsx` | `RarityBadge` | Sidebar, profile banner, trophies | Badge display |
| `src/components/store-icons.tsx` | `StoreIcon` — transparent brand-logo SVGs keyed by IGDB `external_game_source` / `category` ID | Details store chips | Store icon/logo changes |
| `src/features/dashboard.tsx` | Overview feed, session-cached "Find My Next Game" (desktop), recents, wishlist, "pick up where you left"; `useReveal` (IntersectionObserver), `Odometer` digit reels, `BigStat`, favorites `onMouseMove` spotlight vars, `favflow` SVG gradient and `--d` slot stagger | Route `/`, `overview.css`, `src/data/recommendations.ts` | Dashboard changes, motion, and recommendations |
| `src/features/library-components.tsx` | `AddGame` modal (also used for editing) — only export | `src/main.tsx` | Add/edit form or IGDB search bug |
| `src/features/journey.tsx` + `journey.css` | Timeline, `FitView`, LOD, zoom/pan, session prefs | Route `/journey` | Timeline and Fit All work |
| `src/features/franchises.tsx` + `franchises.css` | `FranchiseView`, ribbon rows, 30-day visible-row SQLite cache, 100-game chunk loader, per-row progress and Retry/Refresh, virtual rows/slots, smooth wheel/arrow scrolling, `useSmoothX` | Route `/franchises` | Franchise completion UI/performance |
| `src/features/discover.tsx` + `discover.css` | Feeds, search, cards, details bridge, `draftFromIgdb` | Route `/discover`, Details | Recommendation work |
| `src/features/stats.tsx` + `stats.css` | Category landing, tiles, `Chart` (ECharts canvas) | Route `/stats` | Analytics UI |
| `src/features/trophies.tsx` + `trophies.css` | Badge gallery, backgrounds from `src/images/trophy-bg/` | Route `/trophies` | Trophy UI/assets |
| `src/features/overview.tsx` + `overview.css` | `ProfileSection`, collection actions, canvas crop helpers; favorites + stats-strip motion (`beam-spin` border, `wave-reveal`, `fav-rise`/`fav-float`/`center-glow`, `card-sheen`, `stem-grow`, `dot-pop`/`dot-ping`, `strip-sweep`, `stat-in`/`stat-glow`, odometer styles, reduced-motion overrides) | Dashboard profile slot and stats strip | Profile/banner and dashboard animation work |
| `src/features/media.tsx` | Screenshot carousel, YouTube embeds | Details | Media work |
| `src/features/series.tsx`, `bundle.tsx` | `SeriesModal`/`SeriesButton`, `BundleContents` | Details | Franchise/bundle work |
| `src/features/settings.tsx` | `SettingsView`, appearance defaults, static theme pill | Route `/settings` | Settings UI |
| `src/features/stores-settings.tsx` | Desktop-only store connector UI: Steam fields, Epic status-driven sign-in, fetch/import phases, progress and copyable report | Settings; hidden when `isDesktop` is false | Store import UI/report work |
| `src/features/settings-data.tsx` | `DataSection`, JSON/CSV export/import, Backloggd import, `CsvImportSection` (generic CSV), IGDB sync | Settings; wrapped by web | Import/export/sync |
| `src/images/{badges,trophy-bg,logo}/` | PNG artwork loaded with `import.meta.glob` | Trophy views, sidebar logo | Asset optimization |
| `src-tauri/src/lib.rs` | All 28 Tauri commands (incl. franchise cache, `igdb_franchise` / `igdb_games_by_ids`, `igdb_external_games`, `stores_*`, `get_backlog_recommendations`), SQLite migration, IGDB proxy, image storage, app setup | Desktop backend | Any native feature |
| `src-tauri/src/stores.rs` | Steam/Epic endpoint constants, Rust HTTP/auth, Steam owned/wishlist/achievement parsing, Epic library/catalog title resolution, `store-credentials.json`, 4 Rust unit tests | `lib.rs` store commands | Store connector/API changes |
| `src-tauri/src/main.rs` | 5-line binary entry calling `app_lib::run()` | Rust build | Rarely |
| `src-tauri/tauri.conf.json` | productName, identifier, window, CSP, asset protocol, bundle targets, Android suffix | Tauri build/runtime | Config/security changes |
| `src-tauri/capabilities/default.json` | `core:default`, `opener:default`, `dialog:default` for window `main` | Tauri permissions | Adding plugin capabilities |
| `src-tauri/Cargo.toml` / `Cargo.lock` | Rust dependencies and resolved versions | Rust build | New native dependency |
| `src-tauri/icons/` | Desktop + `android/` + `ios/` app icons | Bundler | Icon/PWA/Android work |
| `web/vite.config.ts` | Three module swaps, build-time CSP, dev port 5174, output `web/dist` | Web build | Web/PWA changes |
| `web/index.html`, `web/src/entry.tsx` | Web boot: cloud CSS, `init()` sync, dynamic import of shared app; F11 fullscreen monkey-patch | Web runtime | Web entry changes |
| `web/src/db.ts`, `vault.ts`, `codec.ts`, `repository.web.ts`, `events.ts` | IndexedDB (v1: `kv`, `images`), AES-GCM credential vault, image hash blobs, repository, dirty-event pub/sub | Web persistence | Web data/storage work |
| `web/src/igdb.web.ts` | IGDB client over Cloudflare Worker; mirrors every export of `src/data/igdb.ts`; `igdbExternalGames` falls back to nested `games.external_games.*` on worker 404 | Web IGDB UI | Any IGDB client change |
| `web/src/sync.ts`, `drive.ts`, `cloud-panel.tsx`, `cloud.css` | Google Drive backup, conflict detection, sync UI | Web cloud | Cloud sync work |
| `web/src/settings-data.web.tsx` | Re-exports offline `DataSection` and injects `CloudSection` | Settings | Web-only settings panel |
| `web/worker/` | Cloudflare Worker: `src/index.ts` (stateless IGDB proxy), `wrangler.toml`; note stale dead frontend copies in `src/{entry.tsx,login-gate.tsx,sync.ts,cloud.css}` | Web IGDB | Proxy work |
| `vercel.json`, `pnpm-workspace.yaml`, `scripts/check-environment.ps1` | SPA rewrite, build allowlist (not a package list), Windows env check | Deployment/setup | Deploy/setup |
| `docs/*.md` | Architecture, schema, features, design, IGDB images, performance, roadmap, badge brief — store-related docs **refreshed 2026-11-21** | Humans/agents | Concise human-readable overview; this knowledge base remains the exhaustive reference |

---

## 5. Frontend Architecture

### Pages and routes

Routing is **manual**, derived from `location.pathname.slice(1)` with a `View` cast (`src/main.tsx:83-85`); `setView` calls `navigate()`. There is no `<Routes>` declaration and no 404 fallback (unknown paths render an empty page).

| URL | Rendered component | Source |
|---|---|---|
| `/` | `Dashboard` + `ProfileSection` | `src/main.tsx:251`, `src/features/dashboard.tsx`, `src/features/overview.tsx` |
| `/library` | `LibraryView` (local to `main.tsx`) | `src/main.tsx:252-254`, `:335-461` |
| `/discover` | `DiscoverView` | `src/features/discover.tsx` |
| `/journey` | `JourneyView` | `src/features/journey.tsx` |
| `/franchises` | `FranchiseView` | `src/features/franchises.tsx` |
| `/trophies` | `TrophiesView` | `src/features/trophies.tsx` |
| `/stats` | `lazy(() => import("./features/stats"))` inside `Suspense` | `src/main.tsx:263,289` |
| `/details?game=<id>` | `Details` (local) | `src/main.tsx:281-283,848-1059` |
| `/details?igdb=<n>` | `DiscoverGameDetails` with `Details` as renderer | `src/main.tsx:264-280`, `src/features/discover.tsx:254-301` |
| `/settings` | `SettingsView` | `src/features/settings.tsx` |
| `/profile` | redirect to `/` | `src/main.tsx:128-130` |

All views are wrapped in `AppLayout` (`src/components/layout.tsx:13`) with sidebar nav from `navigation.ts` (dashboard, library, discover, journey, franchises, stats, trophies, settings).

### Components and responsibilities

`src/components/shared.tsx` is the reusable control library:
- `Header` (page heading), `Empty` (empty state with an "Open library" action button), `StarRating` (1–10 stars in two clusters, half-star granularity), `TrophyToggle` (platinum toggle), `formatDate`, `parseDate` (ISO / `D/M/YYYY` / `D Mon YYYY`), `DateField` (text + native picker, `capAtToday`, 2200 ms "saved" indicator), `PlatformPicker` (searchable chips, `single` mode).

Feature components are self-contained with co-located CSS (see directory table). `Details`, `LibraryView`, `PS4ShelfView`, `GridLibraryView` are **not** in `library-components.tsx`; they live in `src/main.tsx` (as `docs/architecture.md` now also states).

### State management

- Single persisted document `data: AppData` + `setData` (`src/main.tsx:80`).
- `update(next)` (`src/main.tsx:192-197`) sets state, stores `pendingSave`, resets a **500 ms** timer; `flushSave` (`:164-190`) calls `repo.save`. Flushes on `pagehide`, `visibilitychange` (hidden), and unmount.
- CRUD helpers: `addGame` (`:209-213`), `saveGame` (`:216-223`), `deleteGame` (`:224-231`).
- Non-persisted state: `selectedId`, `libraryFocusId`, `error`, `discoverGame`, `librarySession` (module-level), Journey `session` (module-level, now includes `fitDirection`), `gridSession`.
- Web cloud sync subscribes to repository writes via `web/src/events.ts` pub/sub (`emitDirty`).

### Hooks and utilities

React built-ins only apart from one local helper: `useState`, `useRef`, `useEffect`, `useCallback`, `useMemo`, `useDeferredValue`, `useLayoutEffect`, `lazy`/`Suspense`, `useSyncExternalStore` (web sync), `Intl.Collator` for title sorting. No custom `use*` hook library exists; `useSmoothX` in `src/features/franchises.tsx` is a component-local easing hook.

Utilities: `compareGames` (`src/main.tsx:300-314`), `formatSpan` (`:316-333`), `tsCache`/`dp` date-parse memo (`:292-298`), `emulatedOn` (`src/data/platform.ts:34`), time formatters in `game.ts`, `norm`/`withRetry` in `backloggd.ts`/`sync.ts`.

### Styling and theme

- Theme tokens in `src/style.css`: `--bg`, `--bg-glow-1`, `--bg-glow-2`, `--panel`, `--panel-strong`, `--line`, `--line-soft`, `--text`, `--muted`, `--dim`, `--accent`, `--accent-strong`, `--cyan`, `--rose`, `--success`, `--shadow`, `--radius`, defined per `[data-theme]` block (`aurora`, `moonlight`, `rose`, `solarized`, `graphite`, `arctic`, `canopy`).
- Component-scoped vars: `--p` (rating ring), `--c`, `--rc` (rarity color), `--g` (trophy rarity RGB), `--tc` (chart tone), `--jn-left` (timeline).
- Theme system: `src/domain/theme.ts` defines IDs/metadata/normalize/apply; `AppSettings.theme` is `ThemeId`; `src/main.tsx` applies `data-theme` on theme changes; Settings provides a dropdown; desktop/web loads normalize unknown values to `aurora`.
- ECharts colors are synced from CSS variables at build time via `syncChartTheme()` in `src/domain/stats.ts`, and stats charts remount on theme change. Some hard-coded colors remain in feature CSS/SVG/canvas hotspots, so theme coverage is good but not exhaustive.
- Web-only styling: `web/src/cloud.css`; stale unused copy at `web/worker/src/cloud.css`.

### Important UI workflows

- **Library**: status select, game-type select, favorites toggle, title search, 10-key sort + direction button, PS4 shelf with hover/arrow/wheel navigation, catalog grid with infinite "load more".
- **Add/Edit**: `AddGame` portal modal (`src/features/library-components.tsx:11-259`); optional IGDB lookup when `hasTauri && clientId && clientSecret`, 350 ms debounce, `pick()` fills form; edit is the same modal with `initial` and `saveGame`.
- **Details**: read-only journey panel with "Edit" buttons that open the modal; inline "Favorite" mutation already demonstrates direct `saveGame`.
- **Journey**: lane allocation, LOD (cull below 40% zoom), zoom 10–240%, range presets, Fit All virtualized list with an ascending (oldest first) / descending (newest first) toggle that reorders only the overview rows.
- **Discover**: 9 feeds loaded with 3 concurrent workers, 20 items each; For You/Top Rated/Indie Spotlight/Story-Driven are Rust-ranked, others are direct IGDB queries; "View all" pages of 30 up to 100; hover prefetch.
- **Stats**: category tabs, year filter, tile grid, tabbed chart cards; the "Playtime" category shows logged hours with a note that the year filter selects games by date rather than splitting hours.
- **Settings/Data**: export JSON (strips IGDB/Steam credentials and store tokens), export CSV, import JSON (destructive replace), Backloggd import with progress/report, generic CSV import with progress/report (title or `igdb_id` per row), desktop-only store import with progress/report, IGDB sync with report, library defaults, wipe library.
- **Web additions**: Drive connect/back up/restore/overwrite panel with conflict handling.

---

## 6. Backend Architecture

Tauri command wiring and core backend logic are in `src-tauri/src/lib.rs` (Rust); desktop store connector logic is in `src-tauri/src/stores.rs`. The binary entry is `src-tauri/src/main.rs`. There are no controllers, services, middleware, or background daemon processes.

### Tauri commands (registered in `generate_handler!` at the end of `src-tauri/src/lib.rs`)

All are `async fn` returning `Result<T, String>`; `State<Database>` and `AppHandle` are injected by Tauri and are not passed from JS.

| Command | JS arguments (`src/data/igdb.ts`, `repository.ts`, `src/data/stores/ipc.ts`, `src/data/recommendations.ts`) | Rust result | Purpose |
|---|---|---|---|
| `load_app_data` | none | `Option<JsonValue>` | Read the single `app_state` row |
| `save_app_data` | `data: AppData` JSON | `()` | UPSERT whole document |
| `franchise_cache_load` | `keys: string[]` | `CachedFranchise[]` | Read only the requested franchise cache rows |
| `franchise_cache_save` | `key, sig, games` | `()` | UPSERT resolved franchise games with signature/timestamp |
| `images_path` | none | `String` | Path to app-data `images/` dir |
| `store_image` | `dataUri: string` | `String` (filename) | Decode data URI, write hash-named file |
| `igdb_search` | `query, clientId, clientSecret` | `IgdbHit[]` | Fuzzy `/ ` exact, `& ` ID search |
| `igdb_details` | `id, clientId, clientSecret` | `IgdbGame` | Full metadata, TTB, artwork selection |
| `igdb_images` | `id, clientId, clientSecret` | JSON | Covers/artworks/screenshots gallery |
| `igdb_discover` | `preferredGenres, clientId, clientSecret` | `IgdbDiscover` | Legacy 10-feed snapshot (unused by current UI) |
| `igdb_discover_feed` | `feed, preferredGenres, offset, limit, ...` | `IgdbDiscoverGame[]` | Active paginated feed loader (offset 0–90, limit 1–30) |
| `igdb_series` | `id, clientId, clientSecret` | JSON `{collections, relations, games}` | Traverse `collection_relations` 4 levels up/down (Details) |
| `igdb_franchise` | `name, gameIds, clientId, clientSecret` | `{gameIds, franchises}` | Match franchise by name, fall back through library game IDs |
| `igdb_games_by_ids` | `ids, types?, clientId, clientSecret` | `FranchiseGame[]` | Paged details for up to 500 IDs with optional `game_type` filter |
| `igdb_platforms` | `clientId, clientSecret` | `[id, name][]` | Full platform list in 500-row pages |
| `igdb_sync_check` | `ids, clientId, clientSecret` | `[id, updated_at][]` | Bulk staleness check (500 IDs/request) |
| `igdb_import_batch` | `ids, clientId, clientSecret` | JSON[] | ~3 requests for details + image metadata + TTB |
| `igdb_bundle_contents` | `id, clientId, clientSecret` | JSON[] | Games in a bundle/edition (limit 50) |
| `igdb_external_lookup` | `uid, source, clientId, clientSecret` | `Option<i64>` | Direct IGDB `external_games` lookup for store ids |
| `igdb_epic_lookup` | `uid, title, clientId, clientSecret` | `Option<i64>` | Epic catalog-id lookup by `external_games.uid` with title tie-breaking |
| `save_text_file` | `defaultName, contents, filterName, ext` | `Option<String>` | Native save dialog (text only) |
| `get_backlog_recommendations` | `limit?` | `BacklogRecommendation[]` | Score Backlog games from local play history/taste profiles; returns ranked picks with scores, reasons, similar played-game IDs |
| `stores_status` | `steamConnected` | JSON flags | Connection status for Steam and Epic |
| `stores_auth_url` | `store` | `String` | Epic browser sign-in URL |
| `stores_complete_auth` | `store, code, steamConnected` | JSON flags | Exchange OAuth code; store token in app-data credentials file |
| `stores_fetch` | `store, steamKey?, steamId?` | JSON records | Fetch normalized owned/wishlist records |
| `stores_fetch_achievements` | `store, storeId, steamKey?, steamId?` | JSON counts | Steam achievement totals + earliest unlock |

### IGDB authentication

`IgdbAuth` (`src-tauri/src/lib.rs:166`) holds `Option<(token, Instant)>` behind an async mutex. `igdb_token()` (`:349-376`) POSTs to `https://id.twitch.tv/oauth2/token` with `grant_type=client_credentials`, caches with a 300-second safety margin, and clears the token on 401 (`igdb_post`, `:394-397`) **without retrying**. Credentials are passed per call from frontend settings; Rust does not store them. No HTTP timeout, no 429 handling, and a new `reqwest::Client` is created per request. Franchise calls use `igdb_post_paced` (300 ms spacing); the frontend adds backoff retries and limits concurrency to two franchises.

### Business logic in Rust

- Search prefix handling, `version_parent = null` filtering, escaping.
- Trending via `popularity_primitives` with manual re-ordering.
- Artwork priority selection: key art without logo → with logo → historical → concept → artwork → screenshot.
- Genre matching for "For You" uses up to 3 library genre names.
- Series graph traversal with `HashSet` dedupe and 500-ID chunks.
- Store HTTP and token storage (`src-tauri/src/stores.rs`): Steam free-game flags, keyless wishlist app-id resolution, achievement aggregation, Epic OAuth token exchange, and Epic catalog title resolution.
- Steam mapping lives in TypeScript (`src/data/stores/import.ts`): wishlist/backlog/playing/completed status, first-unlock start date, last-played completion date, and non-zero-total mastery.
- `withRetry` for network errors lives in TypeScript (`src/data/backloggd.ts:137-145`), not Rust.

### Files and media

`images_dir()` → `<app_data_dir>/images`; `store_image` writes `<hash:016x>-<len>.<ext>` files; URLs are `convertFileSrc("<imgDir>/<name>")`. `save_text_file` uses `spawn_blocking` + `tauri_plugin_dialog`. There is no image deletion / orphan cleanup command.

### Security / capabilities

`src-tauri/capabilities/default.json` grants only `core:default`, `opener:default`, `dialog:default` to window `main`. No `fs`, `shell`, `http`, `notification`, `clipboard`, or `log` permissions. CSP and `assetProtocol` scope `$APPDATA/images/**` are in `tauri.conf.json:23-26`. The opener plugin is registered in all desktop builds; store sign-in (`src/features/stores-settings.tsx`) and media links (`src/features/media.tsx`) call `openUrl`, with `window.open` only as a fallback. Epic tokens are managed by Rust in `<app_data>/store-credentials.json`; Steam keys/SteamID64 are optional settings fields. None are exported or sent to the web build.

### Web "backend"

`web/worker/src/index.ts` is a stateless Cloudflare Worker: POST `/igdb/<endpoint>` only, allow-listed endpoints (now including `external_games`, but a redeploy is required for the change to reach the deployed worker), exact-origin CORS from `ALLOWED_ORIGINS`, per-IP limit 40 req/10 s, credential header validation, in-memory token cache, one 401 retry, `Cache-Control: no-store`. It stores nothing persistently.

---

## 7. Database Documentation

### Desktop SQLite

Created by `migrate()` in `src-tauri/src/lib.rs:73-97`:

```sql
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data_json TEXT NOT NULL
);
```

- Database file: `<app_data_dir>/lost-in-sync.sqlite`, identifier `com.lostinsync.desktop` → `%APPDATA%/com.lostinsync.desktop/` on Windows (`lib.rs:1175-1179`).
- Only migration version 1 is checked/inserted (`:85-95`); there is no generic migration runner. `docs/database-schema.md` was corrected to show the actual DDL (no `updated_at` column, no SQL defaults).
- No normalized tables and no relationships/constraints beyond `id = 1`. The typed Rust structs `Game`, `Profile`, `Settings`, `AppData` (`lib.rs:13-69`) are unused dead code; commands take `serde_json::Value`.

### Models (TypeScript, `src/domain/game.ts`)

`AppData = { games: Game[]; profile: Profile; settings: AppSettings; collections?: Collection[] }` (`:50`).

`Game` — key fields:
- Identity/tracking: `id`, `title`, `platform`, `genre`, `tags[]`, `status`, `notes`, `rating?`, `platinumed?`, `favorite`, `cover?`, `backgroundCover?`, `totalSeconds`, `activeSince?`, `createdAt`, `startedAt?`, `finishedAt?`.
- IGDB metadata: `developer?`, `releaseDate?`, `description?`, `genres?[]`, `platforms?[]`, `igdbId?`, `igdbRating?`, `igdbRatingCount?`, `timeAvgSeconds?`, `timeMainSeconds?`, `timeFullSeconds?`, `playedPlatforms?[]`, `emulatedOn?[]`, `screenshots?[]`, `videos?`, `igdbImages?`, `igdbVideos?`, `gameType?`, `gameStatus?`, `franchises?[]`, `themes?[]`, `playerPerspectives?[]`, `igdbUpdatedAt?`, `backloggdId?`, `bundleGames?`.
- Desktop store sync: `storeLinks?: StoreLink[]`, `steamPlaytimeSeconds?`, `lastPlayedAt?`, `storeAchievements?`; `StoreId = "steam" | "epic"`, `StoreLink = { store, id }`, `StoreAchievements = { achieved, total, firstUnlockUnix? }`.
- **No** `playedAt`, `priority`, `played` status, full ownership/medium, price, bought-on, amount-paid, or session-log fields exist (verified by grep).

`Profile = { displayName, bio, accent, picture?, topFive? }` (`:24`).
`AppSettings`: `theme: ThemeId` (`aurora | moonlight | rose | solarized | graphite | arctic | canopy`), `defaultView`, `libraryLayout: "ps4"|"catalog"`, `libraryFullscreen`, `gridSize: "sm"|"md"|"lg"`, `librarySort` (10 keys), `librarySortDirection`, `libraryFilter`, `libraryGenre`, `libraryFavoritesOnly`, optional `journeyRange/journeyZoom/journeyFit` (declared but unused), `igdbClientId?`, `igdbClientSecret?`, `steamApiKey?`, `steamId?`, `lastIgdbSyncAt?`, `libraryGameType?`, `lastStoreSyncAt?`, `storeSyncSource?`. Steam fields are credentials/settings, not game fields, and are stripped from exports.
`Collection = { id, name, description?, items: CollectionItem[], image? }` (`:49`).

### Persistence strategy

- Desktop: externalized images (`img:<filename>`), converted to `asset://` URLs on load; one-shot migration of legacy embedded `data:image/` values (`src/data/repository.ts:58-105`).
- Browser dev: `localStorage["lost-in-sync.data"]`; throws a friendly quota error advising the native app.
- Web: IndexedDB `lostinsync-web` v1, stores `kv` (`data`, `sync.meta`, `vault.key`, `vault.creds`) and `images` (SHA-256-keyed Blobs); serialized writes; IGDB credentials encrypted with a non-extractable AES-GCM key and never stored in the library/backup/export (`web/src/db.ts`, `vault.ts`, `codec.ts`, `repository.web.ts`).
- Import/export: portable JSON (images inline as data URIs), CSV export with fixed header; IGDB/Steam credentials and store tokens are stripped on export, current-device keys are preserved on import, and optional store ids survive round-trips (`src/features/settings-data.tsx`, `src/data/stores/types.ts`).
- Web cloud snapshot: `lost-in-sync.snapshot.json.gz`, `FORMAT = 1` (`web/src/sync.ts:14-16`), with `img-<hash>` blobs and conflict detection via `remote.modifiedTime`.

### Important queries

Only SQLite queries are the migration statements and:
- `SELECT data_json FROM app_state WHERE id = 1` (`lib.rs:104`)
- `INSERT INTO app_state (id, data_json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json` (`:115-125`)
- `SELECT COUNT(*) FROM schema_migrations WHERE version = 1` (`:85`)

All filtering/sorting/aggregation happens in TypeScript.

---

## 8. Core Application Workflows

| Workflow | Implementation | Status |
|---|---|---|
| Create game | `AddGame` modal → `addGame` → 500 ms debounced save | Implemented |
| Edit game | Details "Edit" → `AddGame initial={game}` → `saveGame` | Implemented (requires opening modal) |
| Delete game | Details "Delete" → `deleteGame` → navigate to library | Implemented (no per-game confirmation) |
| Change status/date/platinum | Only via the `AddGame` edit form (`library-components.tsx:110-161`) | Implemented but indirect |
| Search | Title substring only (`src/main.tsx:365`) | Implemented, limited |
| Filter | Status, IGDB game type (`matchesGameType`), favorites only | Implemented; docs claim more |
| Sort | `SORT_OPTIONS` + `compareGames` + direction button; sorts a copy, not stored order | Implemented |
| Import JSON | `StorageSection.importJson` replaces library, keeps current credentials | Implemented, destructive |
| Export JSON/CSV | `exportJson`, `exportCsv`, `saveOrDownload` (`settings-data.tsx`) | Implemented |
| Import Backloggd | `importBackloggd` with dedupe by `igdbId`, retry, abort, report | Implemented; Tauri + credentials only |
| Import generic CSV | `CsvImportSection` → `parseCsv` → `importCsv`; `igdb_id` first (title ignored), else strict then generic title search; dedupe by id/title, batch details, abort, report | Implemented; requires IGDB credentials, also available in web build |
| Desktop store import | `StoresSection` → `fetchStoreRecords`/`importFromStore` → Rust `stores_*`; dedupe by store id, IGDB match, status/date/mastery mapping, reports | Implemented; live Steam re-fetch QA pending |
| IGDB search/details/import | `igdb.ts` wrappers + Rust proxy; `draftFromIgdb` creates unsaved game | Implemented |
| IGDB metadata sync | `syncWithIgdb` → `igdbSyncCheck` → `igdbImportBatch` in chunks of 100 → `buildPatch`/`applyPatches`; writes `lastIgdbSyncAt` | Implemented; only IGDB-owned fields |
| Image storage | data URI → `store_image` → `img:` ref (or IndexedDB blob on web) | Implemented; no deletion command |
| Drive backup (web) | `web/src/sync.ts` push/pull/check, dirty queue, conflict UI | Implemented; Google sign-in required |

---

## 9. API Reference

There is no public HTTP API for the desktop app. "API" means Tauri IPC commands (§6) and the web proxy.

**IGDB proxy (Cloudflare Worker, `web/worker/src/index.ts`):**

| Method | Path | Headers / body | Response |
|---|---|---|---|
| `OPTIONS` | `/igdb/<endpoint>` | `Origin` must match `ALLOWED_ORIGINS` | `204` with CORS headers, else `403` |
| `POST` | `/igdb/{games\|game_time_to_beats\|image_types\|artworks\|covers\|screenshots\|popularity_primitives\|collection_relations\|collections\|platforms\|external_games}` | `Content-Type: text/plain`, `X-Client-Id`, `X-Client-Secret`; raw Apicalypse body ≤ 6000 chars | IGDB JSON (`Cache-Control: no-store`), `401/413/429/502` on errors |

Client call shape: `web/src/igdb.web.ts:26-49` `post()` → `fetch(`${VITE_IGDB_PROXY_URL}/igdb/${endpoint}`, { cache: "no-store", referrerPolicy: "no-referrer" })` with a 260 ms request slot and one 1200 ms-delayed retry on 429. Store links use `igdbExternalGames`: try `/igdb/external_games`, then fall back to a `games` query with nested `external_games.*` fields if the deployed worker returns `404 / Not found`.

**Tauri command invocation shape (examples):**

```ts
invoke("igdb_search", { query, clientId, clientSecret })          // IgdbHit[]
invoke("igdb_discover_feed", { feed, preferredGenres, offset, limit, clientId, clientSecret })
invoke("store_image", { dataUri })                                // filename
invoke("save_app_data", { data })                                 // ()
```

Rust parameter names are snake_case (`client_id`), Tauri maps JS camelCase keys.

**IGDB REST endpoints used by Rust** (all POST to `https://api.igdb.com/v4/<endpoint>`): `games`, `popularity_primitives`, `game_time_to_beats`, `image_types`, `artworks`, `covers`, `screenshots`, `collection_relations`, `collections`, `platforms`, `external_games`. Image CDN: `https://images.igdb.com/igdb/image/upload/t_{size}/{image_id}.jpg` (`cover_big_2x`, `1080p`, `screenshot_big`, `cover_small`). `docs/igdb-image-endpoints.md` was corrected; note the remaining divergence: desktop uses `cover_big_2x` for main covers while `web/src/igdb.web.ts` still uses `cover_big`.

---

## 10. Environment and Configuration

**Environment variable names only — never store or document real values:**

| Name | Where declared / read | Purpose |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | `web/src/env.d.ts:3`, `web/src/drive.ts:3` | Google OAuth client ID (public by design) |
| `VITE_IGDB_PROXY_URL` | `web/src/env.d.ts:4`, `web/src/igdb.web.ts:11`, `web/vite.config.ts:57-58` | Cloudflare Worker base URL |
| `ALLOWED_ORIGINS` | `web/worker/wrangler.toml:6`, `web/worker/src/index.ts:4,53` | Worker CORS allow-list (comma-separated origins) |

`web/.env.local` exists locally but is gitignored; **no `web/.env.example` exists** despite `web/README.md:14` instructing users to copy one. The web config loads only `VITE_`-prefixed vars from `web/` (`envDir`).

**Configuration files / important values:**

- `package.json`: scripts `dev`, `build` (`tsc --noEmit && vite build`), `typecheck`, `test` (`vitest run`), `tauri:dev`, `tauri:build`.
- `tsconfig.json`: strict, `noEmit`, `jsx: react-jsx`.
- `src-tauri/tauri.conf.json`: identifier `com.lostinsync.desktop`, version `0.1.0`, `devUrl http://localhost:5173`, `frontendDist ../dist`, fullscreen 1920×1080 window, CSP, asset protocol, Android suffix `.debug`.
- `web/vite.config.ts`: dev port `5174`, build output `web/dist`, build-only CSP meta injection, three module swaps.
- `web/worker/wrangler.toml`: worker `lis-igdb-proxy`, `main = src/index.ts`, compatibility date `2025-01-01`.
- `vercel.json`: SPA rewrite to `/index.html` — **conflicts with `web/README.md` which says Cloudflare Pages**; actual production host must be verified.
- `src-tauri/capabilities/default.json`, `src/data/repository.ts:3` (localStorage key `lost-in-sync.data`), `scripts/check-environment.ps1` (Windows tool check).

**Secret handling:** Desktop IGDB credentials and the Steam Web API key/SteamID64 are plain fields in `app_state.data_json` (all excluded from exported JSON). Epic OAuth tokens are stored by Rust in `<app_data>/store-credentials.json`, never in `AppData`. Web credentials are AES-GCM encrypted in IndexedDB with a non-extractable key and never appear in the library, Drive snapshot, or export. The worker receives IGDB credentials in request headers only and keeps no persistent store; store settings are desktop-only.

---

## 11. Development and Deployment

```powershell
# Install / web dev mode (localStorage)
pnpm install
pnpm dev                 # http://localhost:5173

# Native Tauri dev (add Cargo to PATH first on Windows)
$env:Path = "C:\Users\$env:USERNAME\.cargo\bin;$env:Path"
pnpm tauri:dev

# Checks
pnpm typecheck
pnpm test
pnpm build

# Release installer (Windows installer must be built on Windows)
pnpm tauri:build
# output: src-tauri/target/release/bundle/nsis/ or msi/

# Web build (from project root)
npx vite --config web/vite.config.ts                 # http://localhost:5174
npx vite build --config web/vite.config.ts           # output web/dist
cd web/worker && npx wrangler deploy                 # IGDB proxy
```

**Prerequisites:** Node 18+, pnpm 8+, Rust stable via rustup (add `%USERPROFILE%\.cargo\bin` to PATH on Windows); `scripts/check-environment.ps1` verifies them. Web additionally needs `wrangler` (fetched by `npx`; not a declared dependency) and configured env vars plus a Google OAuth client.

**Deployment:** Desktop = self-contained NSIS/MSI installers. Web = static `web/dist` on Vercel (`vercel.json`) or Cloudflare Pages (README); Cloudflare Worker for IGDB; Google OAuth origins must include localhost:5174 and production URL. Windows SmartScreen warning applies to unsigned installers.

**Platform notes:** Windows-only installer must be built on Windows. Web fullscreen is monkey-patched to require F11 (`web/src/entry.tsx:9-15`) to avoid the desktop auto-fullscreen effect in `src/main.tsx:95-127`.

---

## 12. Coding Conventions

- **Naming:** PascalCase components (`AppLayout`, `PS4Card`, `Details`); camelCase functions/state; `UPPER_SNAKE` constants (`STATUSES`, `GAME_TYPES`, `FIELDS`, `CHUNK`, `TTL`).
- **Types:** `import type { ... }` for type-only imports; props typed inline in destructured parameters rather than exported interfaces; strict TypeScript.
- **Components:** Function components + hooks; `memo` for hot list cards; `createPortal` for the `AddGame` modal; feature CSS co-located and imported by the feature module; `lazy` only for Stats.
- **State:** Explicit updater functions with debounced persistence; module-level mutable session objects for non-persisted prefs; `useRef` for timers/DOM/RAF state.
- **Async/errors:** `void promise.then().catch()`; per-feature `Notice`/`error` strings with `instanceof Error ? e.message : String(e)`; `withRetry` for network operations; `AbortController` for long imports/sync; global `window.error` / `unhandledrejection` banner and `GlobalErrorBoundary` (`src/main.tsx:1061-1095`).
- **Formatting:** 2-space indent, double quotes, semicolons in most files; `data/*` and `stats.ts` use denser one-line style with fewer semicolons. No ESLint/Prettier config or script.
- **Tests:** 9 Vitest files / 67 pure-function tests — `game` 2, `journey-sort` 4, `playtime` 8, `store-links` 5, `stores/sources` 2, `stores/steam` 9, `stores/match` 12, `stores/import` 21, `franchise` 4 — plus Rust unit tests in `src-tauri/src/{stores.rs,lib.rs}`. With `ALL_TYPES = true`, 66/67 pass because the franchise filter test expects `false`; all pass when it is restored. `jsdom` is installed but no `test.environment` is configured in `vite.config.ts`; DOM tests need `// @vitest-environment jsdom` or config.
- **Architecture rule:** Prefer extending existing components/utilities over new abstractions; keep web changes under `web/`; keep new native commands in `lib.rs` and registered in `generate_handler!`.

---

## 13. Important Implementation Details

- **Bounding IGDB caches:** `memo()` (`src/data/igdb.ts:39-52`) implements LRU + 20-minute TTL with failed-promise eviction; limits: details 150, images 60, feeds 60, legacy discover 10, bundle contents 40, external games 60. Web mirrors this in `web/src/igdb.web.ts` including `igdbExternalGamesCached`.
- **Image externalization:** `PFX = "img:"` (`src/data/repository.ts:41`); `externalize()` writes via `store_image`; `fileGame()`/`convertFileSrc()` produce `asset://` URLs; `DefaultHasher` filenames are non-cryptographic and have no orphan cleanup.
- **Sync allow-list:** `FIELDS` (`src/data/sync.ts:28-47`) is the authoritative list of IGDB-owned fields; user-owned fields (status, rating, notes, priority-like fields) must never be added. `buildPatch` avoids blanking empty IGDB fields and preserves user-uploaded data: covers.
- **Library/Journey prefs:** `librarySession` (`domain/library-session.ts:36`) and Journey `session` (`features/journey.tsx:135`) are memory-only; `queuePrefs` at `journey.tsx:409-414` explicitly says prefs are "never saved to the database". `AppSettings.journeyRange/zoom/fit` and `defaultView`, `libraryGenre` are declared but unused.
- **Journey ordering:** `base.sorted` uses `sortJourneyRows(items, "asc")` (`src/domain/journey-sort.ts`, start + `id` tie-break); Fit All gets a separate `fitRows` array reversed by direction while timeline geometry, lane colours and palette stay chronological (`journey.tsx`).
- **Journey LOD:** culling below `LOD_Z = 0.4`; Fit All uses a positional virtual window and resets `scrollTop` when `base` changes (`journey.tsx:298`).
- **Franchise completion:** `groupByFranchise` assigns each game to every named franchise and keeps only groups with a completed game; `buildFranchise` merges IGDB results with library games by `igdbId` then normalized title, collapsing remakes/editions into one slot. `ALL_TYPES = true` is an active diagnostic that counts every game type; `false` restores `WANTED_TYPES`. `FranchiseView` loads one `franchises` lookup plus 100-ID game chunks, caches resolved rows in SQLite `franchise_cache` for 30 days on desktop (memory only on web), probes only visible keys, retries with backoff, refreshes stale rows, and shows per-row progress instead of a header bar. It virtualizes rows/slots/ribbons and drives horizontal scrolling with the local `useSmoothX` hook.
- **Discover preview:** `DiscoverGameDetails` passes `preview={!savedGame}` into `Details`. Unsaved IGDB results hide `MY JOURNEY`, status fallback, `Played on`, collection and delete actions; `draftFromIgdb` starts them as `Backlog` with `playedPlatforms: []` so adding/favoriting never implies a completed playthrough.
- **Stats:** `CATEGORIES` has 13 visible entries; the new `"playtime"` category aggregates `Game.totalSeconds` via `src/domain/playtime.ts` (`playtimeHours`/`summarizePlaytime`/`playtimeBuckets`) and is backed by `play` in the `index()` row. IGDB `timeAvgSeconds` still feeds `len` and appears only as a separate, muted "IGDB average (estimate)" series in the Playtime comparison chart. The older `"length"` category remains implemented (`length()`, registered in `BUILD`) but commented out of `CATEGORIES` — left intentionally untouched.
- **Web `hasTauri = true`** (`web/src/igdb.web.ts:9`) deliberately enables desktop-looking IGDB UI in the browser; capability checks like `hasTauri && creds` gate import/sync in settings.
- **Exact storefront links:** `igdb_external_games` / `igdbExternalGames` read IGDB `external_games`; `storeLinksFromExternal` drops invalid URLs, deduplicates by source and orders known storefronts. Details shows two icon-only chips plus a `+N` hover/focus popover; `StoreIcon` supplies transparent brand SVGs. The web client falls back to nested `games.external_games.*` when the deployed worker returns 404 for the direct endpoint.
- **Web build swap caveat:** `swapModules()` matches resolved module IDs globally; a web file may import the offline original it wraps (guarded at `web/vite.config.ts:30`), but any new shared import of those three paths will be swapped.
- **Debug instrumentation:** `flushSave` logs payload size and a `console.table` of field sizes on every save (`src/main.tsx:173-188`); the former catch-block error reporting is commented out (`:169-171`).
- **Generic CSV import:** `parseCsv` (`src/data/stores/import.ts:355-374`) handles BOM, quoted cells, CRLF and auto-detects `,` vs `;` from the header; `headerKey` normalizes headers to snake_case, so `igdb id`/`IGDB_ID` both work. `importCsv` requires a `title` or `igdb_id` header; a row with a valid `igdb_id` is fetched by id and the CSV title is never compared (it can be empty or wrong), while a missing/not-found id falls back to `resolveTitle` (strict `/ ` then generic search). Details are fetched in `igdbImportBatch` chunks (shared `CHUNK`), cancellation is checked between chunks and rows, and duplicates are checked against the live library and earlier rows. `playtime` accepts `12h 30m`, `12:30`/`12:30:00` or a bare number of minutes; `playtime_hours`/`total_hours` treat a bare number as hours. `mastery`/`favorites` accept 1/0, true/false, yes/y/t. `played_on` splits on `;` or `,`. Games are built with `buildStoreGame` but `storeLinks` is cleared, so they are ordinary local games. The UI (`CsvImportSection`, `src/features/settings-data.tsx:365-477`) uses `hasTauri && creds` gating — web sets `hasTauri = true`, so the panel is available there too — and offers confirm, progress, cancel-after-batch, a grouped report and clipboard copy.
- **Dashboard motion:** `useReveal` (`src/features/dashboard.tsx:38-49`) is a local `IntersectionObserver` hook (threshold `0.35`, disconnect after first intersection). `Odometer` (`:51-71`) renders each zero-padded digit as a 20-cell `0-9-0-9` reel translated by `-(digit + 10) * 5%` when revealed, with per-digit delay/duration; the readable value stays in `aria-label` on `<strong>`. `fav-slot` exposes `--d = |i - 2|` for center-out staggering. In `overview.css`, `.fav-section` (not `.fav-stage`) carries `banner-in` and `.fav-scroll` has `overflow-y: hidden` to avoid a transient scrollbar; `.big-stat > span` targets only the direct-child label so the digit reels keep their `1em` window. All new animations are disabled under `prefers-reduced-motion`, which also hides `.fav-wave-flow`.
- **Auto fullscreen:** `src/main.tsx:95-127` requests fullscreen on first interaction; web overrides `Element.prototype.requestFullscreen` to require F11.
- **Stale worker frontend:** `web/worker/src/{entry.tsx,login-gate.tsx,sync.ts,cloud.css}` are dead copies importing non-existent modules; `wrangler.toml` builds only `src/index.ts`.
- **Backloggd importer and IGDB sync exist** (`src/data/backloggd.ts`, `src/data/sync.ts`); `docs/roadmap.md` now lists both under completed milestones.

---

## 14. Known Limitations

1. **Scalability:** full `AppData` JSON stringify + IPC + SQLite UPSERT on every mutation; a 1000–3000 game library with large metadata can produce multi-MB writes (see `docs/performance-optimization-report.md`).
2. **No normalized SQL**, no per-field queries, no schema evolution beyond a hard-coded version 1.
3. **Uncompressed assets:** ~34 MB of PNGs under `src/images/` (5 trophy backgrounds up to ~3.2 MB each); eagerly globbed in `src/features/trophies.tsx`. VRAM/disk cost per the performance report (rank 1).
4. **Native IGDB auth:** 401 clears token and errors without retry; no HTTP timeout/429 handling; new `reqwest::Client` per request.
5. **Orphaned images:** deleting a game does not delete its stored image files; no cleanup command.
6. **Errors:** `error` is set on load/save failure but never cleared on success and has no dismiss control; Tauri `load()` swallows errors and returns `defaultData`, which can look like an empty library.
7. **Unknown routes** render an empty page (no 404).
8. **Search is title-only**; docs claim developer/genre/note search and genre/tag filters that do not exist.
9. **Theme is static**; many hard-coded colors and ECharts JS constants prevent simple theming.
10. **No notification/reminder infrastructure**, no currency handling, no PWA/service worker/manifest, no Android project. Steam/store import is implemented but still needs live re-fetch QA.
11. **Declared-but-unused code:** `AppSettings` journey/default fields, Rust domain structs, `tauri-plugin-log` and `log` crates, `libraryGenre`, `length` stats category.
12. **Web:** no `web/.env.example`; stale dead worker frontend copies; `new URL()` on a malformed proxy URL throws at config load; `opener:default` granted but plugin debug-only; Drive docs say `drive.appdata` but code uses `drive.file` and a visible root folder; deploy target docs conflict (Vercel vs Cloudflare Pages).
13. **React runtime 18 vs types 19** mismatch (not verified as a build failure).
14. **Test coverage improved but still UI-light:** 8 Vitest files / 57 tests plus 3 Rust unit tests; no React tests, lint/format config, or configured jsdom environment.
15. **Documentation drift partially resolved:** root `README.md` and store-related `docs/` files were refreshed on 2026-11-21, but `web/README.md` still contains stale claims (deploy target, Drive scopes, `.env.example`); treat code as authoritative for those.

---

## 15. AI Agent Instructions

1. Read `PROJECT_CONTEXT.md` → `PROJECT_STATUS.md` → relevant entry in `future_implementation_guide.md` before exploring source.
2. Treat documented paths as starting points; verify the file and symbol still exist (paths and line numbers can drift).
3. Inspect only the relevant files and their immediate dependencies. Do not scan the entire repository or `node_modules`/`src-tauri/target`.
4. Follow existing conventions: extend `AppData`/`Game` in `src/domain/game.ts`, persist through `src/data/repository.ts`, wire UI in the smallest existing component, add native commands to `src-tauri/src/lib.rs` and register them.
5. If you add an export to `src/data/igdb.ts`, mirror it in `web/src/igdb.web.ts`. If you add a web-only settings section, wrap it via `web/src/settings-data.web.tsx`.
6. Never add user-owned fields to `src/data/sync.ts`'s `FIELDS` allow-list.
7. Keep Android work in a separate directory; keep web work under `web/`; do not introduce Android dependencies into desktop/web builds.
8. No new dependency without justification; prefer browser/Rust APIs already in use.
9. Preserve functionality; run `pnpm typecheck` and `pnpm test` before finishing. Do not run `pnpm build` (or the web build) unless explicitly requested.
10. Update `PROJECT_STATUS.md` on progress, and update this file / the implementation guide when architecture or file locations change.
