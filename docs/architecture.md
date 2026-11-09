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

### `src/hooks/`
- `useSmoothScroll` — RAF-based smooth-scroll helper used by the library grid.

### `src/components/`
Shared presentational components reused across features:
- `layout.tsx` — `AppLayout` with the collapsible sidebar and navigation rail
- `shared.tsx` — `Header`, `GameMini`, `StarRating`, `TrophyToggle`, `Stat`, `Empty`, `formatDate`

### `src/features/`
Each subdirectory is a self-contained view or feature slice:

| Feature | Description |
|---|---|
| `dashboard/` | Activity feed, quick stats, recently added games |
| `library-components/` | `AddGame` modal/form, game cards, detail pane |
| `journey/` | PixiJS v8 WebGL interactive timeline |
| `discover/` | IGDB discovery feeds, search bar, `DiscoverGameDetails` modal |
| `trophies/` | Platinum / trophy tracking view |
| `media/` | `MediaSection` — screenshots carousel + YouTube embed player |
| `series/` | Franchise hierarchy browser powered by `igdb_series` |
| `bundle/` | Bundle/edition contents via `igdb_bundle_contents` |
| `overview/` | `ProfileSection`, `CollectionActions` |
| `settings/` | IGDB credentials, appearance, default view |

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

## PixiJS WebGL Journey Timeline

The `JourneyView` feature (`src/features/journey/`) renders the game history timeline using **PixiJS v8** with WebGL acceleration.

### Architecture
- A `<canvas>` element is managed by a PixiJS `Application` instance created on mount and destroyed on unmount.
- Each game that has a `startedAt` date is placed as a node on the timeline; `finishedAt` determines the node's x-extent.
- Nodes are `PIXI.Graphics` + `PIXI.Text` objects laid out by a custom branching algorithm to avoid overlap.
- Zoom and pan are implemented via pointer events and wheel handlers that update the PixiJS stage transform.
- The timeline respects the `journeyRange` and `journeyZoom` settings stored in `AppSettings`.

### Key design decisions
- WebGL (PixiJS) is used instead of SVG/Canvas 2D for smooth performance with large libraries.
- The PixiJS app is instantiated imperatively inside a `useEffect`; React does not manage the canvas children.
- Timeline state (zoom, viewport offset) is kept as local refs — not in React state — to avoid re-render overhead on every pointer move.

---

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Single JSON blob in SQLite | Avoids complex migrations while the data model is still evolving. The entire `AppData` document is versioned as one record. |
| `AppRepository` adapter | Keeps the UI identical between Tauri (SQLite) and browser (localStorage) environments, enabling fast Vite iteration without the full Rust compile. |
| IGDB proxy in Rust | CORS prevents direct browser requests to IGDB; the Rust backend holds the credentials and handles token refresh. |
| PixiJS for timeline | SVG doesn't scale to hundreds of nodes without jank; WebGL compositing gives smooth 60 fps pan/zoom. |
| CSS custom properties only | No utility framework means zero build-time CSS overhead and straightforward theming via a single variable override block. |
