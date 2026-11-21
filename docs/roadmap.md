# Project Roadmap

> **Verified against source on 2026-11-22** (refreshed for generic CSV import and dashboard motion). Items are marked complete only when implemented in code. The detailed, file-specific plans for every pending item are in `agent/future_implementation_guide.md`.

This document outlines completed milestones and future enhancements for **Lost in Sync**.

---

## ✅ Completed Milestones

### Core Platform & Persistence
- [x] Tauri v2 desktop shell with native Rust SQLite persistence (`rusqlite`).
- [x] Offline-first architecture with browser `localStorage` adapter and a web IndexedDB adapter.
- [x] Single-document `app_state` persistence with migration version tracking (version 1).
- [x] Full JSON state backup export/import and CSV export.
- [x] Collapsible sidebar navigation with active-route awareness.
- [x] Externalized image storage: hash-named files on desktop, content-hash Blobs on web.

### Library Management
- [x] 7 game lifecycle statuses (`Backlog`, `Wishlist`, `Playing`, `Completed`, `Shelved`, `Abandoned`, `On hold`).
- [x] PS4 shelf (optionally fullscreen) and catalog grid with `sm`/`md`/`lg` sizing.
- [x] Title search, status/game-type/favorites filters, and 10-key sorting with direction.
- [x] Game detail hero with backdrop, rating ring, separate Time-To-Beat section above Journey, exact storefront icon links (`+N` for extras), played platforms, media, series, and bundles.
- [x] Half-star rating system (1–10 scale) and `platinumed` trophy flag.
- [x] `AddGame` modal shared by add and edit flows.

### IGDB & Media Integration
- [x] Rust IGDB proxy with Twitch OAuth2 token caching (300 s early refresh).
- [x] Curated Discover feeds (10 feeds) via the paginated `igdb_discover_feed` command.
- [x] Rich metadata: backdrops, release dates, genres, platforms, themes, perspectives, and Time-To-Beat.
- [x] Exact storefront links from IGDB `external_games` with brand SVG icons; web falls back to nested `games.external_games.*` until the worker allow-list is redeployed.
- [x] Franchise/series hierarchy tree explorer.
- [x] Media gallery (covers, artworks, screenshots, YouTube embeds).
- [x] Bounded LRU + TTL caches on all IGDB client calls.
- [x] IGDB metadata sync with a field allow-list and progress reports.
- [x] Backloggd CSV importer with dedupe, retries, cancellation, and reports.
- [x] Generic CSV importer in Settings: `title` or `igdb_id` per row, IGDB id first then strict/generic title search, dedupe, batched detail fetch, cancellation, progress and a copyable report (`src/data/stores/import.ts`, `CsvImportSection`).

### Store Import (Desktop Only)
- [x] One-way store connector framework with Steam and Epic Games adapters; all store HTTP and OAuth/token storage remains in Rust.
- [x] Steam owned-games, free-games, public wishlist and achievement fetches with playtime, date, status and mastery mapping.
- [x] Shared IGDB matching and import pipeline with dedupe, cancellation, progress, needs-review and failure reports.
- [x] Optional store fields survive JSON export/import; credentials never enter backups or web Drive snapshots.
- [x] Desktop-only store settings UI; no web proxy or store connections were added.
- [x] User-facing Steam/Epic import guide with status, date, playtime and mastery mapping; Epic sign-in controls appear only while disconnected.

### Visual Journey (Interactive Timeline)
- [x] SVG connecting strands with cubic bezier curves and dynamic lane coloring.
- [x] Branching lane assignment from `startedAt`/`finishedAt` dates.
- [x] Zoom, pan, range presets, and virtualized Fit All overview.
- [x] LOD node culling below 40% zoom.
- [x] Ascending/descending sort in Fit All (oldest/newest first; session-only, timeline stays chronological).

### UI Presentation
- [x] Animated favorites stage and odometer stats strip on the dashboard: flowing wave, mouse spotlight, staggered card rise/float, cover sheen, pulsing dots, travelling light borders, and scroll-triggered number reels with `prefers-reduced-motion` fallbacks.

### Web Application
- [x] Web build reusing shared `src/` via three Vite module swaps.
- [x] IndexedDB persistence with non-extractable AES-GCM credential vault.
- [x] Cloudflare Worker IGDB proxy with CORS allow-list and rate limiting.
- [x] Google Drive backup with conflict detection.

---

## 🚀 Future Roadmap

The items below are **planned, not implemented**. See `agent/future_implementation_guide.md` for per-feature file paths, dependencies, and suggested order.

### Phase 1 — Isolated improvements
- [x] IGDB suggestion dropdown in Add Game closes on outside click / Escape (feature 1, completed).
- [x] Ascending/descending sort control in Journey Fit All mode (feature 2, completed).
- [ ] Inline Played On / Completed status updates without the entry screen (original feature-1 idea; re-scoped to the dropdown fix above, still not implemented).
- [ ] Clean up save debug logging and stale error toasts.

### Phase 2 — Data-model extensions (JSON only, no SQL migration)
- [ ] Wishlist extras: price, release-date reminders, Bought On date, Amount Paid, spending stats.
- [ ] Platform ownership: store/platform and physical/digital, including multiple platforms.
- [ ] Backlog priority and "What Should I Play Next?" (mood, playtime, genre).
- [ ] Define played/completed date semantics.

### Phase 3 — Analytics & discovery
- [x] Dedicated gameplay-time statistics section (Playtime category aggregating recorded `totalSeconds`; feature 3, completed).
- [x] Franchise completion tracking (e.g. "4 of 9 Resident Evil games finished") — dedicated `/franchises` view with ribbon rows, IGDB `franchises` lookups, a 30-day visible-row SQLite cache, per-row loading progress and virtualized rendering.
- [ ] Improve Discover relevance without rebuilding the system.
- [ ] Shareable profile/statistics card.

### Phase 4 — Imports & synchronization
- [x] Steam library sync (owned/free games, wishlist, playtime and achievements) is implemented; re-fetch QA is pending after the free-game fix.
- [x] Generic CSV import through the shared import pipeline (`src/data/stores/import.ts`); pasted title lists remain pending.
- [ ] Live QA for the unofficial Epic launcher endpoints.
- [ ] Automated playtime tracking and multi-session logs.
- [ ] Game launcher integration (Steam/local executables).
- [ ] Emulator deep links and playtime hooks.

### Phase 5 — Packaging & platform
- [ ] Consistent application-wide theme system with persisted selection.
- [ ] WebApp hardening and documentation/deployment cleanup.
- [ ] PWA installation, manifest, service worker, and offline caching.
- [ ] Android application in an isolated directory (must not affect desktop or web).
- [ ] Tier list creator and Year-in-Review infographic.
