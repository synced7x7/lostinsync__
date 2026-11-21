# future_implementation_guide.md — feature-specific navigation for AI agents

> **Documentation only.** This file tells future agents where to work; it does not implement anything. Existing paths were verified on 2026-11-19, refreshed for store import on 2026-11-21 and for generic CSV import on 2026-11-22. Paths marked **[proposed]** do not exist yet. Line numbers are starting points and may drift — verify before editing.
>
> Reading order: `PROJECT_CONTEXT.md` → `PROJECT_STATUS.md` → the relevant feature entry here → only the listed files and their immediate dependencies.

**Feature index:** A. Improvements — 1 Played/completed inline, 2 Fit All sort, 3 Gameplay time stats, 4 Discover algorithm, 5 Theme system, 6 WebApp, 7 Android, 8 Add Game search bug, 9 Steam sync, 10 Backlog priority / play next. B. Wishlist — 11 Wishlist extras, 12 Platform ownership, 13 Franchise completion (done). C. Import/export — 14 More import sources, 15 Shareable card. D. PWA — 16 Installation & offline caching.

**Completed:** features 1 (Add Game IGDB dropdown closes on outside click / Escape), 2 (Fit All ascending/descending toggle), 3 (dedicated Playtime stats category from recorded `totalSeconds`), 9 (desktop one-way store import/Steam sync, 2026-11-21) and the CSV half of 14 (generic CSV importer, 2026-11-22). All are verified in source; see their entries below. Feature 1's heading is legacy — its tracked request was re-scoped to the dropdown issue, and inline Played/Completed editing was not implemented. Feature 14 is only partially complete: pasted-title import is still pending.

---

# A. EXISTING FEATURE IMPROVEMENTS

## 1. Played On and Completed Status Without Entry Screen — COMPLETED

**Status: Completed (2026-11-19).** Verified in source (commit `c864403`).

**Original request (resolved):** When a user enters or clicks the add a game from the library and after that when user types a name theres a suggestions of dropdowns of games that mmatches the igdb which is okay but the problem is when the user wants to add custom games he doesnt need the dropdown but still if the name matches the igdb game name then the dropdown persists . so what i am expecting that the dropdown should get removed when user clicks other parts of the screen.

**What was implemented (`src/features/library-components.tsx`):** a `titleBox` ref on the Title label plus a document-level `mousedown` listener closes the IGDB suggestion dropdown on any outside click (`:39-44`); Escape in the title input also closes it (`:200`). Typing still opens the dropdown (`:201`) and `pick()` still fills the form. No data-model or Tauri changes.

**Scope note:** the heading is legacy. The tracked request is the dropdown issue above, not inline Played/Completed editing; inline status/date controls in Details remain unimplemented and are no longer part of this feature.

---

## 2. Ascending/Descending Button in Fit All Mode — COMPLETED

**Objective:** Add ascending/descending sort controls to the Journey "Fit All" overview.

**Status: Completed (2026-11-19).** Verified with `pnpm typecheck`, `pnpm test` (6 tests total, 4 new), `pnpm build`, and `npx vite build --config web/vite.config.ts`.

**Implementation (completed):**

- `src/domain/journey-sort.ts` — `sortJourneyRows(rows, direction)` sorts by `start` with an `id` tie-breaker and reverses for `"desc"`; returns a new array, never mutates input.
- `src/features/journey.tsx` — Journey `session` now has `fitDirection: SortDirection` (default `"asc"`); `fitDirection` state/ref, `toggleFitDirection`, and a toolbar button next to Fit All (shown only in fit mode). `base.sorted` uses the same comparator so ties are deterministic; `fitRows` is derived from `base.sorted` via `sortJourneyRows` and passed to `FitView` as an explicit prop. Timeline geometry, lane allocation and `PALETTE` colours remain chronological.
- `src/features/journey.css` — `.jn-fit.jn-sort` keeps the toggle's width stable as the label changes.
- `src/domain/journey-sort.test.ts` — 4 Vitest cases: ascending, descending, equal-start ties, and no mutation / empty or single rows.

**Decisions resolved:** sort key is `start` with an `id` tie-break; the order applies only to Fit All rows (timeline layout is untouched); direction is intentionally session-only, consistent with the existing Journey prefs design. `AppSettings.journeyRange/Zoom/Fit` remain unused — no settings or persistence changes.

**Database Changes:** None — no JSON or SQL fields were added.

**Verification still recommended:** manual QA of the toggle's scroll reset and row order in both desktop and web builds (no DOM/component test harness is configured).

---

## 3. Gameplay Time Statistics Section — COMPLETED

**Objective:** Introduce a dedicated gameplay time statistics section.

**Status: Completed (2026-11-19).** Verified with `pnpm typecheck`, `pnpm test` (14 tests total, 8 new), `pnpm build`, and `npx vite build --config web/vite.config.ts`.

**Implementation (completed):**

- `src/domain/playtime.ts` — pure helpers: `playtimeHours` (seconds → hours; missing, invalid, zero and negative values mean "untracked"), `summarizePlaytime` (total, tracked/untracked counts, mean, median, longest, shortest, completed-game hours), `playtimeBuckets` (distribution bands, boundaries in the higher band).
- `src/domain/playtime.test.ts` — 8 Vitest cases: empty/single/many libraries, median vs mean, invalid/negative inputs, completed-only total, and bucket boundaries.
- `src/domain/stats.ts` — added `"playtime"` to `CategoryId`, a third `CATEGORIES` entry (title "Playtime", tone gold), a `play` field in the `index()` row model fed by `totalSeconds`, a `playtime()` section builder, and its `BUILD` registration. The section has 8 tiles (total, average, median, longest/shortest game, completed time, tracked/untracked counts), 5 ECharts charts (playtime distribution, tabbed longest/shortest games, hours by status, hours by genre, logged vs IGDB estimate) and a story note about the year filter.
- `src/features/stats.tsx` — `Clock3` icon mapped to the new `playtime` category. No CSS changes were needed; existing tile/chart styles were reused.

**Decisions resolved:** the section lives in Stats and aggregates existing `totalSeconds` — no new data fields, no session logs. IGDB TTB values are never mixed into playtime figures; they appear only as a separate, muted "IGDB average (estimate)" series in one clearly labelled chart. Games with zero/missing time count as untracked. Because playtime has no per-session dates, the Stats year filter selects games by start/finish/add date (`touchedIn`) rather than splitting hours, and a story card says so. The pre-existing hidden `length` section was intentionally left untouched and remains commented out of `CATEGORIES`.

**Database Changes:** None — pure aggregation over existing fields; no JSON or SQL fields were added.

**Verification still recommended:** manual QA of the new charts and the year filter in both desktop and web builds (jsdom has no real canvas; no component-test harness is configured).

---

## 4. Improve Discover Algorithm

**Objective:** Improve the relevance of game recommendations in Discover.

**Current Implementation:**

- Feed config `sections` in `src/features/discover.tsx:9-20` (10 feeds); `DiscoverView` (`:46-135`) derives genres from `data.games.flatMap(g => g.genres ?? [g.genre])` (`:57`), loads 20 items per feed with 3 concurrent workers via `igdbDiscoverFeedCached` (`:61-83`), and supports search/hover prefetch.
- `FeedPage` (`:191-222`) loads pages of 30, stops at `< 30` or `>= 100`; `DiscoverCard`, `FeedSection`, `SimilarShelf`, `DiscoverGameDetails`, `draftFromIgdb` (`:225-315`).
- Server ranking: `src-tauri/src/lib.rs` `igdb_discover_feed` (`:734-806`) uses genre-name filters (`:748-761`) and per-feed `where`/`sort` (`:775-798`); `offset.clamp(0,90)`, `limit.clamp(1,30)` (`:799-800`). Legacy `igdb_discover` (`:630-731`) is unused by the UI. `trending_games` (`:219-266`) uses `popularity_primitives`.
- Types `IgdbDiscoverGame` already include `rating`, `ratingCount`, `hypes`, `follows`, `summary` (`src/data/igdb.ts:24-27`).
- Client caches: `memo()` LRU + 20-min TTL (`src/data/igdb.ts:36-52`), `igdbDiscoverFeedCached` (`:90-91`).
- Web parity: `web/src/igdb.web.ts:80-84` (`discoverItem`), `:152-156` (field lists), `:166-210` (feed implementations) must mirror any Rust change.
- There is **no client-side scoring, deduplication, or exclusion of owned games**; "For You" only matches up to 3 genre names.

**Probable Files to Modify:**

- `src/features/discover.tsx` — genre profile, feed composition, re-ranking/dedupe/exclusion.
- `src/data/igdb.ts` — type additions and cache keys if new metadata is needed.
- `src-tauri/src/lib.rs` — `igdb_discover_feed` (`:734-806`), `discover_item` (`:272-278`), query `fields`.
- `web/src/igdb.web.ts` — mirror all Rust/query changes (`:80-84,152-156,166-210`).
- `src/domain/gametype.ts` — if filtering DLC/bundles client-side.
- `src/features/discover.css` / `src/features/dashboard.tsx` — only for new UI surfaces.

**Potential New Files (proposed):**

- **[proposed]** `src/domain/recommend.ts` — pure scoring/dedupe/exclusion over `IgdbDiscoverGame[]` and `Game[]`.
- **[proposed]** `src/domain/recommend.test.ts`.
- **[proposed]** `src-tauri/src/discover.rs` — optional extraction of query builders.

**Implementation Approach:** Start with low-risk client-side post-processing: exclude games already in the library (by `igdbId`, then normalized title), deduplicate across feeds, apply a minimum rating-count floor or Bayesian-style score using existing `rating`/`ratingCount`/`hypes`, and weight user genres by frequency. Keep IGDB-authored feeds and re-rank them rather than rebuilding the system. If query changes are needed, update Rust and web together.

**Dependencies and Integrations:** Discover UI, IGDB wrappers/caches, Rust command, web proxy client, `GAME_TYPES`/`matchesGameType`, game type filters in feed queries (`lib.rs:785,790,794`).

**Database Changes:** None. If new card metadata is needed, extend `IgdbDiscoverGame`, `discover_item`, web `discoverItem`, and both `fields` strings (no SQL).

**Potential Challenges:** IGDB rate limits (3 desktop workers, 260 ms web slot); pagination caps (offset ≤ 90, limit ≤ 30, UI cap 100); free-text `game.genre` may not match IGDB names; `rating` vs `total_rating` inconsistency between legacy and active paths; web/desktop drift if one implementation is changed alone.

**Testing Requirements:** Unit tests for scoring, dedupe by id, exclusion by `igdbId`/normalized title, stable ordering, empty inputs; manual parity check desktop vs web; no live network calls in unit tests.

**Investigation Required:** Definition of "better" (relevance, novelty, owned-game exclusion, platform filter); whether to re-rank client-side or change queries; available IGDB fields; whether `forYou` should use more than 3 genres.

---

## 5. Theme System

**Objective:** Improve or introduce a consistent application-wide theme system.

**Current Implementation:**

- Tokens in `src/style.css:25-44` (`:root`): `--bg`, `--panel`, `--panel-strong`, `--line`, `--line-soft`, `--text`, `--muted`, `--dim`, `--accent`, `--accent-strong`, `--cyan`, `--rose`, `--success`, `--shadow`, `--radius`; literal colors also at `:27-28,52-56`.
- Single theme: `AppSettings.theme: "aurora"` (`src/domain/game.ts:30`), default at `:66`; `SettingsView` renders a static "Aurora" pill (`src/features/settings.tsx:18`); no `data-theme`, class toggle, provider, or `prefers-color-scheme` exists.
- Settings persistence already works: `updateSettings` (`src/features/settings.tsx:8-10`) → `update` → 500 ms save; defaults merge in `src/data/repository.ts:23,89-93`.
- Local component vars: `--p`, `--c`, `--rc` (`src/components/rarity-badge.tsx:11`), `--g` (`src/features/trophies.css:16-20`), `--tc` (`src/features/stats.css:2-22`).
- ~151 hard-coded color literals remain across feature CSS; ECharts palette constants `C`, `MUTED`, `AX`, `TIP`, `LEG` (`src/domain/stats.ts:101-114`) are JS values. Web adds `web/src/cloud.css` and stale `web/worker/src/cloud.css` hard-coded colors.
- `docs/design-system.md` now explicitly marks `[data-theme="ember"]` overrides as a proposed pattern that is not implemented.

**Probable Files to Modify:**

- `src/domain/game.ts` — widen `theme` from literal to union/string + defaults (`:30,66`).
- `src/features/settings.tsx` — replace static pill with a selector using `updateSettings`.
- `src/main.tsx` — apply active theme to the root element near the existing document effect (`:95-127`).
- `src/style.css` — move tokens into theme selectors; remove literal `:root`/`body` colors.
- `src/features/*.css` — replace hard-coded colors with semantic variables (start with `overview.css`, `journey.css`, `stats.css`).
- `src/domain/stats.ts` — derive ECharts colors from CSS variables or pass a theme object.
- `web/src/cloud.css`, `web/worker/src/cloud.css` — web-only surfaces.
- `web/vite.config.ts:36-54` — CSP `style-src` if injecting inline style tags.

**Potential New Files (proposed):**

- **[proposed]** `src/domain/theme.ts` — theme IDs, metadata, `applyTheme()`.
- **[proposed]** `src/features/theme-picker.tsx`.
- **[proposed]** `src/themes/themes.css` — variable overrides.
- **[proposed]** `src/domain/theme.test.ts`.

**Implementation Approach:** Introduce a theme ID union and a small `applyTheme()` that sets `data-theme` on `document.documentElement`; add `[data-theme="..."]` variable blocks; persist through `updateSettings`; progressively replace hard-coded colors. Charts need option recomputation on theme change. Validate/legacy-fallback unknown saved theme values in repository default merge.

**Dependencies and Integrations:** Settings state/persistence, root DOM attributes, all CSS modules, ECharts options, web cloud CSS, PWA manifest colors (feature 16), share-card styling (feature 15), profile `accent`.

**Database Changes:** None (JSON blob). Old `"aurora"` values remain valid; unknown values need fallback logic. Rust `Settings.theme: String` is dead code — ignore.

**Potential Challenges:** Partial theming until all hard-coded colors are migrated; `:root`/`body` literals override variables; ECharts canvas colors are not CSS-driven; inline gradients in `Details` (`src/main.tsx:890,899`) and `ringColor` (`:876`); web login gate is outside the app shell; no runtime validation of saved theme strings.

**Testing Requirements:** Pure tests for ID/fallback logic; jsdom test that selecting a theme calls `update` with the expected `settings.theme` and sets the root attribute; manual visual check across themes (no visual regression tooling).

**Investigation Required:** Multiple full themes vs accent-only switching vs system preference; theme IDs; treatment of unknown saved values; whether web login gate should follow themes.

## 7. Android Application

**Objective:** Provide an Android version, isolated in a separate directory so the offline desktop app and web app are unaffected.

**Current Implementation:**

- Tauri v2 is already configured: `package.json:11-12` scripts, `@tauri-apps/api` (`:15`), CLI (`:28`), `src-tauri/Cargo.toml:13-15` crate types (`staticlib`, `cdylib`, `rlib`), `src-tauri/tauri.conf.json:38-40` Android debug suffix, `src-tauri/icons/android/` resources, and `#[cfg_attr(mobile, tauri::mobile_entry_point)]` on `run()` (`src-tauri/src/lib.rs:1169`).
- No `android/` directory and no Capacitor dependency exist.
- Native persistence, commands, image storage are reusable from `src-tauri/src/lib.rs`; shared domain/UI in `src/domain/*`, `src/data/repository.ts` (`AppRepository`, `TauriAppRepository`), `src/data/igdb.ts`.
- Current capability file is desktop-targeted: `src-tauri/capabilities/default.json:2` schema, windows `["main"]` (`:5-7`).
- Auto-fullscreen in `src/main.tsx:95-127` is desktop-oriented; web suppresses it via monkey-patch.

**Probable Files to Modify (only as required by Tauri CLI):**

- `src-tauri/tauri.conf.json` — Android identifiers/bundle settings (existing Android block at `:38-40`).
- `src-tauri/Cargo.toml` — only if a native crate is genuinely needed.
- `src-tauri/src/lib.rs` — mobile setup / new commands (`:1169-1207`) and handler list (`:1187-1204`).
- `src-tauri/capabilities/default.json` or a new mobile capability file — permissions/schema.
- Root `package.json` — only if adding Android scripts.
- **Do not modify** `web/vite.config.ts`, `web/src/*`, or shared UI for Android-specific reasons.

**Potential New Files (proposed):**

- **[proposed]** Tauri CLI-generated Android project — conventionally `src-tauri/gen/android/` (**verify with the installed Tauri CLI; not present now**).
- **[proposed]** `src-tauri/capabilities/mobile.json` — exact schema depends on CLI version.
- **[proposed]** `docs/android.md` — setup/build/test instructions.

**Implementation Approach:** Use Tauri v2 Android (justified by existing mobile config, crate types, icons, and mobile entry-point attribute; Capacitor is absent). Generate the Android project into its own directory; add mobile capabilities separately; share `src/` unchanged; reuse `TauriAppRepository` and the existing SQLite/image commands. Define an explicit fullscreen policy for mobile.

**Dependencies and Integrations:** Tauri CLI/Android SDK/JDK/Gradle (tooling, not npm deps), existing SQLite/IGDB/image commands, capabilities/CSP, shared domain/UI.

**Database Changes:** None required — `app_state` JSON blob and migration v1 are reused. Additive fields use `defaultData` merging; a separate cache table would need a new migration version.

**Potential Challenges:** Desktop capability schema targets window `main`; mobile permissions differ; fullscreen/rotation/viewport behavior; asset protocol paths and `tauri-plugin-dialog` behavior on Android; CSP origins for any new API; avoiding any dependency/build changes to desktop/web.

**Testing Requirements:** `pnpm typecheck`, `pnpm test`, `pnpm build` and desktop `pnpm tauri:build` as regression; Android build via Tauri CLI separately; manual Android smoke test (cold start, save/load, images, IGDB search, dialogs, fullscreen, rotation, offline launch).

**Investigation Required:** Exact CLI-generated directory layout for the installed Tauri version; mobile capability schema; whether `opener`/`dialog` plugins are appropriate on Android; responsive UX of `AppLayout`/`Sidebar` on a phone viewport.

---

# 9. Steam and Epic Synchronization (one-way store library import)

**Status: Implemented (2026-11-21).** Source-level checks pass; live Steam and Epic re-fetch QA is still pending. This entry is kept as the implementation record for feature 9.

Objective: Import owned games, playtime, wishlist data and achievements from Steam, and owned games from Epic Games, into the local library. DESKTOP ONLY. The web app gets the result only through the normal JSON export/import.

DECISIONS (final, from owner)
- Desktop-only feature. Do NOT add store connections to the web app. Skip all `web/*` items (worker allow-list, igdb.web.ts, vite config, env.d.ts). No web proxy.
- Stores in scope: Steam and Epic Games. Other stores are out of scope.
- This relaxes the old "never touch the offline app" rule for this feature only. Changes are additive: new files, new optional fields, no change to existing behaviour.
- JSON export/import stays interchangeable desktop <-> web. Store-imported games use the existing Game schema. New fields are optional so old builds and the web ignore them.
- Never put store credentials/tokens in the export or the web Drive snapshot. Strip them exactly like the IGDB creds.
- Store-imported games use remote IGDB image URLs for cover/screenshots. Do NOT save store art into the desktop `images/` folder.
- Two-way sync is out of scope. Stores are a one-way source.
- Status is set on first import only. Re-sync refreshes store-owned fields but never overwrites manual status.
- Epic sign-in controls follow connection status: they are hidden after a successful connection and reappear when the token is missing or removed.

ARCHITECTURE (connector pattern)
- One small connector contract per store: `id`, `name`, `capabilities`, normalized `StoreRecord`, one desktop-only settings UI.
- Shared logic: normalize, match to IGDB, cache the match, dedupe/merge, build the `Game`, report + progress UI, and a "needs review" list for unmatched games.
- Identity of a game = `(store, storeId)`. Saved as optional `storeLinks?: {store, id}[]` so re-sync never duplicates and it survives export/import.
- Capability flags (needs sign-in, has playtime, has achievements, uses OAuth) let the UI adapt without store-specific branches.
- All store HTTP runs in Rust (`src-tauri/src/stores.rs`, called from Tauri commands in `lib.rs`). Epic tokens live in a Rust-managed credentials file; Steam keys/SteamID64 live in desktop settings like IGDB keys. The webview never sees tokens.
- Every endpoint URL lives in the Rust connector module so an unofficial API change is a one-file fix.

STORE ENDPOINTS

Steam (official Web API)
- Owned games: `GET https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` with `key`, `steamid`, `include_appinfo=1`, `include_played_free_games=1`, `include_all_free_games=1`, `include_free_sub=1`, `skip_unvetted_apps=0`, `format=json`.
  - Returns `response.game_count` and `response.games[]` with `appid`, `name`, `playtime_forever` (MINUTES), `playtime_2weeks`, `rtime_last_played` (unix seconds), and related fields.
- Achievements: `GET https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/?key&steamid&appid`. `achieved` and `unlocktime` feed achievement counts and start date; `success: false` is treated as zero achievements, not an error.
- Store metadata, no key: `GET https://store.steampowered.com/api/appdetails?appids=ID&filters=basic`.
- Auth: user's free Web API key + 17-digit SteamID64. A key does NOT override privacy. Profile "Game details" must be Public; zero playtime is not a private-profile signal. Claimed free games with no launch history are imported as `Backlog`.
- Wishlist: `GET https://api.steampowered.com/IWishlistService/GetWishlist/v1/?steamid=STEAMID64&format=json`. It returns app ids only, so Rust resolves names from owned-game titles first, then appdetails. Private/empty wishlists produce a warning, not a failure. Ownership wins when an app is in both lists.

Epic Games (unofficial; no official public library API)
- Auth: OAuth2 with Epic's public launcher client id. The user opens the browser sign-in URL, signs in, copies the `authorizationCode`, and Rust exchanges it for an access token. Tokens are stored only in `<app_data>/store-credentials.json`.
- Library: `GET https://library-service.live.use1a.on.epicgames.com/library/api/public/items?includeMetadata=true&cursor=CURSOR`, paginated by cursor with a Bearer token.
- Catalog details: `GET https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/{namespace}/bulk/items?id={catalogItemId}&includeDLCDetails=true&includeMainGameDetails=true&country=US&locale=en`, used to resolve missing display names and to provide a direct IGDB lookup key.
- `ue` namespace items are skipped and catalog ids are de-duplicated.
- Playtime, last played and achievements are not inferred; Epic is ownership-only.
- IGDB `external_games` source for Epic is 26.

IGDB MATCHING ORDER (shared)
1. Epic: direct `igdb_epic_lookup` by catalog item id / `external_games.uid`, with title tie-breaking. Steam: direct `igdb_external_lookup` by `(source, uid)`; source ids are Steam 1 and Epic 26.
2. Fallback: cleaned Epic titles strip trademark marks and common edition suffixes. Strict `/ ` title search, then a unique normalized-title match.
3. Ambiguous or missing matches go to the "needs review" list; no fuzzy guess is made.
4. Cache `(store, storeId) -> igdbId` for the current session. Stored `storeLinks` survive across sessions and later syncs can enrich a previously unmatched game.

MAPPING (what stores can fill)
- Owned list, title, store id: Steam and Epic. Wishlist: Steam only.
- Total playtime: Steam (`playtime_forever` minutes -> `totalSeconds`). Epic does not provide it.
- Last played: Steam `rtime_last_played`.
- Achievements: Steam only.
- Purchase date: not reliably available.
- Start date: earliest unlocked achievement time, otherwise the earlier of add date and last-played date, clamped so it never follows completion.
- Status: wishlist -> `Wishlist`; no real play/last-played date -> `Backlog`; `playtime_2weeks > 0` -> `Playing`; played but not recent -> `Completed`, with `rtime_last_played` as the completion date. Epic first imports as `Backlog`.
- Mastery: `platinumed = true` only when `total > 0 && achieved >= total`; zero-total games are never mastered.
- Never overwrite user-entered fields. Re-sync refreshes only store-owned fields (playtime, last played, achievement counts, store ids) and leaves manual status edits alone.

CURRENT IMPLEMENTATION
- `src/domain/game.ts` — optional `storeLinks`, `steamPlaytimeSeconds`, `lastPlayedAt`, `storeAchievements`; `StoreId = "steam" | "epic"`; `AppSettings.steamApiKey`, `steamId`, `lastStoreSyncAt`, `storeSyncSource`. No SQL migration was needed.
- `src-tauri/src/stores.rs` — endpoint constants, Rust HTTP/auth, Steam owned/wishlist/achievement parsing, Epic library/catalog title resolution, `store-credentials.json`, and Epic token exchange. Rust `steam_owned_query()` sends the free-game flags; zero playtime is kept.
- `src-tauri/src/lib.rs` — registers `stores_status`, `stores_auth_url`, `stores_complete_auth`, `stores_fetch`, `stores_fetch_achievements`, `igdb_external_lookup` and `igdb_epic_lookup`.
- `src/data/stores/ipc.ts` — typed dynamic Tauri IPC wrappers; `__TAURI_INTERNALS__` gates desktop usage.
- `src/data/stores/types.ts` — Steam/Epic connector catalog, capabilities, normalized `StoreRecord`, report types and `stripStoreCredentials`.
- `src/data/stores/steam.ts` — pure parsers for owned games, keyless wishlist app ids, and achievements.
- `src/data/stores/epic.ts` — pure parser for cursor-paged library records.
- `src/data/stores/match.ts` — session-cached IGDB matching and Epic title cleanup.
- `src/data/stores/import.ts` — `steamMapping`, `storePatch`, `buildStoreGame`, `fetchStoreRecords`, `importFromStore`; dedupe by `(store, storeId)` first, then IGDB id, then normalized title. Stores use only remote IGDB images.
- `src/features/stores-settings.tsx` — desktop-only settings panel with Steam fields, status-driven Epic sign-in, fetch/import phases, progress, cancellation and a copyable report.
- `src/features/settings-data.tsx` — strips IGDB/Steam credentials and store tokens from JSON export/import and preserves current-device keys.
- `src/domain/store-links.ts` and `src/components/store-icons.tsx` — display IGDB storefront links/icons, hiding the removed source id.
- `docs/store-import-guide.md` — user-facing setup and full field mapping.
- `src/data/sync.ts` `FIELDS` was left unchanged; store-owned and user-owned fields are not refreshed by IGDB sync.

Steam behavior (implemented)
- Owned games include all free licenses, including claimed-but-never-launched titles; *Game of Thrones Kingsroad* (app 4214820) is the regression case.
- Wishlist uses `IWishlistService/GetWishlist/v1`, resolves app-id titles from owned games or appdetails, and yields to ownership when duplicated.
- Achievements are always fetched for owned games; `success: false` means no achievements. Earliest unlocked time feeds `startedAt`; all-unlocked with a non-zero total sets `platinumed`.
- Played requires both `playtimeMinutes > 0` and a real `lastPlayedUnix`; otherwise the game is `Backlog` (or `Wishlist` when wishlist-only).
- Recently played (`playtime_2weeks > 0`) -> `Playing` with no completion date. Played but not recent -> `Completed` with `finishedAt = rtime_last_played`.
- `totalSeconds` is replaced only when it is still Steam's value or untouched; user-entered playtime and status survive later syncs.

Epic behavior (implemented)
- Sign-in controls are shown only while the panel is not connected; tab changes and failed fetches refresh connection status.
- Library records are de-duplicated by catalog id; `ue` namespace items are skipped; missing titles are resolved through the public catalog endpoint.
- Matching tries the catalog id against IGDB first, then a cleaned strict/unique title search. Previously unmatched games can be enriched on a later re-sync.
- First import sets `Backlog`. No playtime, dates, achievements or mastery are guessed.

Connector coverage and limits
- Steam: official API, fully implemented; live QA still needed after the free-game fix.
- Epic: unofficial launcher API, ownership-only; live behavior can break without notice.
- IGDB source ids: Steam 1 and Epic 26. Unmatched or ambiguous games are imported locally with a reason and listed for review.
- No community-XML/SteamID vanity fallback was added; users enter a 17-digit SteamID64.

Testing (implemented, mocked only)
- Vitest: 8 files / 63 tests covering parsers, connector catalog, dedupe priority, IGDB matching, title cleanup, status/date/mastery rules, user-field preservation and report generation.
- Rust: 9 unit tests (4 in `stores.rs`, 5 in `lib.rs`) for free-game flags, achievement handling, Epic token/title resolution and IGDB helper queries.
- Verification run on 2026-11-21: `pnpm test`, `pnpm typecheck`, `pnpm build`, `cargo check --all-targets` and `cargo test` pass.

Open items / risks
- Live re-fetch in `pnpm tauri:dev` must confirm that *Game of Thrones Kingsroad* appears as `Backlog`.
- Live Epic QA must confirm that previously needs-review games are now linked/enriched; no credentials should be logged during QA.
- CSV/pasted-title import remains a separate pending feature and can now reuse this pipeline.
---

## 10. Backlog Priority and "What Should I Play Next?"

**Objective:** Let users prioritize backlog games and receive a recommendation based on current mood, available playtime, and preferred genre.

**Current Implementation:**

- No priority/order field exists in `Game` (`src/domain/game.ts:6-21`), `AppSettings` (`:29-47`), or `LibrarySort` (`:26`). The older `order?` mention was removed from `docs/database-schema.md` when it was corrected on 2026-11-19; the field does not exist.
- Library prefs: `LibraryPrefs`, `libraryDefaults`, `SORT_OPTIONS` (`src/domain/library-session.ts:3-33`), `librarySession` memory-only (`:36`); sorting in `compareGames` (`src/main.tsx:300-314`) and controls at `:368-377`.
- Add/Edit tracking controls: dates, hours, game type, status, rating, trophy (`src/features/library-components.tsx:226-248`) — no priority.
- Dashboard: `topFive` picks (`src/features/dashboard.tsx:88-90`), `recent` excludes Backlog/Wishlist and ranks Playing > Completed then recency (`:92-109`), wishlist section (`:111`), "PICK UP WHERE YOU LEFT" (`:183-202`).
- Discover "For You" is IGDB-based: genres from library (`src/features/discover.tsx:57`) passed to `igdbDiscoverFeedCached` (`:71`) and labelled "BASED ON YOUR LIBRARY" (`:152`).
- Stats: `OFF = ["Backlog","Wishlist"]` (`src/domain/stats.ts:31`), `index()` signals (`:35-47`), `insights()` taste traits (`:471-503`), `BUILD` (`:505`).
- Scoring inputs already available: `Game.rating`, `favorite`, `totalSeconds`, `timeAvgSeconds`, `genres`, `status`, `startedAt`/`finishedAt`, `igdbRating`.

**Probable Files to Modify:**

- `src/domain/game.ts` — priority field, `"priority"` in `LibrarySort`, default (`:6-21,26,61-77`).
- `src/domain/library-session.ts` — `SORT_OPTIONS` label (`:22-33`).
- `src/main.tsx` — `compareGames` case (`:300-314`); Details display near "MY JOURNEY" (`:1007-1020`).
- `src/features/library-components.tsx` — priority input in tracking controls (`:226-248`).
- `src/features/dashboard.tsx` — "What Should I Play Next?" near existing recents (`:183-202`).
- `src/style.css` — new controls/cards.
- `src/features/discover.tsx` — only if local recommendations are integrated into Discover.

**Potential New Files (proposed):**

- **[proposed]** `src/domain/recommend.ts`, `src/domain/recommend.test.ts`, optionally `src/domain/priority.ts`.

**Implementation Approach:** Add an optional priority value (1–5 or high/medium/low) to `Game`, expose it in the edit form and library sort, and build a pure scorer that filters eligible games (Backlog/Playing; exclude Completed/Abandoned/Shelved), then combines manual priority with genre preference, mood, available time (`timeAvgSeconds`/`timeMainSeconds`), rating/favorite, and recency tie-breakers. Render the result on the Dashboard with an explanation. Keep it independent of IGDB network calls.

**Dependencies and Integrations:** Backlog status (`STATUSES`), library sort, dashboard, stats indexing (genre/time signals), Discover recommendation concepts (feature 4), IGDB sync allow-list (must not overwrite priority).

**Database Changes:** None at SQL level; additive `priority?: number` in the JSON blob with a fallback for old games. Keep it out of `src/data/sync.ts` `FIELDS`.

**Potential Challenges:** Product ambiguity (absolute order vs importance tier vs weight); tie-breaking; Backlog/Wishlist eligibility policy; missing IGDB metadata; "mood/available time" inputs need UI; "For You" already means something else in Discover.

**Testing Requirements:** Vitest scorer tests (priority wins, eligibility, tie-breaks, missing metadata, deterministic order, manual override); sort test; manual QA with an old library lacking priorities and after IGDB sync.

**Investigation Required:** Scoring formula, manual vs computed priority, placement of the UI, whether Wishlist is eligible, and whether any intended ordering design from the old docs still applies.

---

# B. WISHLIST IMPROVEMENTS

## 11. Wishlist Extras

**Objective:** Extend the wishlist with price, release-date reminders, Bought On date, Amount Paid, and total wishlist-related spending in Statistics.

**Current Implementation:**

- `"Wishlist"` is a status (`src/domain/game.ts:3`); `Game` has `releaseDate?`, `createdAt`, `startedAt?`, `finishedAt?` (`:9-10`) but no price/payment/reminder/currency fields.
- Date controls: `DateField` (`src/components/shared.tsx:221-303`), `parseDate`/`formatDate` (`:200-219`); used in the edit form (`src/features/library-components.tsx:213,228-229`).
- Details display: Release line (`src/main.tsx:911-929`), read-only journey grid (`:1007-1020`).
- Stats plumbing: `Tile`/`ChartSpec`/`Section` (`src/domain/stats.ts:5-10`), `CATEGORIES` (`:12-26`), `T()` (`:68`), `overview()` (`:248-265`), `BUILD` (`:505`), `StatsView` tiles (`:98-104`).
- Dashboard already shows wishlist games (`src/features/dashboard.tsx:111,209-221,241-252`); CSV export has a Release date column (`src/features/settings-data.tsx:26-37`).
- **No notification/reminder infrastructure** and **no currency handling** exist anywhere in `src/`, `web/src/`, or `src-tauri/`. Web's `setInterval` is only Drive sync.

**Probable Files to Modify:**

- `src/domain/game.ts` — new optional fields + `AppSettings` currency (`:6-21,29-47`), defaults (`:61-77`).
- `src/features/library-components.tsx` — form inputs in tracking/pricing area (`:213-248`).
- `src/main.tsx` — Details display (`:911-929,1007-1020`).
- `src/domain/stats.ts` — spending aggregation/tile (add to `CATEGORIES`/`BUILD`).
- `src/features/stats.tsx` — render new tile/section (`:98-104`).
- `src/features/settings-data.tsx` — CSV columns (`:26-37`).
- `src/data/backloggd.ts` — default new fields in `mapEntry()` (`:59-135`).
- `src/domain/trophies.ts` — only for spending badges.

**Potential New Files (proposed):**

- **[proposed]** `src/domain/wishlist.ts`, `src/domain/wishlist.test.ts`, `src/features/wishlist-reminders.tsx`.

**Implementation Approach:** Add backward-compatible optional fields (`price?`, `boughtOn?`, `amountPaid?`, `reminderAt?`, currency) and inputs using `DateField`. Compute spending from `amountPaid` (define semantics explicitly) and surface it in Stats. Start with in-app reminder badges using existing `releaseDate`; OS notifications would be greenfield. Use `Intl.NumberFormat` for money without new dependencies.

**Dependencies and Integrations:** Status model, date components, stats, dashboard wishlist section, CSV/backup, optional Tauri notification plugin (new), optional browser Notification API.

**Database Changes:** None at SQL level; additive JSON fields. A global currency in `AppSettings` needs a default and legacy fallback. Keep user-entered fields out of `src/data/sync.ts` `FIELDS`.

**Potential Challenges:** Defining "total wishlist spending" (only current Wishlist items vs all purchased wishlist-origin games); mixed currencies with no conversion model; date/timezone edge cases; no notification infrastructure; permissions differ between Tauri and browser; CSV backward compatibility.

**Testing Requirements:** Vitest tests for wishlist filtering, amount parsing, sums with missing/mixed values, reminder classification (overdue/today/upcoming with injected "now"); manual QA of date inputs and Stats tiles.

**Investigation Required:** Reminder delivery (in-app vs OS), manual vs IGDB-derived reminder date, currency source (per-game vs global), exact spending semantics, handling of wishlist items removed from the library.

---

## 12. Platform Ownership

**Objective:** Let users specify where they own a game: store/platform and physical or digital, including multiple platforms.

**Current Implementation:**

- `Game.platform: string` (single primary label, `src/domain/game.ts:7`), `platforms?: string[]` (IGDB release platforms, `:11`), `playedPlatforms?: string[]`, `emulatedOn?: string[]` (`:14`) — no ownership/store/medium field.
- `src/data/platform.ts`: `GAME_TYPES` (`:13-16`), `PC` (`:18`), `ALL_PLATFORMS` (`:19-22`), `ALIAS` (`:25-30`), `emulatedOn()` (`:34-38`). `EXTRA` includes "Steam Deck"; list contains platform names only, no Steam client.
- `PlatformPicker` (`src/components/shared.tsx:305-373`) supports multi-select and `single` mode.
- AddGame played/released state and submit mapping (`src/features/library-components.tsx:13-18,123-125,143,216-220`); Details chips (`src/main.tsx:975-982`).
- Stats `platforms()` uses `playedPlatforms?.[0] ?? platform` and computes emulation rate (`src/domain/stats.ts:35-47,311-327`); importer maps IGDB platform IDs (`src/data/backloggd.ts:69-77,95-100`).

**Probable Files to Modify:**

- `src/domain/game.ts` — new ownership type/array field (`:6-21`).
- `src/features/library-components.tsx` — new form controls (`:216-248`).
- `src/components/shared.tsx` — reuse/extend `PlatformPicker` or add store/medium selects.
- `src/main.tsx` — "Ownership" block in Details (`:975-982`).
- `src/domain/stats.ts` — optional ownership tiles (`:311-327`).
- `src/data/backloggd.ts` — defaults for imported games.
- `src/features/settings-data.tsx` — CSV columns (`:26-37`).

**Potential New Files (proposed):**

- **[proposed]** `src/domain/ownership.ts`, `src/domain/ownership.test.ts`.

**Implementation Approach:** Add an optional array such as `ownership?: { platform: string; store?: string; medium?: "physical" | "digital" }[]`; provide a curated storefront list (separate from `ALL_PLATFORMS`); migrate/display legacy games using `platform`/`playedPlatforms` as a single default entry; extend Stats carefully to avoid double-counting.

**Dependencies and Integrations:** Platform helpers, PlatformPicker, AddGame form, Details, Stats, importer, CSV, implemented Steam/store import (feature 9).

**Database Changes:** None at SQL level; additive JSON field with `undefined` for old games; no changes to sync allow-list (ownership is user-owned).

**Potential Challenges:** Four existing platform concepts must not be conflated; multiple entries can double-count in `stats.platforms()`; storefront names are not in `ALL_PLATFORMS`; physical/digital may be per-platform or per-game; Steam integration is a separate feature.

**Testing Requirements:** Vitest tests for normalizers, legacy migration, multiple entries, stats non-double-counting; manual QA of picker and Details display.

**Investigation Required:** Single vs multiple records, granularity of physical/digital, curated vs free-text store, and whether Steam-derived ownership is in scope here.

---

## 13. Franchise Completion — implemented

**Objective:** Show franchise-level completion, e.g. "You've finished 4 of 9 Resident Evil games", using IGDB franchise metadata merged with the library.

**Implemented in source:**

- `View` includes `"franchises"` (`src/domain/game.ts:5`); `src/components/navigation.ts` adds the "Franchises" item; `src/main.tsx:266-272` renders `FranchiseView` with `data.games`, `openGame` and IGDB credentials at `/franchises`.
- `src/domain/franchise.ts` + `src/domain/franchise.test.ts`: `groupByFranchise` lists a game under every franchise it names and keeps only groups with a completed game; `buildFranchise(group, series)` merges IGDB results with library games by `igdbId` first then `baseTitle`, collapses remakes/editions into one slot, and computes `done`/`total`/`pct`/`seconds`. `ALL_TYPES`, `WANTED_TYPES`, `wantedType` and `libWanted` control which game types count; `ALL_TYPES = true` is currently a diagnostic that counts everything. Four Vitest cases cover counts, ID/name matching, library-only fallback and multi-franchise grouping; the filter-count case intentionally fails while the diagnostic is on.
- `src/features/franchises.tsx` + `franchises.css`: reuses Journey helpers (`PALETTE`, `STRANDS`, `cssVar`, `line`, `mix`, `strand`, `thumb`) to render one ribbon row per franchise with completed covers, question-mark placeholders, compact stats, progress bar, playtime, glass arrows and a permanently hidden scrollbar. `useSmoothX` eases wheel and arrow input; vertical rows, horizontal slots and ribbon segments are virtualized. Loading uses one `igdbFranchise` lookup plus `igdbGamesByIds` chunks of 100 IDs, with backoff retries, at most two concurrent franchises, and per-row `Queued` / `Loading franchise · x/y games loaded` / `Refreshing x/y…` progress. Retry, Refresh and Refresh all are available; failed loads never store partial totals.
- `src/data/igdb.ts`, `web/src/igdb.web.ts` and `src/data/franchiseCache.ts`: new franchise wrappers are mirrored in the web proxy shim; the cache adapter calls `franchise_cache_load` / `franchise_cache_save` on desktop and no-ops in web builds, leaving the in-memory session map as the fallback. `igdbSeriesCached` remains only for the Details series tree; completion rows no longer use it. A `[franchise]` console log reports `igdbIds` and `loaded` for the active diagnostic.

**Decisions / integrations:** IGDB `franchises` games merged with the library are the authoritative total; the game-type filter is currently disabled by `ALL_TYPES = true` pending Mario total QA; only franchises with a completed game appear; DLC stays on the same row with no branches. Uses `Game.franchises`, the `Completed` status, `igdb_franchise` and `igdb_games_by_ids`.

**Database Changes:** Adds `franchise_cache (key, sig, fetched_at, games_json)` in the existing migration v1. Desktop reads only visible keys, ignores signature mismatches, refreshes rows older than 30 days, and keeps old data if a background refresh fails. The table is disposable and is not included in JSON/Drive backups; web builds have no SQLite path.

**Verification:** `cargo check`, `pnpm typecheck`, `pnpm build` and the web Vite build pass. `pnpm test` is 66/67 while `ALL_TYPES = true` because the franchise filter-count test expects `false`; it returns to 67/67 when the switch is restored. Manual QA in the running desktop app is still pending: check the `[franchise]` log for Mario, decide the wanted game types, set `ALL_TYPES = false`, then verify wheel/arrow behavior, virtualized rows and the credential-free fallback.


## Additional Prompt:


Implement a new **Franchise Completion** view in navigation pane, following the latest provided design reference.

### 1. Reuse Existing Infrastructure
- Thoroughly inspect `Journey.tsx` before implementation.
- Reuse its existing ribbon/strand rendering system, game cover components, animations, caching, memoization, and performance optimizations.
- Adapt existing utilities wherever possible instead of rebuilding them.
- Do not break or modify the existing Game Journey functionality.

### 2. UI & Visualization
Create a premium dark-themed interface featuring multiple franchise timelines, similar to the reference image.

Each franchise should occupy its own horizontal row, for example:
- Resident Evil
- The Legend of Zelda
- Assassin's Creed
- Final Fantasy
- Prince of Persia
- Tomb Raider

Each row should contain:
- Franchise name and completion statistics on the left.
- Games arranged chronologically on the right.
- Completed games displayed using their actual cover art with glowing borders.
- Uncompleted games represented by dark question-mark placeholders.
- Flowing neon ribbon strands connecting the games.
- A distinct ribbon color for each franchise.

All games belonging to the same franchise must remain on the same horizontal row. Do not create branches for DLCs.

### 3. Data & Completion Logic
Use the existing series/franchise metadata already loaded by the application.

- Automatically group games by franchise.
- Determine completion using existing user game data.
- Calculate completed games, total games, and completion percentage.
- Preserve chronological ordering.
- Handle remakes, duplicate editions, DLCs, expansions, and spin-offs appropriately.
- Exclude DLCs and duplicate editions from mainline completion counts where appropriate.
- Do not hardcode franchise or game data.

### 4. Performance
Preserve and extend the optimizations already implemented in `Journey.tsx`.

- Reuse existing caching and image-loading mechanisms.
- Memoize expensive franchise calculations.
- Avoid regenerating strand geometry unnecessarily.
- Minimize unnecessary component re-renders.
- Ensure smooth rendering with many franchises and game nodes.

### 5. Design & Integration
- Match the latest reference's premium dark aesthetic, subtle gradients, glowing covers, and flowing ribbons.
- Add franchise-level progress bars, completion counts, and playtime statistics.
- Support horizontal scrolling for franchises containing many games.
- Make the layout responsive.
- Integrate the feature naturally into existing Game Journey navigation.

### 6. Implementation Approach
First investigate the existing architecture and identify reusable components. Then implement the feature by extending the existing infrastructure.

Keep franchise data processing separate from visualization where practical.

**Important:** Prioritize reusing the existing Journey strand engine and optimization strategies. The final result should look similar to the reference while feeling like a natural extension of the existing application, not an independently built feature.

Verify that the original Game Journey remains fully functional after implementation.
---

# C. IMPORT AND EXPORT

## 14. More Import Sources

**Objective:** Add CSV import, Steam library import, and paste-a-list-of-titles import, ideally through a reusable pipeline.

**Status (2026-11-22):** Steam library import (feature 9) and generic CSV import are implemented and verified in source. Only the pasted-title adapter remains pending. The notes below describe the remaining work; this section also records the shipped CSV implementation.

**CSV import (implemented, 2026-11-22):**
- `src/data/stores/import.ts:336-558` — `parseCsv` (BOM, quoted cells, CRLF, `,`/`;` auto-detected from the header), `headerKey` snake_case normalization, `parsePlaytimeSeconds` (`12h 30m`, `12:30`, bare minutes or hours), `importCsv`, and report helpers `csvReportSections` / `csvReportToText`. Types: `CsvImportProgress` (`matching | details | done`), `CsvImportReport` (`byIgdbId`, `strict`, `loose`, `duplicates`, `needsReview`, `warnings`, `failures`).
- Matching order: a row with a valid `igdb_id` is fetched by id and the CSV title is ignored (it may be empty or wrong); otherwise `resolveTitle` tries strict `/ <title>` then generic search. Details are fetched in `igdbImportBatch` chunks with `withRetry`; the UI can cancel between batches; duplicates are checked against the live library and earlier rows by id or normalized title.
- Columns: `title`, `igdb_id` (one required per row), `status`, `playtime`, `starting_date`, `completed_date`, `rating`, `mastery`/`mastered`, `favorites`/`favorite`, `played_on`. Dates accept `YYYY-MM-DD` or parseable text; booleans accept 1/0, true/false, yes/y/t; `played_on` splits on `;` or `,` and maps common aliases to canonical platform names.
- `src/features/settings-data.tsx:359-477` — `CsvImportSection` in `DataSection`: file picker with header validation (`title` or `igdb_id`), confirm step, progress bar, cancel-after-batch, grouped report and clipboard copy. Gated by `hasTauri && creds`; because `web/src/igdb.web.ts:9` sets `hasTauri = true`, the panel also renders in web builds with IGDB credentials. No new data fields, SQL migration or web proxy code; games are built with `buildStoreGame` but `storeLinks` is cleared.

**Remaining work (pasted-title import) — Current Implementation:**

- Settings data UI: `DataSection` (`src/features/settings-data.tsx:52-62`), `NoticeBar` (`:15-24`), `saveOrDownload` (`:39-50`), CSV export helpers `stamp`/`csvCell`/`toCsv` (`:26-37`), `StorageSection` JSON export/import (`:64-121`).
- Existing import state machine: `Phase` union (`:227-231`), `BackloggdSection` (`:233-343`) with file parsing (`:242-254`), `run()` with `AbortController` (`:256-273`), progress bar (`:307-315`), report chips/copy (`:317-339`), duplicate warning (`:281-286`).
- Import engine: `src/data/backloggd.ts` — report types (`:5-28`), `emptyReport` (`:55-57`), `mapEntry` (`:59-135`), `withRetry` (`:137-145`), `importBackloggd` (`:147-205`; dedupe by `igdbId` `:152-161`, `CHUNK = 100` `:30,168`, strict search fallback `:183-193`), report helpers (`:207-223`).
- IGDB primitives: `igdbSearch`, `igdbDetails`/Cached, `igdbImages`, `igdbPlatforms`, `igdbImportBatch` (`src/data/igdb.ts:58-120`); web mirrors in `web/src/igdb.web.ts`.
- Reusable helpers: `norm()` (`src/data/backloggd.ts:31`, `src/data/sync.ts:19`), `buildPatch`/`applyPatches` (`src/data/sync.ts:49-78`), `draftFromIgdb` (`src/features/discover.tsx:303-315`), `validateGame` (`src/domain/game.ts:51-54`).
- Persistence path needs no change: all importers call `update` (`src/main.tsx:192-197`).

**Probable Files to Modify:**

- `src/features/settings-data.tsx` — add new sections into `DataSection` (`:52-62`), reuse `Phase`/progress/report UI (`:227-343`).
- `src/data/backloggd.ts` — extract generic pipeline/report helpers so new importers reuse them.
- `src/data/igdb.ts` — add shared batch/search helpers if needed (mirror in `web/src/igdb.web.ts`).
- `src/data/repository.ts` — only if new import metadata needs normalization (`normalizeStatuses` at `:8-16`).
- `src/domain/game.ts` — only if source metadata fields (e.g. `importSource`) are added.
- `src/main.tsx` — no change expected (uses `update`).

**Potential New Files (proposed):**

- `src/data/csv.ts` is **not needed** — the CSV adapter shipped inside `src/data/stores/import.ts` (2026-11-22). For the remaining pasted-title source: **[proposed]** `src/data/stores/paste.ts`, `src/data/stores/paste.test.ts`, and optionally a `PasteImportSection` in `src/features/settings-data.tsx`. The generic parse → resolve IGDB → map → dedupe → report pipeline is `src/data/stores/import.ts`; the Steam source adapter is `src/data/stores/steam.ts` from feature 9.

**Implementation Approach:** Reuse the shared pipeline in `src/data/stores/import.ts` (IGDB matching, dedupe, cancellation, progress/report). The CSV adapter is already shipped there and round-trips with `toCsv()` in `settings-data.tsx`; add only a thin pasted-title adapter that produces the same `CsvEntry[]`-style input rather than another importer engine. Show one consistent progress/report UI.

**Dependencies and Integrations:** Settings UI, IGDB search/batch, Backloggd engine, sync/report helpers, CSV export, `src/data/stores/import.ts` from feature 9, web proxy only if web support is needed (store import itself is desktop-only).

**Database Changes:** None at SQL level. Optional `importSource?`/`sourceId?` fields are backward-compatible JSON additions; keep them out of IGDB `FIELDS`.

**Potential Challenges:** Current dedupe only checks numeric `igdbId` (UI warns manual games cannot be detected, `settings-data.tsx:281-286`); pasted titles are ambiguous; CSV quoting/BOM/headers need robust parsing; IGDB rate limits (retry/chunking already exist); cancellation is mid-batch only; large imports stress the 500 ms full-blob save; any new `igdb.ts` export must be mirrored in web.

**Testing Requirements:** Vitest tests for CSV/paste parsers (quoting, BOM, headers, malformed rows), dedupe, report generation, `Game` mapping with mocked IGDB; component tests for the `Phase` machine only if a React test helper is added; manual QA of cancel/progress.

**Investigation Required:** Target CSV format, disambiguation policy for pasted titles, merge-vs-skip policy for duplicates without IGDB IDs, and whether CSV/paste must work in the web build (Steam/store import does not).

---



# PART 5 — SUGGESTED IMPLEMENTATION ORDER

No dates are assigned. Ordering is by dependency, complexity, and risk to existing functionality.

**Phase 1 — Isolated, low-risk fixes**

1. ~~**8** Add Game search dropdown dismissal~~ — completed as feature 1 (outside click / Escape); only the separate hints/auto-open symptom remains.
2. ~~**2** Fit All asc/desc~~ — completed (2026-11-19): `src/features/journey.tsx`, `journey.css`, `src/domain/journey-sort.ts`, `journey-sort.test.ts`.
3. Housekeeping: remove save debug logs / clear error toast (`src/main.tsx:164-208`).

**Phase 2 — Settle data-model extensions early (all JSON, no SQL migrations)**
4. **12** ownership fields (existing platform fields already present); **11** wishlist price/payment/reminder fields; **10** priority. Define defaults in `src/domain/game.ts:61-77` and normalization in `src/data/repository.ts` / `web/src/codec.ts:111-129`. Keep all new user-owned fields out of `src/data/sync.ts` `FIELDS` (`:28-47`).

**Phase 3 — Domain/analytics built on those fields**
5. ~~**3** gameplay time stats~~ — completed (2026-11-19): new "Playtime" category in `src/domain/stats.ts` backed by `src/domain/playtime.ts`; hidden `length` section intentionally left alone.
6. **13** franchise completion (done — dedicated `/franchises` view; `stats.franchises()` tiles unchanged).
7. **4** Discover relevance (change Rust and `web/src/igdb.web.ts` together).
8. **10** What Should I Play Next (depends on 4 + backlog/priority fields).

**Phase 4 — Higher-risk import/sync (network, rate limits, duplicates)**
9. ~~**9** Steam sync~~ — completed (2026-11-21): `src/data/stores/`, `src/features/stores-settings.tsx`, `src-tauri/src/stores.rs`; only live re-fetch QA remains.
10. ~~**14** CSV import~~ — completed (2026-11-22): `src/data/stores/import.ts` (`importCsv`, `parseCsv`) and `CsvImportSection` in `src/features/settings-data.tsx`. Only the pasted-title adapter remains from feature 14.

**Phase 5 — Presentation**
11. **15** shareable card (after stats/badge data is stable and theme direction is known).

**Phase 6 — Platform/packaging**
12. **6** WebApp hardening + doc/deploy cleanup.
13. **16** PWA (depends on 6; coordinate colors with 5 and install UX with 7).
14. **7** Android in its isolated directory (can run in parallel with 16).

**Parallel / independent:** 2, 5, 7, 8 can proceed with minimal coordination; 3 and 12 have existing fields and can start before Phase 2 is fully complete if scoped carefully.

Cross-cutting work throughout: keep `docs/` and this knowledge base in sync, add Vitest coverage for new pure logic, and run desktop + web build regression after each phase.

---

# PART 6 — FUTURE AGENT IMPLEMENTATION RULES

Every future AI coding agent implementing a feature from this document must follow these rules:

1. Read `PROJECT_CONTEXT.md` first.
2. Read `PROJECT_STATUS.md` second.
3. Search `future_implementation_guide.md` for the requested feature.
4. Use its documented file paths as the starting point.
5. Do not scan the entire repository unnecessarily.
6. Inspect only the relevant files and their immediate dependencies.
7. Verify that the documented files and functions still exist.
8. If the implementation guide is outdated, update it after investigating.
9. Follow the existing architecture and coding conventions.
10. Reuse existing components, utilities, services, and data models wherever appropriate.
11. Avoid unnecessary dependencies and duplicate implementations.
12. Preserve existing application functionality.
13. Do not modify unrelated modules.
14. Test the changes (`pnpm typecheck`, `pnpm test`, `pnpm build`; web build when affected; `pnpm tauri:build` for native changes).
15. Update `PROJECT_STATUS.md` when the feature's development status changes.
16. Update `PROJECT_CONTEXT.md` if significant architectural or technical changes occur.
17. Update `future_implementation_guide.md` if implementation changes invalidate its documented file locations or technical approach.

## Platform isolation rules

- **Android** development must remain isolated in its own directory (Tauri-generated Android project, conventionally under `src-tauri/gen/android/` — verify with the installed CLI). Do not introduce Android-specific dependencies or platform-specific modifications into the offline desktop or web application unless explicitly justified and architecturally safe. Any shared code must have clearly defined boundaries.
- **Web** changes belong under `web/`. Preserve the three-module swap contract in `web/vite.config.ts:14-18` and export parity between `src/data/igdb.ts` and `web/src/igdb.web.ts`.
- **Desktop** changes to `src-tauri/src/lib.rs` must register any new command in `generate_handler!` (`:1187-1204`) and respect the capability/CSP boundaries.
- New optional data fields go into the `AppData`/`Game` JSON model with defaults; no SQL migration is needed for additive fields.

## Documentation is not implementation

The original task that produced this guide was documentation-only ("Only the three knowledge-base Markdown files were created"). The guide itself exists to direct later implementation work: features 1 and 2 have since been implemented and marked completed above. Follow rules 1–17 for each new feature; do not change unrelated modules.

---

# PART 7 — VERIFICATION NOTES AND UNCERTAIN ASSUMPTIONS

- **Verified directly:** file paths, route table, `AppData`/`Game` field lists (including optional store fields), 23 Tauri command names (IGDB + `stores_*` + `igdb_external_lookup` + `igdb_epic_lookup`), `app_state` schema, `FIELDS` sync allow-list, LRU cache implementation, module-swap map, env var names, absence of PWA/manifest/service worker, and current test counts (63 Vitest + 9 Rust).
- **Uncertain / needs investigation at implementation time:** exact Add Game search bug reproduction; "Played On" semantics; live Steam re-fetch result after the free-game fix; live Epic launcher behavior and needs-review enrichment; share-card image/CORS feasibility; authoritative web deploy target (Vercel vs Cloudflare Pages); whether stale `web/worker/src/*` duplicates are intentional; exact Tauri Android generated layout and mobile capability schema; product definitions for mood/time/genre recommendation scoring and "total wishlist spending".
- **Documentation status:** store-related files in `docs/`, the root `README.md` and this knowledge base were refreshed against source on 2026-11-21. `web/README.md` still contains stale claims (deploy target, Drive scopes, `.env.example`); use code and this guide for those.
