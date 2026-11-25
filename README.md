<img width="1920" height="1080" alt="Screenshot (920)" src="https://github.com/user-attachments/assets/8799e229-505c-4571-b78b-4c5be89bf089" /><h1 align="center">Lost in Sync</h1>

<p align="center">
  <a href="https://lostinsync.vercel.app/">
    <img src="https://img.shields.io/badge/Lost%20in%20Sync-Live%20Website-8B5CF6?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Visit Lost in Sync" />
  </a>
</p><img width="1920" height="1080" alt="Screenshot (922)" src="https://github.com/user-attachments/assets/01dd1cdb-5939-4070-93e0-0fb2298508da" />


<p align="center">
  <strong>A personal game library OS</strong>
  <br />
  Track your collection, explore new games, follow franchise completion, and visualize your gaming history.
  <br />
  On desktop, import your Steam and Epic Games libraries, wishlist, playtime and achievements directly into your collection, or bring in games from a generic CSV.
</p>

> [!IMPORTANT]
> **For the complete documentation, features, how to run, and usage guide, read the [A COMPLETE GUIDE TO LOSTINSYNC__](https://github.com/synced7x7/lostinsync__/releases).**
## Screenshots

![Uploading Screenshot (922).png…]()
<img width="1920" height="1080" alt="Screenshot (923)" src="https://github.com/user-attachments/assets/9d1c3692-0a68-40c9-a619-acc96fa09d01" />
<img width="1920" height="1080" alt="Screenshot (924)" src="https://github.com/user-attachments/assets/368233d0-6559-4af9-a674-ea9b42b7ff06" />
<img width="1920" height="1080" alt="Screenshot (925)" src="https://github.com/user-attachments/assets/84098664-4a86-44ee-ae46-100db91bcf34" />
<img width="1920" height="1080" alt="Screenshot (926)" src="https://github.com/user-attachments/assets/1fbced72-8a48-472c-9f73-9910a7dd4da9" />
<img width="1920" height="1080" alt="Screenshot (935)" src="https://github.com/user-attachments/assets/058c9ef9-76a0-4827-a019-41e9c00fccab" />





<table>
  <tr>
    <td align="center"><img width="1920" height="1080" alt="Screenshot (921)" src="https://github.com/user-attachments/assets/9ba1bdb0-45be-42dd-8895-e0ebd383a10e" /><br><sub>Overview</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/da366d3f-d5b3-4aa5-ba84-0b607cac51e4" width="100%"><br><sub>Full screen view</sub></td>
     <td align="center"><img src="https://github.com/user-attachments/assets/51c82895-4809-4f60-a173-bc2647f5a677" width="100%"><br><sub>PS4 View</sub></td>
  </tr>
  <tr>
     <td align="center"><img src="https://github.com/user-attachments/assets/b69e4fc9-3fd4-4421-a363-f8519a340abe" width="100%"><br><sub>Grid View</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/f979f887-95f7-41cd-88fa-6753575f041f" width="100%"><br><sub>Game Details</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/08fac899-1ab2-47f4-9527-4b0c2be9e567" width="100%"><br><sub>Discover</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="https://github.com/user-attachments/assets/de0bc9ce-59c9-413a-b453-334ba0f05c08" width="100%"><br><sub>Game Journey</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/9f5360a2-fac1-4759-9d9c-a8906e8edcb1" width="100%"><br><sub>Game Journey</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/6d8c2ebf-b51b-44a0-b638-627875c29d8d" width="100%"><br><sub>Game Journey</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="https://github.com/user-attachments/assets/f1db2a69-8039-40cf-8c11-a5b4dc3ed943" width="100%"><br><sub>Game Journey</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/6c8a64d0-d952-4c2a-8fe2-74216fc8b0c3" width="100%"><br><sub>Stats</sub></td>
  </tr>
</table>



---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Tauri v2 (Rust) |
| Frontend | React 19, TypeScript, Vite |
| Interactive timeline | React 19 with SVG strands and level-of-detail rendering |
| Animation | Framer Motion |
| Charts and analytics | Apache ECharts |
| Icons | Lucide React |
| Persistence | SQLite via `rusqlite` (Tauri managed state); browser localStorage in web dev mode |
| Images | Stored as files in the app data folder and referenced by name |
| External data | IGDB API (Twitch OAuth2 client credentials); Steam Web API on desktop |
| CSV import | Generic, IGDB-enriched CSV importer in Settings with dedupe, cancellation and reports |
| Desktop store import | One-way Steam and Epic Games connectors; all store HTTP and token storage stays in Rust |
| Styling | Custom CSS variables with selectable themes (Aurora, Moonlight, Rose, Solarized, Graphite, Arctic, Canopy, Glacier) |

---

## Getting Started

### Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 18+ |
| pnpm | 8+ |
| Rust + Cargo | stable (via [rustup](https://rustup.rs/)) |

> **Windows note:** After installing Rust, add `C:\Users\<you>\.cargo\bin` to your PATH.
> Run `.\scripts\check-environment.ps1` to verify that all tools are found.

### Install and run (web dev mode)

```powershell
git clone <repo-url> lostinsync__
cd lostinsync__
pnpm install
pnpm dev          # Vite dev server - opens in the browser, uses localStorage
```

Web dev mode is intended for UI development. IGDB features and file-based image storage require the native app.

### Run the native Tauri app

```powershell
# One-time: add Cargo to the current session
$env:Path = "C:\Users\$env:USERNAME\.cargo\bin;$env:Path"

pnpm tauri:dev    # Builds the Rust backend and opens a native window with SQLite
```

### Other checks

```powershell
pnpm typecheck    # TypeScript type check
pnpm test         # Unit tests
pnpm build        # Vite production build

cd src-tauri
cargo check       # Rust/backend type check
```

---

## Building a Release

Tauri produces a self-contained installer. End users do not need Node, Rust, or any other tooling.

1. Set `productName`, `version`, and a unique `identifier` in `src-tauri/tauri.conf.json`. Do not change the identifier after release, because it determines where user data is stored.
2. Generate icons from a square PNG of at least 1024 x 1024:
   ```powershell
   pnpm tauri icon path\to\logo.png
   ```
3. Build:
   ```powershell
   pnpm tauri:build
   ```
4. The installer is written to `src-tauri/target/release/bundle/nsis/` (for example `Lost in Sync_2.0.0_x64-setup.exe`).

Notes:
- Build on the target operating system. A Windows installer must be built on Windows.
- Unsigned installers trigger a Windows SmartScreen warning. Users can choose **More info, then Run anyway**. Removing the warning requires a code-signing certificate.
- Test the installed build on a clean machine before distributing it.

---


## Data and Storage

- Library data is stored in a local SQLite database in the application data folder.
- Large images (screenshots and background art) are written to an `images` folder next to the database. The saved data holds only short file references, which keeps saves small and fast.
- Existing libraries that contain embedded images are migrated automatically on first launch. Back up your database before upgrading.
- Store-imported games use IGDB remote image URLs; store art is never written to the local `images` folder.
- Franchise completion totals are fetched from IGDB’s `franchises` endpoint in 100-game chunks and cached in a dedicated SQLite `franchise_cache` table for 30 days. Only rows on screen are read from the cache; the web build keeps this cache in memory only. It is not part of JSON/Drive backups and is safe to discard.
- Steam API keys/SteamID64 are saved with app settings like the IGDB keys and are stripped from JSON backups. Epic OAuth tokens stay in a Rust-managed credentials file and never enter exports or Drive snapshots.
- Use **Settings, Export** to create a JSON backup at any time. Store ids survive export/import so repeat imports link to the same games.
- See `docs/store-import-guide.md` for Steam/Epic setup and the exact status, date, playtime and mastery mapping.

---

## Project Structure

```
lostinsync__/
├── src/                        # React / TypeScript frontend
│   ├── main.tsx                # App root, global state, routing, shelf and grid views
│   ├── style.css               # Aurora Glass theme tokens and core layouts
│   ├── domain/
│   │   ├── game.ts             # Game type, Status, AppData, optional store fields/helpers
│   │   ├── franchise.ts        # Franchise grouping, game-type switch and completion slots
│   │   ├── franchise.test.ts   # Franchise completion unit tests
│   │   ├── gametype.ts         # IGDB game-type filtering
│   │   ├── library-session.ts  # Session-only Library filters and saved defaults
│   │   ├── playtime.ts         # Recorded-totalSeconds aggregation for Stats
│   │   ├── store-links.ts      # IGDB external_games filtering, dedupe, ordering
│   │   ├── store-links.test.ts # Store-link unit tests
│   │   ├── trophies.ts         # Trophy tiers, rarity, evaluation, profile badge
│   │   └── stats.ts            # Statistics data builders
│   ├── data/
│   │   ├── repository.ts       # AppRepository: Tauri and localStorage adapters
│   │   ├── igdb.ts             # IGDB command wrappers with bounded caches
│   │   ├── franchiseCache.ts   # Visible-row franchise cache adapter (Tauri SQLite / web memory)
│   │   └── stores/             # Desktop store connectors, IGDB matching, import pipeline (incl. generic CSV), IPC and tests
│   ├── components/
│   │   ├── layout.tsx          # App layout and collapsible sidebar
│   │   ├── navigation.ts       # Sidebar navigation items
│   │   ├── rarity-badge.tsx    # Profile badge shown in the sidebar and Overview
│   │   ├── store-icons.tsx     # Transparent brand SVG icons for IGDB storefronts
│   │   └── shared.tsx          # Header, StarRating, TrophyToggle, DateField, ...
│   └── features/
│       ├── overview.tsx        # Profile banner and collection actions
│       ├── library-components.tsx # Add game form and detail views
│       ├── journey.tsx         # Interactive SVG and DOM timeline
│       ├── franchises.tsx      # Franchise ribbons, per-row load progress and virtualized rows
│       ├── franchises.css      # Franchise card, ribbon and arrow styling
│       ├── discover.tsx        # Discover feeds and search
│       ├── trophies.tsx        # Trophy and badge gallery
│       ├── stats.tsx           # ECharts analytics
│       ├── media.tsx           # Screenshot carousel and video embeds
│       ├── series.tsx          # Franchise and collection browser
│       ├── bundle.tsx          # Bundle contents (DLC and editions)
│       ├── stores-settings.tsx # Desktop-only store import UI, progress and reports
│       └── settings-data.tsx   # Settings, Library defaults, credentials, export/import, generic CSV import
│
├── src-tauri/                  # Rust / Tauri backend
│   ├── src/lib.rs              # Tauri commands (SQLite, franchise cache, IGDB and store IPC)
│   ├── src/stores.rs           # Store HTTP, Steam achievements/wishlist, Epic token file
│   ├── Cargo.toml
│   └── tauri.conf.json
│
├── docs/                       # Developer documentation
│   ├── screenshots/            # Images used in this README
│   ├── architecture.md
│   ├── database-schema.md
│   ├── design-system.md
│   ├── features.md
│   ├── igdb-image-endpoints.md
│   ├── performance-optimization-report.md
│   ├── roadmap.md
│   └── store-import-guide.md
│
└── scripts/
    └── check-environment.ps1   # Verify Node, pnpm, and Rust are on PATH
```

## License

MIT (c) Lost in Sync contributors
