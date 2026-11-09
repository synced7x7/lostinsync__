# Project Roadmap

This document outlines completed milestones and future enhancements for **Lost in Sync**.

---

## ✅ Completed Milestones

### Core Platform & Persistence
- [x] Tauri v2 desktop shell with native Rust SQLite persistence (`rusqlite`).
- [x] Offline-first architecture with browser-compatible localStorage adapter.
- [x] Schema migration versioning framework.
- [x] Full JSON state backup export and restore.
- [x] Collapsible sidebar navigation drawer with active route awareness.

### Library Management
- [x] 7 game lifecycle statuses (`Playing`, `Completed`, `Backlog`, `Wishlist`, `Shelved`, `Abandoned`, `On hold`).
- [x] Dual display layouts: Cover Grid (with compact/normal/large sizing) and Dense Catalog List.
- [x] Search, multi-field filtering, and custom sorting.
- [x] Comprehensive game detail view with backdrop artwork, rating rings, and HowLongToBeat cards.
- [x] Half-star rating system.
- [x] Trophy & Platinum mastery flag (`platinumed`) replacing legacy progress bars.

### IGDB & Media Integration
- [x] Backend Rust proxy for IGDB API with automatic Twitch OAuth2 token lifecycle.
- [x] Curated Discover feeds (10 feeds including Trending, Anticipated, Hidden Gems, etc.).
- [x] Rich metadata scraping: 1080p backdrops, release dates, genres, platforms, themes, perspectives, and Time-To-Beat stats.
- [x] Franchise / Series hierarchy tree explorer.
- [x] Media asset gallery inspector.

### Visual Journey (WebGL Timeline)
- [x] Migration from DOM/SVG to hardware-accelerated **PixiJS v8** WebGL engine.
- [x] Dynamic branching lane assignment algorithm based on play dates.
- [x] Zoom, pan, time range presets (All, Month, Custom Year), and high-density Fit All mode.
- [x] Texture memory management with lazy eviction and viewport chunk culling.

---

## 🚀 Future Roadmap

### Q1: Enhanced Gameplay Tracking
- [ ] **Automated Playtime Tracking**: Native Windows process watcher to record session playtime automatically without manual logging.
- [ ] **Game Launcher Integration**: One-click launch button to trigger Steam / GOG / local game executable paths directly from the game detail hero.
- [ ] **Multi-Session Log**: Granular session history log (date, duration, session notes) rather than a single aggregated total playtime number.

### Q2: Extended Synchronization & Ecosystem
- [ ] **Steam Library Sync**: Two-way sync to auto-import owned Steam games, playtime, and unlocked achievements.
- [ ] **Emulator Integration**: Deep links and playtime hooks for retro emulators (RetroArch, RPCS3, PCSX2, Dolphin).
- [ ] **Backloggd / Letterboxd CSV Importer**: Complete bi-directional sync adapter for Backloggd CSV exports.

### Q3: Community & Social Features (Local-First)
- [ ] **Year in Review Infographic**: Exportable high-resolution recap card summarizing annual gaming milestones for sharing on social media.
- [ ] **Tier List Creator**: Drag-and-drop visual tier list maker powered by library cover art.
- [ ] **Custom Themes & Accent Colors**: Dynamic user customization of palette variables beyond Aurora Glass.
