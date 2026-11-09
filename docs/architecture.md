# Architecture

## Overview

Lost in Sync follows a layered architecture where domain logic, persistence, and UI are kept strictly separate. The Rust backend acts as a thin command layer over SQLite and an IGDB proxy; React state drives the entire UI from a single `AppData` document.

```
┌─────────────────────────────────────────────┐
│              React Frontend (Vite)           │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │ features/│  │components│  │  domain/  │  │
│  │ (views)  │  │ (shared) │  │ (types+fn)│  │
│  └────┬─────┘  └──────────┘  └───────────┘  │
│       │  React state (AppData)               │
│       │  invoke() / AppRepository            │
└───────┼─────────────────────────────────────┘
        │ Tauri IPC (serde_json)
┌───────┼─────────────────────────────────────┐
│       │       Rust / Tauri v2 Backend        │
│  ┌────▼──────────────────────────────────┐  │
│  │  Tauri Commands (lib.rs)              │  │
│  │  load_app_data / save_app_data        │  │
│  │  igdb_search / igdb_details / …       │  │
│  └────┬──────────────┬────────────────── ┘  │
│       │              │                       │
│  ┌────▼────┐   ┌─────▼──────────────────┐   │
│  │ SQLite  │   │  IGDB API (via reqwest) │   │
│  │  .sqlite│   │  api.igdb.com/v4/       │   │
│  └─────────┘   └────────────────────────┘   │
└─────────────────────────────────────────────┘
```

---

## Frontend Structure

### `src/domain/`
Pure TypeScript — no React, no I/O.

| File | Contents |
|---|---|
| `game.ts` | `Game`, `Status`, `AppData`, `AppSettings`, `Profile`, `Collection` types; `formatPlaytime`, `formatHours`, `formatCount` helpers |
| `gametype.ts` | IGDB game-type constants and `matchesGameType` predicate |
| `library-session.ts` | Session-scoped library sort/filter preferences, `libraryDefaults`, `librarySession` |

### `src/data/`

| File | Purpose |
|---|---|
| `repository.ts` | `AppRepository` interface + `createAppRepository()` factory. In Tauri it calls `load_app_data` / `save_app_data`; in browser it falls back to `localStorage`. |
| `igdb.ts` | Typed wrappers around every IGDB Tauri command. `igdbDetailsCached` caches detail responses for the session so navigating back doesn't re-fetch. |

### `src/components/`
Shared presentational components reused across features:
- `layout.tsx` — `AppLayout` with the collapsible sidebar and navigation rail
- `shared.tsx` — `Header`, `StarRating`, `TrophyToggle`, `Empty`, `formatDate`

### `src/features/`
Self-contained view components and stylesheets:

| Feature | Description |
|---|---|
| `dashboard.tsx` | Activity feed, quick stats, recently added games |
| `library-components.tsx` | `AddGame` modal/form, filter drawer, game detail hero drawer |
| `journey.tsx` | Interactive timeline with SVG vector strands and React DOM LOD rendering |
| `discover.tsx` | IGDB discovery feeds, search bar, feed pagination |
| `trophies.tsx` | Platinum / trophy tracking view & badge gallery |
| `stats.tsx` | Apache ECharts analytics charts (playtime, status breakdown, releases) |
| `media.tsx` | `MediaSection` — screenshots carousel + YouTube embed player |
| `series.tsx` | Franchise hierarchy browser powered by `igdb_series` |
| `bundle.tsx` | Bundle/edition contents via `igdb_bundle_contents` |
| `overview.tsx` | `ProfileSection`, `CollectionActions` |
| `settings-data.tsx` | IGDB credentials, appearance defaults, full JSON export/import |

### `src/main.tsx`
The application root. Responsibilities:
- Loads `AppData` from the repository on mount
- Owns the single `data` state and the `setData` updater passed to all features
- Implements React Router-based view switching (`/library`, `/journey`, `/trophies`, etc.)
- Renders `AppLayout` with the active view as children

---

## Backend (Tauri Commands)

All commands live in [`src-tauri/src/lib.rs`](../src-tauri/src/lib.rs).

### Persistence commands

| Command | Signature | Description |
|---|---|---|
| `load_app_data` | `() → Option<JsonValue>` | Reads the single `app_state` row and deserializes the JSON blob |
| `save_app_data` | `(data: JsonValue) → ()` | Upserts the full `AppData` document into `app_state` |
| `save_text_file` | `(name, contents, filter, ext) → Option<String>` | Native save-file dialog; used for JSON export / backup |

### IGDB proxy commands

The backend holds a cached `IgdbAuth` token (refreshed automatically before expiry).

| Command | Description |
|---|---|
| `igdb_search` | Fuzzy, exact (`/ `), or ID (`& <id>`) game search → `Vec<IgdbHit>` |
| `igdb_details` | Full game metadata + TTB + artwork selection → `IgdbGame` |
| `igdb_images` | All covers, artworks, screenshots for a game → gallery JSON |
| `igdb_discover` | Multi-feed discovery snapshot (10 feeds, 20 items each) |
| `igdb_discover_feed` | Paginated single-feed loader (offset, limit up to 30) |
| `igdb_series` | Franchise tree traversal (up 4 levels, down 4 levels) → collections + games |
| `igdb_bundle_contents` | Games belonging to a bundle/edition |
| `igdb_platforms` | Full IGDB platform list (paginated, 500 per page) |
| `igdb_sync_check` | Bulk `updated_at` check for owned games |
| `igdb_import_batch` | Batch details + images + TTB in ~3 requests (used by bulk-add flow) |

---

## Data Flow

```
User action (e.g. "Add game")
  → React calls setData(updatedGames)
  → useEffect detects change, calls repo.save(data)
  → repository invokes save_app_data via Tauri IPC
  → Rust serializes AppData to JSON string
  → SQLite UPSERT into app_state WHERE id = 1
```

**On startup:**
```
App mounts
  → repo.load() → load_app_data
  → Rust reads data_json from app_state
  → deserializes to serde_json::Value
  → React receives JSON, merges with defaultData
  → setData(merged) → renders library
```

---

## Interactive Journey Timeline

The `JourneyView` feature (`src/features/journey.tsx`) renders the game history timeline using **React DOM + SVG** vector strands with Level-of-Detail (LOD) optimizations.

### Architecture
- Uses vector `<svg>` paths for cubic bezier connecting strands and axis tick marks.
- Game cards on the timeline are rendered in React DOM nodes with hardware-accelerated CSS `transform` for pan/zoom.
- Each game that has a `startedAt` date is positioned as a node; `finishedAt` determines the horizontal span.
- Games are sorted and slotted into lanes by a dynamic branching algorithm (`lane` allocation) to avoid overlapping strands.
- Short/single-day completions are rendered as vertical pillars (`SHORT = 5`); long-form playthroughs branch out smoothly.
- **Level-of-Detail (LOD)**: When zoomed out below `LOD_Z = 0.4`, covers, titles, and dates are culled to minimize DOM overhead, rendering single strands only.
- Controls include zoom slider / pinch / wheel (10% to 240%), range filtering (`all`, `month`, specific year), and a high-density `Fit All` overview mode.

### Key design decisions
- Pure React + SVG avoids heavyweight external canvas dependencies while retaining crisp vector rendering across high-DPI displays.
- LOD culling keeps DOM node counts manageable even with expansive collections.
- Timeline navigation state (zoom, viewport offset) is clamped and throttled to maintain responsive 60 fps interactions.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Single JSON blob in SQLite | Avoids complex migrations while the data model is still evolving. The entire `AppData` document is versioned as one record. |
| `AppRepository` adapter | Keeps the UI identical between Tauri (SQLite) and browser (localStorage) environments, enabling fast Vite iteration without the full Rust compile. |
| IGDB proxy in Rust | CORS prevents direct browser requests to IGDB; the Rust backend holds the credentials and handles token refresh. |
| Interactive SVG timeline with LOD | Avoids heavy WebGL library overhead while providing crisp vector curves and LOD DOM culling at high zoom-out levels. |
| CSS custom properties only | No utility framework means zero build-time CSS overhead and straightforward theming via a single variable override block. |
