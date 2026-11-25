
<div align="center">
  <h1>lostinsync__</h1>
  <strong>A PERSONAL GAME TRACKER</strong>
  <br />
  <br />
  <p>
    Track your collection, explore new games, follow franchise completion, and visualize your gaming history.
    <br />
    On desktop, import your Steam and Epic Games libraries, wishlist, playtime, and achievements directly into your collection, or bring in games from a generic CSV.
  </p>
  
  <p align="center">
    <a href="https://github.com/synced7x7/lostinsync__/releases">
      <img src="https://img.shields.io/badge/Desktop%20App-Latest%20Release-10B981?style=for-the-badge&logo=github&logoColor=white" alt="Download Desktop App" width=30% />
      &nbsp; &nbsp; &nbsp;
    </a><a href="https://lostinsync.vercel.app/">
      <img src="https://img.shields.io/badge/Lost%20in%20Sync-Live%20Website-8B5CF6?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Visit Lost in Sync" width=30% />
    </a>
  </p>
</div>

> [!IMPORTANT]
> **For the complete documentation, features, how to run, and usage guide, read the [A COMPLETE GUIDE TO LOSTINSYNC__](https://github.com/synced7x7/lostinsync__/releases).**
## Screenshots


<table>
  <tr>
    <td align="center"><img width="1920" height="1080" alt="Screenshot (921)" src="https://github.com/user-attachments/assets/9ba1bdb0-45be-42dd-8895-e0ebd383a10e" /><br><sub>Overview</sub></td>
  <td align="center">  <img width="1920" height="1080" alt="Screenshot (920)" src="https://github.com/user-attachments/assets/8799e229-505c-4571-b78b-4c5be89bf089" /><br><sub>Overview II</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/da366d3f-d5b3-4aa5-ba84-0b607cac51e4" width="100%"><br><sub>Full screen view</sub></td>
  </tr>
  <tr>
     <td align="center"><img src="https://github.com/user-attachments/assets/51c82895-4809-4f60-a173-bc2647f5a677" width="100%"><br><sub>PS4 View</sub></td>
     <td align="center"><img src="https://github.com/user-attachments/assets/b69e4fc9-3fd4-4421-a363-f8519a340abe" width="100%"><br><sub>Grid View</sub></td>
    <td align="center"><img width="1920" height="1080" alt="Screenshot (924)" src="https://github.com/user-attachments/assets/368233d0-6559-4af9-a674-ea9b42b7ff06" /><br><sub>Game Details</sub></td>
    
  </tr>
  <tr>
    <td align="center"><img width="1920" height="1080" alt="Screenshot (925)" src="https://github.com/user-attachments/assets/84098664-4a86-44ee-ae46-100db91bcf34" /><br><sub>Discover</sub></td>
    <td align="center"><img width="1920" height="1080" alt="Screenshot (926)" src="https://github.com/user-attachments/assets/1fbced72-8a48-472c-9f73-9910a7dd4da9" /><br><sub>Discover II</sub></td>
    <td align="center"><img src="https://github.com/user-attachments/assets/6d8c2ebf-b51b-44a0-b638-627875c29d8d" width="100%"><br><sub>Game Journey</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="https://github.com/user-attachments/assets/f1db2a69-8039-40cf-8c11-a5b4dc3ed943" width="100%"><br><sub>Game Journey II</sub></td>
    <td align="center"><img width="1920" height="1080" alt="Screenshot (935)" src="https://github.com/user-attachments/assets/058c9ef9-76a0-4827-a019-41e9c00fccab" /><br><sub>Franchise</sub></td>
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

## License

MIT (c) Lost in Sync contributors
