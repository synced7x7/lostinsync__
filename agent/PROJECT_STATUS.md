# PROJECT_STATUS.md — current development state

> Companion to `PROJECT_CONTEXT.md`. This file tracks **changeable** status only. It was verified by reading source on 2026-11-22 (refreshed for generic CSV import, dashboard motion, Discover ranking, and Find My Next Game); where something cannot be proven from source, it is marked **unverified**. Update this file when development materially changes.

---

## 1. Overall Project Status

Feature-rich, working **prototype / pre-1.0 product** with two shipping surfaces:

- Offline-first Tauri v2 desktop app (primary), version `0.1.0` in `package.json:4` and `src-tauri/tauri.conf.json:5` (the sidebar footer displays `v0.1.1 · Genesis Crypt` in `src/components/layout.tsx:138` — version strings disagree).
- Web build under `web/` that reuses the shared React app with three swapped modules and adds IndexedDB storage, encrypted credentials, and Google Drive backup.

Built installer artifacts exist in `src-tauri/target/release/bundle/` (NSIS `.exe` and MSI). No development branch activity, commit history, or issue tracker was inspected, so "in progress" claims below are limited to what source and docs show.

**Maturity signals:** most planned core features are implemented; primary weaknesses are architectural (single-blob persistence, monolithic `src/main.tsx`), some documentation drift, and unfinished platform variants (theme, PWA, Android). Desktop store import is implemented; live Steam re-fetch QA after the free-game fix is **unverified**.

---

## 2. Completed Features (implemented and verified in source)

| Area | What exists | Evidence |
|---|---|---|
| Persistence | SQLite `app_state` JSON blob plus separate `franchise_cache` lookup table, localStorage dev adapter, image externalization, JSON export/import, migration v1 | `src-tauri/src/lib.rs:75-192`, `src/data/repository.ts`, `src/data/franchiseCache.ts`, `src/features/settings-data.tsx:52-121` |
| Library | 7 statuses, PS4 shelf + fullscreen shelf + catalog grid, title search, status/game-type/favorites filters, 10-key sort with direction | `src/domain/game.ts:3`, `src/main.tsx:300-461,513-812`, `src/domain/library-session.ts:22-33` |
| Add Game IGDB dropdown (feature 1) | Suggestion dropdown closes on outside click or Escape so custom titles can be typed freely | `src/features/library-components.tsx:1,39-44,196-203` (commit `c864403`) |
| Journey Fit All sort (feature 2) | Ascending (oldest first) / descending (newest first) toolbar toggle; deterministic comparator with Vitest coverage; timeline layout stays chronological | `src/features/journey.tsx`, `src/features/journey.css`, `src/domain/journey-sort.ts`, `src/domain/journey-sort.test.ts` |
| Playtime stats (feature 3) | Dedicated "Playtime" Stats category aggregating recorded `totalSeconds`: total/mean/median, longest/shortest game, distribution, hours by status/genre, plus a separate labelled IGDB-estimate comparison | `src/domain/playtime.ts`, `src/domain/playtime.test.ts`, `src/domain/stats.ts`, `src/features/stats.tsx` |
| Franchise completion (feature 13) | Dedicated `/franchises` view with one ribbon row per franchise; games appear under every franchise they list, only franchises with a completed game are shown, totals come from IGDB `franchises` + 100-ID game chunks, visible rows are cached in SQLite for 30 days, each row shows its own load progress/Retry/Refresh, and rows/slots are virtualized with smooth wheel/arrow scrolling | `src/domain/franchise.ts`, `src/domain/franchise.test.ts`, `src/features/franchises.tsx`, `src/features/franchises.css`, `src/data/franchiseCache.ts`, `src/data/igdb.ts`, `src-tauri/src/lib.rs`, `web/src/igdb.web.ts` |
| Game details | Cover/backdrop hero, rating, dedicated TTB panel above Journey, exact IGDB storefront icon links with `+N` popover, IGDB ID pill, played-on platforms, notes, series/bundle links, media, read-only journey panel | `src/main.tsx:848-1110`, `src/components/store-icons.tsx`, `src/domain/store-links.ts`, `src/features/{media,series,bundle}.tsx` |
| Journey timeline | SVG strands, lane allocation, LOD culling, zoom/pan, range presets, virtualized Fit All | `src/features/journey.tsx`, `journey.css` |
| Discover / IGDB | 9 active feeds, paginated feed loader, Rust-ranked For You/Top Rated/Indie Spotlight/Story-Driven feeds, fuzzy/exact/ID search, one-click draft import, exact `external_games` storefronts, bounded LRU caches | `src/features/discover.tsx`, `src/data/igdb.ts`, `src-tauri/src/lib.rs`, `web/src/igdb.web.ts`, `docs/discovery-and-recommendation-algorithms.md` |
| Find My Next Game | Desktop-only, history-driven backlog recommender on Dashboard; Rust `get_backlog_recommendations` scores Backlog candidates from long-term/recent taste profiles, Bayesian quality, diversity, and explanations; frontend caches result once per app session with no refresh button | `src-tauri/src/lib.rs`, `src/data/recommendations.ts`, `src/features/dashboard.tsx`, `src/features/overview.css`, `docs/discovery-and-recommendation-algorithms.md` |
| Desktop store import (feature 9) | One-way Steam and Epic Games connectors, all HTTP/token handling in Rust; Steam owned/free games, public wishlist, achievements, status/date/mastery mapping, Epic catalog-id matching, reports, desktop-only UI, credential-safe export, user guide | `src-tauri/src/stores.rs`, `src/data/stores/`, `src/features/stores-settings.tsx`, `src/domain/game.ts`, `src/features/settings-data.tsx`, `docs/store-import-guide.md` |
| Generic CSV import | Settings panel that parses `,`/`;` CSV (BOM, quotes, CRLF), requires a `title` or `igdb_id` header, resolves by `igdb_id` first then strict `/ ` and generic title search, dedupes by id/title, fetches details in batches, supports cancel, progress and a copyable report; available wherever IGDB credentials are configured (web sets `hasTauri = true`, so the panel renders there too) | `src/data/stores/import.ts` (`parseCsv`, `parsePlaytimeSeconds`, `importCsv`, `csvReportSections`, `csvReportToText`), `src/features/settings-data.tsx:359-477` (`CsvImportSection`) |
| Stats | 13 visible categories (incl. Playtime), tiles, tabbed ECharts charts, year filter | `src/domain/stats.ts`, `src/domain/playtime.ts`, `src/features/stats.tsx` |
| Trophies | Six rarity tiers including `lostinsync`, badge gallery, `evaluate`/`topBadge` | `src/domain/trophies.ts`, `src/features/trophies.tsx` |
| Profile / dashboard | Banner editor with canvas image resize, collection actions, recents, wishlist, "pick up where you left"; animated favorites stage (mouse spotlight, flowing wave, rising/floating cards, sheen, pulsing dots) and IntersectionObserver-triggered odometer stats strip with `prefers-reduced-motion` fallbacks | `src/features/overview.tsx`, `src/features/dashboard.tsx` (`useReveal`, `Odometer`, `BigStat`), `src/features/overview.css` |
| Settings / data | Defaults, IGDB credentials, wipe library, JSON/CSV export, JSON import, Backloggd importer, generic CSV importer, IGDB sync with report | `src/features/settings.tsx`, `settings-data.tsx`, `src/data/{backloggd,sync}.ts`, `src/data/stores/import.ts` |
| Web app | Vite module swaps, IndexedDB + hash blob images, non-extractable AES-GCM credential vault, Cloudflare Worker IGDB proxy, Drive backup with conflict UI | `web/vite.config.ts:14-18`, `web/src/*`, `web/worker/src/index.ts` |
| Error handling | Global error boundary + window error/unhandled-rejection banners | `src/main.tsx:1061-1095` |

Note: `docs/roadmap.md` now correctly lists the Backloggd CSV importer under completed milestones; it is implemented in `src/data/backloggd.ts:147-205` (Tauri + IGDB credentials required). The separate generic CSV importer (2026-11-22) lives in `src/data/stores/import.ts` and is documented in `docs/features.md` and `docs/roadmap.md`; pasted-title import remains pending.

Note: feature 1 was originally titled "Played On and Completed Status Without Entry Screen", but its tracked request in the guide was replaced by the Add Game IGDB dropdown issue; that request is complete. Inline status/date editing in Details was never implemented and is no longer part of feature 1.

---

## 3. Partially Completed Features

| Feature | What works | What is missing / limited |
|---|---|---|
| Theme system | Single "Aurora" theme via CSS variables; `AppSettings.theme` literal `"aurora"` | No theme switching, no `data-theme`/provider, no light mode, many hard-coded colors, ECharts colors are JS constants. `docs/design-system.md` now marks its `[data-theme]` example as proposed. |
| Status changes | Fully changeable through the AddGame edit modal | No inline status/platinum/date control on cards or details; Details controls are `readOnly`. |
| IGDB sync | Field allow-list, chunking, report, staleness check | 401 clears token without retry; no HTTP timeout/429 handling in Rust; cannot run in plain browser dev mode. |
| Web app | Full shared UI + local-first persistence + cloud backup | No PWA; no `web/.env.example`; stale dead frontend copies in `web/worker/src/`; deploy target docs conflict; `hasTauri = true` hack. |
| Drive sync docs | Code uses `drive.file` and a normal root-level `"Lost in Sync"` folder | `web/README.md:30,43` claims hidden `appDataFolder` + `drive.appdata` scope. |
| Tauri opener capability | Works in all desktop builds | `tauri_plugin_opener::init()` is registered unconditionally; store sign-in and media links use it, with a `window.open` fallback only when the plugin is unavailable. |
| AppSettings fields | Declared and defaulted | `defaultView`, `libraryGenre`, `journeyRange`, `journeyZoom`, `journeyFit` have no consumers in `src/`. |

---

## 4. In-Progress Features (verification limited)

One diagnostic is intentionally active in source; no other feature can be confirmed as actively in progress from source alone. Clues worth verifying with git history before assuming:

- **Franchise game-type diagnostic:** `ALL_TYPES = true` in `src/domain/franchise.ts` currently counts every game type and logs `[franchise] { igdbIds, loaded }` after each load. This is pending a Mario total check; one franchise test (`counts only main/standalone/remake/remaster...`) intentionally fails until the switch is set back to `false`.
- **Steam free-game fix QA:** source-level tests prove the request flags and mapping, but a real `pnpm tauri:dev` re-fetch and confirmation that *Game of Thrones Kingsroad* appears as `Backlog` is still unverified.
- Debug instrumentation in `flushSave` (`src/main.tsx:173-188`) suggests recent work on full-save payload size.
- Web cloud sync code is more advanced than `web/README.md` describes (e.g. conflict handling, `uploaded[]`, `clearHistory` in `web/src/sync.ts` vs stale versions in `web/worker/src/sync.ts`) — likely a recently developed area, but **unverified**.

---

## 5. Pending Features (planned, not implemented)

From `docs/roadmap.md` and the current request list:

- Automated playtime tracking, launcher integration, multi-session log.
- Emulator deep links; additional CSV/pasted-title importers.
- Year-in-review image, tier list creator, custom themes.
- Inline played-on/completed status updates (original feature-1 idea; re-scoped to the dropdown fix, still not implemented); improved Discover relevance; theme system.
- Android app (isolated directory); Add Game search-appearance fix; backlog priority and manual intent-driven "What Should I Play Next?" controls (automatic history-driven Find My Next Game is implemented).
- Wishlist extras (price, reminders, bought-on, amount paid, spending stats); platform ownership.
- More import sources (CSV and pasted titles); shareable profile/statistics card.
- PWA install + offline caching.

All of the above are documented individually in `future_implementation_guide.md`.

---

## 6. Known Bugs (evidence-backed)

| Bug / issue | Location | Impact |
|---|---|---|
| Save path logs payload sizes on every save; former error-reporting catch is commented out | `src/main.tsx:169-188` | Console noise; failures only surface via the `.catch` that sets `error` |
| `error` toast is never cleared and has no dismiss control | `src/main.tsx:154-156,181-183`; `src/components/layout.tsx:30-35` | A stale error persists for the rest of the session |
| Tauri `load()` swallows all errors and returns `defaultData` | `src/data/repository.ts:103-105` | Corrupt/unreadable DB looks like an empty library |
| Unknown route renders empty page | `src/main.tsx:83,244-285` | No 404 fallback |
| `Empty` action button always says "Open library", even when the action adds a game | `src/components/shared.tsx:47-49` | Misleading CTA |
| `LibraryView` declares `deleteGame` prop but never uses it | `src/main.tsx:336,342` | Dead prop type |
| `web/README.md:14` references missing `web/.env.example` | `web/` directory listing | Setup confusion; `.env.local` exists but is gitignored |
| Stale dead worker frontend imports nonexistent modules | `web/worker/src/{entry.tsx,login-gate.tsx,sync.ts,cloud.css}` | Typechecking `web/worker/tsconfig.json` would fail; deployment unaffected (`wrangler.toml` builds only `src/index.ts`) |
| `new URL(VITE_IGDB_PROXY_URL)` unguarded | `web/vite.config.ts:58` | Malformed env value crashes config evaluation |
| `igdb_discover` uses `rating`/`rating_count` while the active feed path uses `total_rating`/`total_rating_count` | `src-tauri/src/lib.rs:642,652-656` vs `:757-761` | Legacy feed may return inconsistent data (runtime behavior not verified) |
| Orphaned image files after game deletion | No delete command; `src-tauri/src/lib.rs` | Disk usage grows |
| `opener:default` capability and plugin now registered in all desktop builds | `src-tauri/capabilities/default.json`; `src-tauri/src/lib.rs` | Store OAuth sign-in must open in the system browser |

---

## 7. Technical Debt

- **Monolithic `src/main.tsx`** hosts routing, state, library views, shelf/grid virtualization, and the 200-line `Details` component; docs claim these are separate feature views.
- **Full-document persistence** (`JSON.stringify` + IPC + UPSERT per mutation) has a scalability ceiling for large libraries.
- **No normalized schema / no generic migrations**; only `app_state` + `schema_migrations`, version 1 hard-coded.
- **Dead Rust domain structs** (`src-tauri/src/lib.rs:13-69`) plus file-level `#![allow(dead_code)]`; unused `tauri-plugin-log` and `log` crates.
- **~21 MB / 67 PNG assets** loaded eagerly in `src/features/trophies.tsx` (re-measured 2026-11-19; `docs/performance-optimization-report.md` was updated with current numbers and now marks the IGDB cache issue as resolved).
- **Documentation drift remains mainly in `web/README.md`** (deploy target, Drive scopes, missing `.env.example`); root `README.md` and `docs/` were refreshed for store import on 2026-11-21.
- **Testing coverage:** nine Vitest files (67 tests: game 2, journey-sort 4, playtime 8, store-links 5, Epic parser 2, Steam parser 9, matcher 12, import pipeline 21, franchise 4); 66 pass while `ALL_TYPES = true` because the franchise filter test expects `false`, and all 67 pass when the switch is restored. Plus 9 Rust unit tests (`src-tauri/src/stores.rs` 4, IGDB/store helpers in `lib.rs` 5); still no React tests, lint/format config, or configured jsdom environment.
- **Hard-coded colors** in feature CSS and ECharts options; partial-variable theming only.
- **Web dead code** in `web/worker/src/`; `hasTauri = true` workaround couples web UI to desktop semantics.
- **React 18 runtime / React 19 types** mismatch (`package.json:21-22,29-30`).

---

## 8. Important Technical Decisions (must be preserved or understood)

1. **Single `AppData` JSON blob** in SQLite `app_state`; additive TypeScript fields need no SQL migration.
2. **`AppRepository` adapter** for Tauri/localStorage/IndexedDB keeps one UI across platforms.
3. **Rust IGDB proxy** holds credentials, handles OAuth and CORS; web uses a stateless Cloudflare Worker instead.
4. **Bounded LRU + 20-min TTL** IGDB caches (`src/data/igdb.ts:36-52`) — already fix the "unbounded cache" issue in the old performance report.
5. **`FIELDS` allow-list** in `src/data/sync.ts:28-47` — IGDB sync must only refresh IGDB-owned fields; user fields stay local.
6. **Image externalization** (`img:` refs + files / hash-keyed blobs) keeps saves small.
7. **Session-only library and Journey prefs** — intentional; don't persist them without a product decision.
8. **Web module swaps** with all other source shared; web must maintain export parity with the three offline modules.
9. **Encrypted web credential vault**; credentials never in library, snapshot, or export.
10. **Drive conflict model** (`remote.modifiedTime` vs `meta.remoteModified`) — never silently overwrite newer remote data.
11. **Android must be isolated** in a separate directory with no changes to desktop/web dependencies or source (user requirement).
12. **Fit All sort is session-only and presentation-only** — the direction reverses only the overview rows; timeline geometry, lane colours and palette stay chronological (`src/features/journey.tsx`, `src/domain/journey-sort.ts`).
13. **Playtime stats use only user-recorded `totalSeconds`** — `src/domain/playtime.ts` ignores invalid/zero values and counts them as untracked; IGDB TTB values stay a separate, labelled estimate series; no session logs were added, so the Stats year filter attributes games by start/finish/add date (`touchedIn`). The old hidden `length` section remains untouched.
14. **Store links come only from IGDB `external_games`** — no platform-based guessing: rows without an HTTP(S) URL are dropped, sources are deduplicated and priority-ordered, and only two icons plus a `+N` hover/focus popover are shown. Desktop uses `igdb_external_games`; web uses `external_games` with a nested `games.external_games.*` fallback for workers that have not been redeployed with the new allow-list.
15. **Desktop store import is one-way and desktop-only** — connectors live in `src-tauri/src/stores.rs`, the webview receives only normalized records/status, and `StoresSection` returns `null` when `__TAURI_INTERNALS__` is absent. No web proxy or `web/*` store code was added.
16. **Store credentials never enter backups** — Steam key/SteamID64 are optional `AppSettings` fields stripped like IGDB credentials; Epic tokens stay in `<app_data>/store-credentials.json`; all are removed from JSON exports and Drive snapshots.
17. **Store game identity is `(store, storeId)`** — saved as optional `storeLinks` so re-sync links instead of duplicating, survives JSON round-trips, and is never overwritten by IGDB sync.
18. **Steam mapping guardrails** — wishlist → `Wishlist`; no real play/last-played date → `Backlog`; recent play → `Playing`; played but not recent → `Completed` with `rtime_last_played` as completion date. Start date is the earliest achievement unlock (safe fallback/clamped), mastery requires a non-zero total, `success: false` means zero achievements, and re-sync never overwrites user status edits.
19. **Free-to-play imports must include unlaunched licenses** — `GetOwnedGames` sends `include_all_free_games=1`, `include_free_sub=1`, `skip_unvetted_apps=0` and keeps `include_played_free_games=1`; zero playtime is never treated as a private-profile error. Wishlist uses `IWishlistService/GetWishlist/v1` with app-id title resolution.
20. **OAuth controls follow connection status** — Epic's sign-in page/code/complete controls render only when the connector is not connected; switching tabs or a failed fetch refreshes status so a removed token brings them back.
21. **Franchise totals come from IGDB `franchises` games merged with the library** — a game may appear under several franchises, only franchises with a completed game are shown, and remakes/editions collapse into one slot. `ALL_TYPES = true` is an active diagnostic that counts every game type; setting it to `false` restores main/standalone/remake/remaster filtering. Resolved rows live in SQLite `franchise_cache` on desktop (30-day TTL, key-scoped visible reads, signature invalidates old series-tree rows) and only in memory on web. Loading progresses per row; there is no header progress bar.
22. **Generic CSV import reuses the store import pipeline** — `importCsv` (`src/data/stores/import.ts`) shares `buildStoreGame`, `withRetry`, `igdbImportBatch`, `norm`, `ALL_PLATFORMS` and the report/progress idioms; no new data fields were added. A row is keyed by `igdb_id` when present (its title is ignored and may be empty or wrong), otherwise by normalized title with strict `/ ` then generic search. Dedupe checks the live library and the current file; cancellation is batch-granular. The panel is gated by `hasTauri && creds`, and because the web shim sets `hasTauri = true` it also renders in web builds with IGDB credentials.
23. **Dashboard motion is CSS-driven and reveal-gated** — `useReveal` uses one `IntersectionObserver` (threshold `0.35`, disconnect after firing) to trigger the stats odometer; each `BigStat` digit is a 0–9–0–9 reel that spins one extra turn before landing, with the real value exposed through `aria-label`. Favorites animations are staggered by a `--d` CSS variable (distance from the center slot). The entrance animation targets `.fav-section` rather than `.fav-stage` and `.fav-scroll` has `overflow-y: hidden`, preventing a transient scrollbar; `.big-stat > span` (direct child) keeps the label styling off the odometer reels. All new animations are disabled under `prefers-reduced-motion`.

---

## 9. Next Development Steps (logical, based on actual state)

1. **Housekeeping:** remove/relocate save debug logs and clear the error toast (`src/main.tsx:164-208`). The former Phase 1 items — Add Game dropdown dismissal (feature 1), Fit All asc/desc (feature 2) and dedicated Playtime stats (feature 3) — are now complete.
2. **Settle data-model extensions early** (all live in the JSON blob): ownership (12), wishlist price/payment/reminder fields (11), backlog priority (10) — keep them out of `src/data/sync.ts` `FIELDS`.
3. **Domain/analytics:** Discover ranking improvements and history-driven "Find My Next Game" are implemented (see `docs/discovery-and-recommendation-algorithms.md`); remaining work is manual backlog priority / intent-driven "What Should I Play Next?" controls (mood, available playtime, genre/priority overrides). Dedicated playtime stats and franchise completion view are complete; the hidden `length` section at `src/domain/stats.ts:21,401-412` was intentionally left alone.
4. **Import/sync:** re-fetch Steam in the running desktop app to confirm the free-game fix and Epic needs-review enrichment; the generic CSV adapter now ships, so only pasted-title import remains from feature 14; do live QA for Epic only when a real account is available.
5. **Presentation:** shareable profile/stats card after stats/badge data is stable.
6. **Packaging/platform:** harden WebApp config/docs, then PWA (depends on web), and Android in an isolated directory (can run in parallel with PWA).
7. **Housekeeping throughout:** keep `docs/` and this knowledge base in sync as code changes, add tests for new pure logic, verify desktop + web builds after each change.
8. **Close the franchise diagnostic:** compare the `[franchise]` console counts for Mario, decide which game types to count, set `ALL_TYPES = false`, accept one cache reload from the changed signature, and rerun `npm test`.

See `future_implementation_guide.md` for per-feature details and the full dependency/order analysis.

---

### Maintenance rules for future agents

- Do not assume completeness without inspecting the implementation.
- Keep implemented / partial / planned strictly distinguished.
- Do not invent history or claim recent changes without evidence.
- Mark unverifiable claims as **unverified**.
- Update this file whenever a feature's status changes.
