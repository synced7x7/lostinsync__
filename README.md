# Lost in Sync

> **A personal game library OS** — track your collection, explore new games, and visualize your gaming history.

Lost in Sync is an offline-first desktop application built with Tauri 2 (Rust) + React 19 (TypeScript). It gives you a beautiful, local-first home for every game you've ever played, want to play, or have abandoned in shame.

---

## Features

### 📚 Library Management
- Add games manually or auto-fill via **IGDB** (cover art, description, genres, platforms, ratings, time-to-beat)
- Track status: **Playing · Completed · Backlog · Wishlist · Shelved · Abandoned · On hold**
- Log personal playtime, start & finish dates, notes, and star ratings
- Trophy / platinum tracking (`platinumed` flag)
- Mark favorites, filter by genre, sort by playtime, rating, release date, and more
- Two layouts: **PS4-style cover grid** or **catalog list view**

### 🗺️ Game Journey (WebGL Timeline)
- PixiJS v8 WebGL-rendered interactive timeline of your gaming history
- Branching visual layout showing games by start/finish dates
- Zoom, pan, and time-range filtering (`all · month · custom year`)
- Click any node to jump straight to the game's detail page

### 🔍 Discover & IGDB Browse
- Browse curated feeds: **Trending · Popular · Top Rated · For You · Latest · Upcoming · Anticipated · Hidden Gems · Indie · Story-Rich**
- Search IGDB with fuzzy search, exact-name prefix (`/ `), or direct ID lookup (`& <id>`)
- Each feed loads 20 cards on the main page; "View all" pages load batches of 30 up to 100
- One-click **Add to Library** from any discovery card or detail page

### 🏆 Trophies & Platinum
- Dedicated **Trophies** view listing all platinumed / completed games
- Toggle platinum status directly from the library or game detail page

### 📊 Statistics
- Charts showing playtime by status, genre breakdown, games added over time
- Total hours played, completion rate, average rating, and more summary stats

### 🗂️ Series & Collections
- IGDB-powered **Series** grouping: view franchise hierarchies and all games in a collection
- User-defined **Collections** with custom names, descriptions, and cover images

### ⚙️ Settings
- Enter your Twitch/IGDB API credentials
- Choose default view, library sort/filter, grid size, and layout
- Export / import the full app state as a JSON backup

---

## Screenshots

> _Screenshots coming soon._

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19, TypeScript, Vite |
| WebGL timeline | PixiJS v8 |
| Routing & animation | React Router v7, Framer Motion |
| Icons | Lucide React |
| Persistence | SQLite via `rusqlite` (Tauri managed state) |
| External data | IGDB API (Twitch OAuth2 client credentials) |
| Styling | Custom CSS variables — Aurora Glass dark theme |

---

## Getting Started

### Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 18+ |
| pnpm | 8+ |
| Rust + Cargo | stable (via [rustup](https://rustup.rs/)) |

> **Windows note:** After installing Rust, add `C:\Users\<you>\.cargo\bin` to your PATH.  
> Run `.\scripts\check-environment.ps1` to verify all tools are found.

### Install & run (web dev mode)

```powershell
git clone <repo-url> lostinsync__
cd lostinsync__
pnpm install
pnpm dev          # Vite dev server — opens in browser, uses localStorage
```

### Run the native Tauri app

```powershell
# One-time: add Cargo to the current session
$env:Path = "C:\Users\$env:USERNAME\.cargo\bin;$env:Path"

pnpm tauri:dev    # Builds Rust backend + opens native window with SQLite
```

### Build a Windows installer

```powershell
pnpm tauri:build  # Produces an .msi / .exe under src-tauri/target/release/bundle
```

### Other checks

```powershell
pnpm typecheck    # TypeScript type check
pnpm test         # Unit tests
pnpm build        # Vite production build
```

---

## IGDB Setup

Lost in Sync uses the [IGDB API](https://api-docs.igdb.com/) (powered by Twitch) to auto-fill game metadata and power the Discover tab.

1. Go to the [Twitch Developer Console](https://dev.twitch.tv/console/apps) and create a new application.
2. Set the OAuth redirect URL to `http://localhost`.
3. Copy your **Client ID** and **Client Secret**.
4. Open Lost in Sync → **Settings** → paste both credentials.
5. The app exchanges them for a bearer token automatically; no manual OAuth flow required.

> Credentials are stored **only** in your local SQLite database and are never sent anywhere except Twitch's token endpoint and IGDB's API.

---

## Project Structure

```
lostinsync__/
├── src/                        # React / TypeScript frontend
│   ├── main.tsx                # App root, global state, routing
│   ├── style.css               # Aurora Glass theme tokens
│   ├── domain/
│   │   ├── game.ts             # Game type, Status, AppData, helper fns
│   │   ├── gametype.ts         # IGDB game-type filtering
│   │   └── library-session.ts  # Library sort/filter session state
│   ├── data/
│   │   ├── repository.ts       # AppRepository — Tauri ↔ localStorage adapter
│   │   └── igdb.ts             # IGDB Tauri command wrappers + cache
│   ├── hooks/
│   │   └── useSmoothScroll.ts
│   ├── components/
│   │   ├── layout.tsx          # AppLayout, collapsible sidebar
│   │   └── shared.tsx          # Header, GameMini, StarRating, TrophyToggle…
│   └── features/
│       ├── dashboard/          # Dashboard view
│       ├── library-components/ # AddGame form, game cards
│       ├── journey/            # PixiJS WebGL timeline
│       ├── discover/           # Discover feeds + IGDB details
│       ├── trophies/           # Trophies / platinum view
│       ├── media/              # Screenshots + YouTube embeds
│       ├── series/             # Franchise / collection browser
│       ├── bundle/             # Bundle contents (DLC / editions)
│       ├── overview/           # Profile section, collection actions
│       └── settings/           # Settings view
│
├── src-tauri/                  # Rust / Tauri backend
│   ├── src/lib.rs              # All Tauri commands (SQLite, IGDB proxy)
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── docs/                       # Developer documentation
│   ├── architecture.md
│   ├── database-schema.md
│   ├── design-system.md
│   ├── features.md
│   ├── igdb-image-endpoints.md
│   └── roadmap.md
│
└── scripts/
    └── check-environment.ps1   # Verify Node, pnpm, Rust are on PATH
```

---

## License

MIT © Lost in Sync contributors
