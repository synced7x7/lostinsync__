# Feature Documentation

> **Verified against source on 2026-11-22** (refreshed for generic CSV import, dashboard motion, Discover ranking, and Find My Next Game). This describes what is implemented today, not planned functionality. The full status breakdown is in `agent/PROJECT_STATUS.md`.

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
- **Game Details View**: `Details` in `src/main.tsx` features backdrop artwork, rating ring, IGDB score, a dedicated Time-To-Beat section above the read-only journey panel, played-platform chips, exact storefront icon links (with a `+N` hover popover), notes, series/bundle links, and media. Status/date fields are edited by opening the `AddGame` modal; an inline Favorite toggle already updates directly.

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

- **Curated Feeds**: 9 feeds — Trending, Most Anticipated, For You, All Time Popular, Top Rated, Latest Releases, Indie Spotlight, Upcoming, and Story-Driven Adventures. The active loader is `igdb_discover_feed` (paginated); `igdb_discover` is a legacy snapshot still present but unused by the UI. Hidden Gems has been removed from Discover.
- **Ranking**: For You, Top Rated, Indie Spotlight, and Story-Driven are ranked in Rust after fetching IGDB candidate pools. Ranking uses Bayesian-adjusted IGDB ratings, a local taste profile for For You (genre frequency, library ratings, and completion span), owned-ID exclusion, and light diversity reranking. Other feeds use direct IGDB sort/page queries. Detailed formulas are in [`docs/discovery-and-recommendation-algorithms.md`](discovery-and-recommendation-algorithms.md).
- **Search Capabilities**: Fuzzy search, exact title prefix via `/ <title>`, and ID lookup via `& <id>`.
- **One-Click Import**: `draftFromIgdb` creates an unsaved game from IGDB results with cover, backdrop, summary, release date, platforms, genres, themes, and Time-To-Beat metadata. Unsaved Discover previews hide library-only fields (status, playtime, Played on, collection/delete actions); the draft starts as `Backlog` with no played platforms.
- **Exact storefront links**: `igdbExternalGames` reads IGDB `external_games` for the game. The Details hero shows up to two brand-icon store links plus a `+N` hover/focus popover for the rest; `storeLinksFromExternal` drops rows without a URL, deduplicates by source, and orders known storefronts by priority. The web client falls back to nested `games.external_games.*` when the deployed worker has not yet allowed the direct endpoint.
- **Franchise Explorer**: Series tree traversal up to 4 levels up/down via `igdb_series` (Details view).
- **Franchise completion data**: `igdb_franchise` resolves a franchise by name, with a fallback through library game IDs, and `igdb_games_by_ids` fetches the franchise's games 100 IDs at a time. Both are paced and retried.
- **Caching**: Bounded LRU caches with a 20-minute TTL; feed cards are prefetched on hover. For You uses a v2 cache key that includes the taste-profile/confidence signature.

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
- **Franchise Completion** (`/franchises`): One neon-ribbon row per franchise, built from the stored `franchises` names plus IGDB franchise games merged with the library. Remakes and editions collapse into one slot; games may appear under several franchises, but only franchises with a completed game are shown. The count is controlled by `ALL_TYPES` / `WANTED_TYPES` in `src/domain/franchise.ts`: the current diagnostic setting `ALL_TYPES = true` counts every game type while the Mario total is being investigated; setting it back to `false` restores main/standalone/remake/remaster only. Completed games use their cover art, unplayed entries show dark `?` placeholders, and each card has a progress bar, completion count, percentage and logged playtime. Rows, slots and ribbon segments are virtualized, and wheel or glass-arrow input scrolls each row smoothly with the scrollbar hidden. Desktop persists resolved rows in SQLite `franchise_cache` for 30 days (web uses memory only), reading only visible keys; Refresh, Refresh all and Retry are available, and a failed load never stores a partial total. Loading progress is per row: `Queued`, `Loading franchise · 100/412 games loaded`, or `Refreshing 100/412…`. There is no header progress bar.
- **Custom Collections**: `Collection` records hold `items` referencing games by `gameId` or `igdbId`, with optional name/cover/image.

---

## 7. ⚙️ Settings & Data Governance

- **API Configuration**: Twitch Client ID/Secret for IGDB (plain fields on desktop; AES-GCM encrypted in the web vault). Desktop also accepts a Steam Web API key and SteamID64; both are saved with settings and stripped from backups.
- **Appearance & Defaults**: Initial view, library layout, sort/filter defaults, grid size, and fullscreen preference. There is no theme selector or animation-level setting.
- **Data Portability**: JSON export/import, CSV export, Backloggd CSV import, generic CSV import, desktop store import, and IGDB metadata sync with progress reports. JSON round-trips preserve optional store ids and never include store credentials.
- **Generic CSV import**: A Settings panel imports a CSV where each row has a `title` or an `igdb_id`. When `igdb_id` is present it wins and the title is ignored (it can be empty or wrong); otherwise the title is searched strictly (`/ <title>`) then generically. Optional columns cover `status`, `playtime`, `starting_date`, `completed_date`, `rating`, `mastery`, `favorites` and `played_on`. Imports dedupe against the library and within the file, fetch IGDB details in batches, support cancel-after-batch, and end with a grouped, copyable report. Requires IGDB credentials; the panel also appears in the web build.
- **Web only**: Google Drive backup with connect/back up/restore/overwrite controls and conflict detection. The store settings panel is desktop-only and never renders in the web build.

---

## 8. 🛒 Desktop Store Library Import

One-way store import is implemented in `src/features/stores-settings.tsx`, `src/data/stores/` and `src-tauri/src/stores.rs`. The web build receives store-derived games only through the normal JSON export/import path. See [`docs/store-import-guide.md`](store-import-guide.md) for the user-facing setup and full field mapping.

- **Connectors**: Steam and Epic Games are exposed through one catalog with capability flags. Steam is the only official connector and has the complete mapping; Epic uses unofficial OAuth/library endpoints and is ownership-only.
- **Connection UI**: Epic's **Open sign-in page**, **Authorization code** and **Complete sign-in** controls are shown only while the connector is not connected. They disappear after sign-in succeeds and reappear if the connection is lost or the token is removed.
- **Steam credentials and privacy**: Enter a Steam Web API key and 17-digit SteamID64 once in Settings. Game details must be Public. Wishlist titles require a public wishlist; a private or empty wishlist returns no titles and produces a warning rather than a failure.
- **Owned, free and wishlist games**: `GetOwnedGames` requests `include_all_free_games`, `include_free_sub`, `include_played_free_games` and `skip_unvetted_apps=0` so claimed-but-never-launched free games are imported. The supported keyless `IWishlistService/GetWishlist/v1` endpoint supplies app ids; Rust resolves names from owned-game titles first and Steam app details second. Ownership wins if an app appears in both lists.
- **Status and dates**: Wishlist → `Wishlist`; no real play/last-played date → `Backlog` (including free games with no launch history); `playtime_2weeks > 0` → `Playing`; played but not recent → `Completed`, with `rtime_last_played` as the completion date. The start date comes from the earliest achievement unlock, falling back to the earlier of add date and last-played date, and is clamped so it never follows completion.
- **Achievements and mastery**: Steam achievements are always fetched for owned games. `success: false` (“Requested app has no stats”) means zero achievements, not an error. `platinumed` is set only when `total > 0 && achieved >= total`.
- **Epic mapping**: Epic catalog ids are resolved to IGDB ids first, then strict/unique title search; trademark marks and common edition suffixes are cleaned before fallback matching. Epic has no playtime, last-played or achievement data, so imported games start as `Backlog`.
- **Manual edits win**: Status is set on first import only. Re-sync refreshes store-owned identity, playtime, dates and achievements but leaves a status changed by the user alone.
- **Matching and art**: Games match by store id → strict `/ ` IGDB search → unique normalized title. Ambiguous titles go to a “needs review” report. Imported metadata and images come from IGDB remote URLs; no store artwork is saved to the desktop `images/` folder.
- **Reports**: Fetch/import phases show progress and a report with imported, linked, refreshed, duplicate, needs-review, warning and failure sections. The report can be copied to the clipboard.
- **Credential safety**: Steam keys live with app settings like IGDB credentials; Epic tokens live in a Rust-managed app-data credentials file. All store HTTP and token handling stays in Rust; credentials are stripped from JSON exports and web Drive snapshots.

---

## 9. ✨ Dashboard, Recommendations & Presentation

The Overview dashboard (`src/features/dashboard.tsx`, `src/features/overview.css`) combines the existing dashboard feed with motion and a local backlog recommender.

- **Find My Next Game** (desktop/Tauri only): the Dashboard calls `get_backlog_recommendations` through `src/data/recommendations.ts` once per app session. The result is cached in a module-level `recsSession` variable, so it is not recalculated on re-renders or data changes and there is no refresh button. The Rust command reads local `app_state` from SQLite, builds long-term and recent taste profiles from play history, scores Backlog candidates, and returns the best pick plus alternatives. The UI shows one best match, taste-match percentage, reasons, "Because you enjoyed..." titles, and up to five alternative backlog picks. Detailed formulas are in [`docs/discovery-and-recommendation-algorithms.md`](discovery-and-recommendation-algorithms.md).
- **Favorites stage**: a travelling conic-gradient light border, a flowing wave highlight, a soft radial spotlight that follows the mouse, cards that rise center-out then float on staggered phases, a sheen sweep across each cover, and pulsing stem dots. A `--d` CSS variable (distance from the center slot) staggers the outer cards. The entrance animation runs on the outer `.fav-section` and `.fav-scroll` locks vertical overflow, so no transient scrollbar flashes during the slide-in.
- **Stats strip**: when the strip scrolls into view (`IntersectionObserver`, 35% threshold), each zero-padded number spins as an odometer reel — a 0–9–0–9 strip that makes one extra turn before landing on the final digit. The real value remains available to assistive tech via `aria-label`. Labels are targeted with `.big-stat > span` so the reel spans keep their clipped `1em` windows. Cards fade in with a staggered lift, gain a hover glow, and the panel has a slow sweeping sheen.
- **Accessibility**: all of these animations, including the flowing wave, are disabled under `prefers-reduced-motion: reduce`.
