
# Lost in Sync

> **A personal game library OS** - track your collection, explore new games, and visualize your gaming history.
---

Lost in Sync is an offline-first desktop application built with Tauri 2 (Rust) and React 19 (TypeScript). It is a local-first home for every game you have played, want to play, or have set aside. Your library is stored on your own machine.

## Screenshots

<table>
  <tr>
    <td align="center"><img width="1920" height="1080" alt="Screenshot (914)" src="https://github.com/user-attachments/assets/2653ae24-fbb2-4a5b-bbe9-3d16a4301a8b" /><br><sub>Overview</sub></td>
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
| External data | IGDB API (Twitch OAuth2 client credentials) |
| Styling | Custom CSS variables, Aurora Glass dark theme |

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
4. The installer is written to `src-tauri/target/release/bundle/nsis/` (for example `Lost in Sync_0.1.0_x64-setup.exe`).

Notes:
- Build on the target operating system. A Windows installer must be built on Windows.
- Unsigned installers trigger a Windows SmartScreen warning. Users can choose **More info, then Run anyway**. Removing the warning requires a code-signing certificate.
- Test the installed build on a clean machine before distributing it.

---


## Data and Storage

- Library data is stored in a local SQLite database in the application data folder.
- Large images (screenshots and background art) are written to an `images` folder next to the database. The saved data holds only short file references, which keeps saves small and fast.
- Existing libraries that contain embedded images are migrated automatically on first launch. Back up your database before upgrading.
- Use **Settings, Export** to create a JSON backup at any time.

---

## Project Structure

```
lostinsync__/
├── src/                        # React / TypeScript frontend
│   ├── main.tsx                # App root, global state, routing, shelf and grid views
│   ├── style.css               # Aurora Glass theme tokens and core layouts
│   ├── domain/
│   │   ├── game.ts             # Game type, Status, AppData, helper functions
│   │   ├── gametype.ts         # IGDB game-type filtering
│   │   ├── library-session.ts  # Session-only Library filters and saved defaults
│   │   ├── trophies.ts         # Trophy tiers, rarity, evaluation, profile badge
│   │   └── stats.ts            # Statistics data builders
│   ├── data/
│   │   ├── repository.ts       # AppRepository: Tauri and localStorage adapters
│   │   └── igdb.ts             # IGDB command wrappers with bounded caches
│   ├── components/
│   │   ├── layout.tsx          # App layout and collapsible sidebar
│   │   ├── navigation.ts       # Sidebar navigation items
│   │   ├── rarity-badge.tsx    # Profile badge shown in the sidebar and Overview
│   │   └── shared.tsx          # Header, StarRating, TrophyToggle, DateField, ...
│   └── features/
│       ├── overview.tsx        # Profile banner and collection actions
│       ├── library-components.tsx # Add game form and detail views
│       ├── journey.tsx         # Interactive SVG and DOM timeline
│       ├── discover.tsx        # Discover feeds and search
│       ├── trophies.tsx        # Trophy and badge gallery
│       ├── stats.tsx           # ECharts analytics
│       ├── media.tsx           # Screenshot carousel and video embeds
│       ├── series.tsx          # Franchise and collection browser
│       ├── bundle.tsx          # Bundle contents (DLC and editions)
│       └── settings-data.tsx   # Settings, Library defaults, credentials, export/import
│
├── src-tauri/                  # Rust / Tauri backend
│   ├── src/lib.rs              # Tauri commands (SQLite, image storage, IGDB proxy)
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
│   └── roadmap.md
│
└── scripts/
    └── check-environment.ps1   # Verify Node, pnpm, and Rust are on PATH
```

## License

MIT (c) Lost in Sync contributors
