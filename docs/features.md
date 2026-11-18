# Feature Documentation

> **Verified against source on 2026-11-19.** This describes what is implemented today, not planned functionality. The full status breakdown is in `agent/PROJECT_STATUS.md`.

Lost in Sync is a personal game library OS built with desktop-first principles. It provides a cohesive interface to catalogue, discover, analyze, and reminisce about your gaming journey.

---

## 1. 📚 Library Management

The Library view is the operational heart of the application (`src/main.tsx`).

- **Status Workflow**: Games are assigned one of 7 statuses (`Backlog`, `Wishlist`, `Playing`, `Completed`, `Shelved`, `Abandoned`, `On hold`).
- **Display Modes**:
  - **PS4 Shelf**: focused cover carousel with spring transitions, hover/arrow/wheel navigation, and optional fullscreen mode (default).
  - **Catalog Grid**: sortable card grid with sizes `sm`, `md`, `lg` and incremental "load more".
- **Filtering & Search**:
  - Real-time **title-substring** search only (developer/genre/note search is not implemented).
  - Filter pills for status, an IGDB game-type filter, a favorites-only toggle, and a genre setting in defaults (the genre filter is declared but not consumed).
  - Ten sort keys with an ascending/descending direction toggle (`recent`, `completion`, `playtime`, `rating`, `igdbRating`, `title`, `releaseDate`, `avgTime`, `mainTime`, `fullTime`).
- **Game Details View**: `Details` in `src/main.tsx` features backdrop artwork, rating ring, IGDB score, Time-To-Beat tiles, played-platform chips, notes, series/bundle links, media, and a read-only journey panel. Status/date fields are edited by opening the `AddGame` modal; an inline Favorite toggle already updates directly.

---

## 2. 🗺️ Game Journey (Interactive Timeline)

The Game Journey visualizes your gaming life along an interactive, chronologically ordered timeline.

- **Dynamic Vector & DOM Canvas**: Crisp SVG connecting strands plus hardware-accelerated DOM nodes with Level-of-Detail (LOD) culling.
- **Branching Layout**: Games are slotted by `startedAt`/`finishedAt`; pillars represent single-day completions, branching strands represent long-form playthroughs, and lanes are color-coded.
- **LOD**: Nodes collapse to single strands below 40% zoom (`LOD_Z = 0.4`).
- **Navigation Controls**: Pointer/wheel pan, zoom 10–240% (slider/pinch/wheel), range presets (`All`, `Month`, year), and a virtualized `Fit All` chronological list.
- **Preferences**: Zoom/range/fit state is session-only and is never persisted.

---

## 3. 🔍 Discover & IGDB Integration

IGDB integration runs through Tauri Rust commands on desktop and a stateless Cloudflare Worker in the web build.

- **Curated Feeds**: 10 feeds — Trending, Latest, Upcoming, Top Rated, Anticipated, Hidden Gems, Indie, Story-rich, and personalized "For You" variants. The active loader is `igdb_discover_feed` (paginated); `igdb_discover` is a legacy snapshot still present but unused by the UI.
- **Search Capabilities**: Fuzzy search, exact title prefix via `/ <title>`, and ID lookup via `& <id>`.
- **One-Click Import**: `draftFromIgdb` creates an unsaved game from IGDB results with cover, backdrop, summary, release date, platforms, genres, themes, and Time-To-Beat metadata.
- **Franchise Explorer**: Series tree traversal up to 4 levels up/down via `igdb_series`.
- **Caching**: Bounded LRU caches with a 20-minute TTL; feed cards are prefetched on hover.

---

## 4. 🏆 Trophies & Platinum Tracking

- **Six Rarity Tiers**: `common`, `uncommon`, `rare`, `legendary`, `mythic`, and `lostinsync__` (the top tier), evaluated by `src/domain/trophies.ts`.
- **Platinum Toggle**: `TrophyToggle` is editable in the `AddGame` form and read-only in Details.
- **Showcase Gallery**: Badge gallery with trophy backgrounds; profile banner shows the player's top badge via `RarityBadge`.

---

## 5. 📊 Statistics & Analytics

`src/domain/stats.ts` builds 13 visible categories rendered as tiles and tabbed ECharts charts, including a Playtime category backed by `src/domain/playtime.ts`.

- **Overview**: Library size, completion rate, total hours.
- **Activity / eras**: Completion pace, year-over-year activity.
- **Playtime**: User-recorded `totalSeconds` — total/mean/median, longest and shortest games, distribution bands, hours by status and genre, plus a separate IGDB-estimate comparison.
- **Genres / platforms / franchises / developers / ratings**: Distribution and completion breakdowns.
- **Milestones / records / insights**: Badge counts and taste traits.

Important nuance: the older length charts use IGDB `timeAvgSeconds` (Time-To-Beat estimates), while the dedicated Playtime section uses only the user-recorded `totalSeconds`; IGDB values appear there solely as a separate, labelled estimate series. A hidden `length` section remains commented out of the category list. Playtime has no per-session dates, so the Stats year filter selects games by start/finish/add date instead of splitting hours across years.

---

## 6. 🗂️ Series & Custom Collections

- **Series Detection**: Franchise/tree exploration from IGDB `collection_relations` and `collections`, fetched on demand and cached in memory (not persisted).
- **Custom Collections**: `Collection` records hold `items` referencing games by `gameId` or `igdbId`, with optional name/cover/image.

---

## 7. ⚙️ Settings & Data Governance

- **API Configuration**: Twitch Client ID/Secret for IGDB (plain fields on desktop; AES-GCM encrypted in the web vault).
- **Appearance & Defaults**: Initial view, library layout, sort/filter defaults, grid size, and fullscreen preference. There is no theme selector or animation-level setting.
- **Data Portability**: JSON export/import, CSV export, Backloggd CSV import, and IGDB metadata sync with progress reports.
- **Web only**: Google Drive backup with connect/back up/restore/overwrite controls and conflict detection.
