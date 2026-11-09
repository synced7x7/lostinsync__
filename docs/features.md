# Feature Documentation

Lost in Sync is a personal game library OS built with desktop-first principles. It provides a cohesive interface to catalogue, discover, analyze, and reminisce about your gaming journey.

---

## 1. 📚 Library Management

The Library view is the operational heart of the application.

- **Status Workflow**: Games are assigned one of 7 statuses (`Playing`, `Completed`, `Backlog`, `Wishlist`, `Shelved`, `Abandoned`, `On hold`).
- **Display Modes**:
  - **Cover Grid**: Card grid with customizable sizes (`compact`, `normal`, `large`) and smooth hover animations.
  - **Catalog List**: Dense row-based display showing title, genre, platforms, playtime, rating, and status pill.
- **Filtering & Search**:
  - Real-time search across titles, developers, genres, and notes.
  - Filter pills for quick status toggling (`All`, `Playing`, `Completed`, etc.).
  - Secondary filtering by genre and custom tags.
- **Sorting Options**: Sort by title (A-Z), total playtime, user rating, last played timestamp, or release date.
- **Game Details View**: Comprehensive inspection hero panel featuring backdrop artwork, IGDB review badge, Time-To-Beat breakdown, played platform tags, emulation flags, notes, and session logs.

---

## 2. 🗺️ Game Journey (Interactive WebGL Timeline)

The Game Journey visualizes your gaming life along an interactive, chronologically ordered timeline.

- **PixiJS v8 WebGL Canvas**: High-performance hardware-accelerated rendering capable of handling hundreds of concurrent games without DOM node bloat.
- **Branching Layout**:
  - Automatically slots games based on `startedAt` and `finishedAt` date bounds.
  - Pillars represent single-day completions; branching strands represent long-form playthroughs.
  - Color palettes dynamically assigned to visual lanes with smooth bezier connecting curves.
- **Navigation Controls**:
  - Smooth pan via pointer dragging or mouse wheel.
  - Viewport zoom with pinch / wheel + slider (10% to 240%).
  - Range presets: `All Time`, `Current Month`, or specific calendar years.
  - `Fit All` overview mode for a high-density chronological list view.
- **Interaction**: Hovering highlights corresponding timeline lanes; double-clicking opens the full game details page.

---

## 3. 🔍 Discover & IGDB Integration

A deep integration with the IGDB (Internet Game Database) API via Tauri Rust backend proxy commands.

- **Curated Feeds**:
  - Trending Now, Popular Releases, Top Rated of All Time, Personalized Recommendations.
  - Latest Releases, Upcoming Releases, Most Anticipated, Hidden Gems, Indie Spotlights, Story-Rich Adventures.
- **Search Capabilities**:
  - Fuzzy text search across the IGDB catalog.
  - Exact title prefix matching via `/ <title>`.
  - Direct IGDB ID lookup via `& <id>`.
- **One-Click Import**: Instant card ingestion into your library, fetching HD cover artwork, 1080p backdrops, summaries, release dates, platforms, genres, and HowLongToBeat completion times.
- **Franchise & Series Explorer**: Explores franchise trees up and down 4 hierarchy levels, allowing complete series discovery directly from any game page.

---

## 4. 🏆 Trophies & Platinum Tracking

A dedicated space to celebrate games that have been fully conquered.

- **Platinum Toggle**: Direct toggle from cards, details, and library views to designate 100% completion / platinum mastery.
- **Showcase Gallery**: Filter and view completed versus platinumed titles.
- **Completion Badges**: Custom rarity badges reflecting game mastery level.

---

## 5. 📊 Statistics & Analytics

A data visualization dashboard providing deep insights into gaming habits.

- **Playtime Metrics**: Total hours logged, average playtime per title, longest ongoing playthroughs.
- **Completion Funnel**: Breakdown of completed vs. backlogged vs. dropped titles.
- **Genre & Platform Distribution**: Visual graphs showing genre affinities and preferred gaming hardware.
- **Historical Activity**: Games completed year-over-year.

---

## 6. 🗂️ Series & Custom Collections

- **Series Detection**: Automated grouping of connected games using IGDB franchise metadata.
- **Custom Collections**: Create user-curated bundles (e.g. "Spooky Halloween Games", "Favorites of 2025") with custom titles and cover artwork.

---

## 7. ⚙️ Settings & Data Governance

- **API Configuration**: Secure local storage of Twitch Client ID and Secret for IGDB access.
- **Appearance & Defaults**: Customize initial view, default sorting, card density, and animation levels.
- **Local Data Portability**: Export entire database to a clean JSON document for backup or transfer. Single-click import restore.
