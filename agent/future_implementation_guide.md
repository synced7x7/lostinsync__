# future_implementation_guide.md — feature-specific navigation for AI agents

> **Documentation only.** This file tells future agents where to work; it does not implement anything. Every "existing" path below was verified in the repository on 2026-11-19. Paths marked **[proposed]** do not exist yet. Line numbers are starting points and may drift — verify before editing.
>
> Reading order: `PROJECT_CONTEXT.md` → `PROJECT_STATUS.md` → the relevant feature entry here → only the listed files and their immediate dependencies.

**Feature index:** A. Improvements — 1 Played/completed inline, 2 Fit All sort, 3 Gameplay time stats, 4 Discover algorithm, 5 Theme system, 6 WebApp, 7 Android, 8 Add Game search bug, 9 Steam sync, 10 Backlog priority / play next. B. Wishlist — 11 Wishlist extras, 12 Platform ownership, 13 Franchise completion. C. Import/export — 14 More import sources, 15 Shareable card. D. PWA — 16 Installation & offline caching.

---

# A. EXISTING FEATURE IMPROVEMENTS

## 1. Played On and Completed Status Without Entry Screen

When a user enters or clicks the add a game from the library and after that when user types a name theres a suggestions of dropdowns of games that mmatches the igdb which is okay but the problem is when the user wants to add custom games he doesnt need the dropdown but still if the name matches the igdb game name then the dropdown persists . so what i am expecting that the dropdown should get removed when user clicks other parts of the screen.

---

## 2. Ascending/Descending Button in Fit All Mode

**Objective:** Add ascending/descending sort controls to the Journey "Fit All" overview.

**Current Implementation:**
- `src/features/journey.tsx:135` module-level `session: { range?, zoom, fit }`; `JourneyView` state `fit` at `:374`; `queuePrefs` (`:409-414`) keeps prefs in memory only ("never saved to the database").
- `FitView` (`:274-362`) renders `base.sorted.slice(win.first, win.first + win.count)` (`:302`) using a positional virtual window (`:281-288`) and resets `scrollTop` to 0 when `base` changes (`:298`).
- `base` (`:467-481`) hard-codes `[...items].sort((a, b) => a.start - b.start)` (`:470-471`); the same `base` feeds both Fit rows and timeline layout/lane colors (`:484-502`).
- Toolbar (`:811-858`) has range pills, a Fit All button (`:833-835`) and zoom controls, but no sort control.
- Library precedent: `SORT_OPTIONS` (`src/domain/library-session.ts:22-33`), `SortDirection` (`src/domain/game.ts:27`), `toggleSortDirection` + `ArrowUp`/`ArrowDown` (`src/main.tsx:368-377`), `compareGames` (`:300-314`).
- `AppSettings.journeyRange/Zoom/Fit` exist (`src/domain/game.ts:40-42`) but are unused.

**Probable Files to Modify:**
- `src/features/journey.tsx` — sort state, toolbar button, comparator, pass direction into `FitView`.
- `src/features/journey.css` — toolbar styles near `.jn-tools` (`:63`) and `.jn-fit` (`:563-586`).
- `src/domain/game.ts` — add `journeySort?`/`journeySortDirection?` only if persistence is desired (reuse existing unused journey fields or replace them).
- `src/domain/library-session.ts` — only if reusing `SORT_OPTIONS`/`SortDirection`.
- `src/features/settings-data.tsx` — `LibraryDefaultsSection` (`:154-225`) if the sort becomes a saved default.
- `src/main.tsx` — only to visually mirror the library sort control.

**Potential New Files (proposed):**
- **[proposed]** `src/domain/journey-sort.ts` — pure comparator for `Row`-like items (`start`, `end`, `title`, `status`).
- **[proposed]** `src/features/journey.sort.test.ts` — comparator tests.

**Implementation Approach:** Keep the direction in Journey's existing `session` object; render an asc/desc button next to the Fit All control; derive `base.sorted` via a comparator that reverses deterministically. Apply the order only to Fit rows if possible; if `base` is shared, verify lane/color effects.

**Dependencies and Integrations:** `FitView`, `base` rows, Journey `session`, shared `SortDirection` type, optional settings persistence.

**Database Changes:** None if session-only. If persisted, add optional fields to `AppSettings` (JSON blob; no SQL migration). Reconcile with the already-declared-but-unused `journeyRange/Zoom/Fit`.

**Potential Challenges:** Reversing `base.sorted` also reverses `PALETTE[idx % ...]` colors and affects branch/lane logic; `FitView` scroll resets to top on `base` change; comparator currently has no tie-breaker; Journey excludes games without `startedAt` or with statuses other than Completed/Playing (`:420-435`), so it cannot sort the whole library.

**Testing Requirements:** Unit tests for ascending/descending, ties, empty/single lists; jsdom test of `base.sorted` order after toggling (mock `ResizeObserver`); manual QA of scroll position and timeline rendering.

**Investigation Required:** Desired sort keys (start only vs title/duration/status); whether the direction should persist despite the session-only design; whether timeline mode should be affected too.

---

## 3. Gameplay Time Statistics Section

**Objective:** Introduce a dedicated gameplay time statistics section.

**Current Implementation:**
- Personal playtime: `Game.totalSeconds` (`src/domain/game.ts:9`), entered as hours/minutes in `AddGame` (`src/features/library-components.tsx:26-27,118,135`), summed from Backloggd playthroughs (`src/data/backloggd.ts:88-90`), defaulted to 0 in `draftFromIgdb` (`src/features/discover.tsx:307`). No per-session timestamps exist anywhere.
- IGDB estimates: `timeAvgSeconds`, `timeMainSeconds`, `timeFullSeconds` (`src/domain/game.ts:13`), displayed as TIME TO BEAT tiles in `Details` (`src/main.tsx:877-881,985-1004`).
- `src/domain/stats.ts`: `index()` (`:35-47`) computes `len: g.timeAvgSeconds / 3600` (`:44`) but **never reads `totalSeconds`**; a `length` section exists (`:401-412`) and is registered in `BUILD` (`:505`) but is commented out of `CATEGORIES` (`:21`).
- Stats UI: `StatsView` (`src/features/stats.tsx:46-113`), `ChartCard`/`Chart` (`:18-44`), ECharts registration (`:3-11`), ECharts canvas renderer; formatting helpers `formatPlaytime` (`game.ts:55-60`), `formatHours` (`:83-87`), `hrs`/`sum`/`avg`/`median` (`stats.ts:54-58`).
- Hour-based trophy logic already uses `totalSeconds / 3600` (`src/domain/trophies.ts:186-188`).

**Probable Files to Modify:**
- `src/domain/stats.ts` — add a time category/aggregation or rework the hidden `length` builder.
- `src/features/stats.tsx` — add an `ICONS` entry/new `CategoryId` and render the section; reuse `ChartCard`.
- `src/features/stats.css` — tile/chart layout styles.
- `src/domain/game.ts` — only if per-session data is added.
- `src/features/library-components.tsx` / `src/main.tsx` — if users must enter per-session time.
- `src/features/settings-data.tsx` — CSV already exports "Total hours" (`:29-37`).
- `src/domain/trophies.ts` — only for new playtime badges.

**Potential New Files (proposed):**
- **[proposed]** `src/domain/playtime.ts` — pure aggregation helpers.
- **[proposed]** `src/features/playtime-section.tsx` — optional dedicated section.
- **[proposed]** `src/domain/playtime.test.ts`.

**Implementation Approach:** Prefer aggregating existing `totalSeconds` into a new Stats category (or un-comment and rework `length`). If time-series by year is required, approximate with existing `startedAt`/`finishedAt`/`createdAt` (`yearsOf`/`touchedIn`, `stats.ts:49-50`) or introduce explicit session records — a product decision. Keep IGDB estimates visually distinct from user-recorded playtime.

**Dependencies and Integrations:** Stats category plumbing (`CategoryId`, `CATEGORIES`, `BUILD`, `Tile`, `ChartSpec`), `index()` row model, ECharts option builders, CSV export, trophies.

**Database Changes:** None for pure aggregation. Session logs would require an additive `Game` field (e.g. `playSessions?: { at: string; seconds: number }[]`) merged through repository defaults — still no SQL migration.

**Potential Challenges:** `totalSeconds` has no timestamps, so "hours played in 2025" cannot be derived accurately; IGDB TTB values are estimates, not actual playtime; the hidden `length` section may have been disabled intentionally; ECharts colors are hard-coded (`stats.ts:101-114`); jsdom has no real canvas.

**Testing Requirements:** Vitest tests for aggregation (zero/one/many games, missing values, grouping, median vs mean, invalid inputs); mock `echarts.init`/`ResizeObserver`/canvas if component tests are needed; manual QA of charts and year filter.

**Investigation Required:** Whether the section belongs in Stats, Dashboard, or Details; whether session-level tracking is in scope; how to handle games with `totalSeconds = 0` but valid IGDB estimates; why `length` was disabled.

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

---

## 6. WebApp

**Objective:** Develop or improve the web application version without breaking the offline desktop app.

**Current Implementation:**
- `web/vite.config.ts:14-18` swaps exactly three modules: `src/data/igdb.ts` → `web/src/igdb.web.ts`, `src/data/repository.ts` → `web/src/repository.web.ts`, `src/features/settings-data.tsx` → `web/src/settings-data.web.tsx`; `swapModules()` (`:20-34`), build CSP (`:36-54`), port 5174 (`:66`), output `web/dist` (`:67`).
- `web/index.html:10` → `web/src/entry.tsx:1-7` imports cloud CSS, calls `init()` from `web/src/sync.ts`, then dynamically imports shared `src/main.tsx`; fullscreen is monkey-patched to require F11 (`:9-15`).
- Persistence: IndexedDB `lostinsync-web` v1 (`web/src/db.ts:9-13`: `kv`, `images`), image hash blobs (`web/src/codec.ts:48-73,84-109`), AES-GCM vault (`web/src/vault.ts:9-35`), repository (`web/src/repository.web.ts:9-62`), dirty events (`web/src/events.ts`).
- IGDB: `web/src/igdb.web.ts` mirrors all exports of `src/data/igdb.ts`, sets `hasTauri = true` (`:9`), posts to `${VITE_IGDB_PROXY_URL}/igdb/...` (`:26-49`), Cloudflare Worker `web/worker/src/index.ts` with CORS/allow-list/rate limit.
- Cloud: `web/src/sync.ts` (push/pull/check/connect, conflict model), `web/src/drive.ts` (GIS + Drive REST), `web/src/cloud-panel.tsx`, `web/src/settings-data.web.tsx` wraps offline `DataSection`.
- Env vars: `VITE_GOOGLE_CLIENT_ID`, `VITE_IGDB_PROXY_URL`; worker `ALLOWED_ORIGINS`. `web/.env.local` exists; `web/.env.example` does not.

**Probable Files to Modify:** `web/vite.config.ts` (swaps/CSP), `web/index.html`, `web/src/entry.tsx`, `web/src/repository.web.ts`, `web/src/db.ts`, `web/src/codec.ts`, `web/src/vault.ts`, `web/src/igdb.web.ts`, `web/src/sync.ts`, `web/src/drive.ts`, `web/src/cloud-panel.tsx`, `web/src/settings-data.web.tsx`, `web/worker/src/index.ts`, `web/worker/wrangler.toml`, `vercel.json`, `web/README.md`.

**Potential New Files (proposed):**
- **[proposed]** `web/src/*.test.ts` for codec/repository/sync helpers; **[proposed]** `web/worker/src/index.test.ts`.
- **[proposed]** `web/.env.example` (documented but missing).

**Implementation Approach:** Keep all web code under `web/`; add new web-only modules via the three-module swap or the `settings-data.web.tsx` wrapper. Preserve export parity with offline modules, extend CSP only for new origins, and mirror any IGDB client change. Fix docs/deploy ambiguity and remove or clearly quarantine dead worker frontend copies.

**Dependencies and Integrations:** Shared `src/main.tsx` and all shared UI/domain; Cloudflare Worker; Google OAuth/Drive; env vars; deployment config.

**Database Changes:** Web IndexedDB is v1 (`web/src/db.ts:9`); a new store requires a version bump and `onupgradeneeded` change. Additive `Game` fields are JSON-only via `web/src/codec.ts:111-129` `prepare()`. Cloud snapshot `FORMAT = 1` (`web/src/sync.ts:16`) changes only if old snapshots would be misread.

**Potential Challenges:** Import-path sensitivity of the swap plugin; `hasTauri = true` makes desktop-gated UI appear in web (must verify offline messaging); storage eviction despite `navigator.storage.persist()`; fullscreen monkey-patch coupling; stale worker duplicates; Vercel vs Cloudflare Pages ambiguity; CSP restrictions.

**Testing Requirements:** Vitest tests for codec round-trips, credential stripping/reattachment, sync conflict logic, worker allow-list/CORS/rate limit (mock `fetch`); `pnpm typecheck`, `pnpm test`, `npx vite build --config web/vite.config.ts`, plus desktop `pnpm build`/`pnpm tauri:build` regression.

**Investigation Required:** Authoritative production host; whether stale `web/worker/src/*` files are intentionally retained; actual browser storage persistence in production; which new external APIs need proxy/CSP support.

---

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

## 8. Fix Add Game Always Search Appearance

**Objective:** Fix the issue where the Add Game search interface always appears.

**Current Implementation:**
- `AddGame` is defined in `src/features/library-components.tsx:11-259` (portal modal at `:163-258`).
- `hits`, `open`, `searching`, `picked` state at `:37-42`; `canSearch = hasTauri && !!igdb.clientId && !!igdb.clientSecret` at `:43`.
- Debounced effect at `:47-57` runs only when `canSearch && open && title.trim().length >= 2` with a 350 ms delay; dependencies `[title, open]`.
- Title input at `:190-210`: `autoFocus` (`:192`); every keystroke calls `setTitle`, `setPicked(undefined)`, **`setOpen(true)`** (`:194`); hints at `:197-199` render whenever the modal is open, not gated on active search; dropdown renders only when `open && hits.length > 0` (`:200-209`).
- `pick()` (`:59-78`) closes the dropdown and fills the form.
- Call sites: `src/main.tsx:458` (new game), `:1048-1054` (edit via `initial`).
- Web inherits the behavior (`src/features/library-components.tsx` is shared; `web/src/igdb.web.ts:9` sets `hasTauri = true`).

**Probable Files to Modify:**
- `src/features/library-components.tsx` — search visibility state/effect (`:37-57`), title input/hints/dropdown (`:190-210`), `pick()` (`:59-78`).
- `src/main.tsx` — only if a new `AddGame` prop is introduced at `:458`/`:1048`.
- `src/style.css` — only if the symptom is purely visual (verify `.igdb-hint`/`.igdb-dropdown` rules and line numbers).

**Potential New Files (proposed):**
- **[proposed]** `src/features/library-components.test.tsx` — regression tests.
- **[proposed]** `src/domain/add-game-search.ts` — pure `shouldSearch()` / `shouldShowHints()` predicates.

**Implementation Approach:** Separate "manual title entry" from "IGDB lookup": make search opt-in (explicit button/`Enter`), or at minimum stop setting `open = true` on every keystroke and gate hint rendering on `canSearch && title.length >= 2 && searching/open`. Preserve the existing debounce/cancellation and `pick()` fill behavior.

**Dependencies and Integrations:** `igdbSearch`/`igdbDetails`/`igdbImages` from `src/data/igdb.ts`, `canSearch` gating in settings, shared desktop/web component.

**Database Changes:** None — `open`/`hits`/`searching` must stay local UI state.

**Potential Challenges:** Exact user-reported symptom was not reproduced from code; removing auto-search may break intended IGDB assistance; web `hasTauri = true` changes hint visibility; the modal backdrop click handler (`:164-165`) is an unproven factor.

**Testing Requirements:** Pure predicate tests (empty/short title, closed dropdown, editing mode, post-pick state); manual QA: open modal, type 1 then 2+ characters, pick a result, edit an existing game.

**Investigation Required:** Obtain a screenshot/repro of "always search appearance"; decide whether auto-search should be disabled entirely or only when editing; confirm whether there is a click-through issue.

---

## 9. Steam Synchronization

**Objective:** Integrate Steam library/playtime/achievement data with the local library.

**Current Implementation:**
- No Steam code exists. Grep matches only the planned Steam items in `docs/roadmap.md` (Phase 4) and platform strings such as `SteamOS`/`Steam Deck` in `src/data/platform.ts:1,3,10`.
- `Game` has `igdbId?: number` (`src/domain/game.ts:11`) and `backloggdId?: string` (`:19`) but no Steam identifier.
- Import precedent: `src/data/backloggd.ts` — `BlEntry` (`:15`), `ImportReport` (`:17-28`), `mapEntry()` (`:59-135`), `withRetry()` (`:137-145`), `importBackloggd()` (`:147-205`, dedupe by `igdbId` at `:152-161`, chunking, abort, strict `/ ` search fallback at `:183-190`, report helpers `:207-223`).
- Sync precedent: `src/data/sync.ts` — `FIELDS` allow-list (`:28-47`), `buildPatch()` (`:49-68`) preserving user fields, `applyPatches()` (`:70-78`), `syncWithIgdb()` (`:80-154`).
- Settings UI precedent: `BackloggdSection` in `src/features/settings-data.tsx:233-343` (phase state machine, progress, cancel, report).
- IGDB primitives: `igdbSearch`, `igdbImportBatch`, `igdbPlatforms` (`src/data/igdb.ts:58-120`).
- Web worker allow-list has no Steam endpoints (`web/worker/src/index.ts:6-9`); desktop CSP allows only IGDB/Twitch (`src-tauri/tauri.conf.json:24`).

**Probable Files to Modify:**
- `src/domain/game.ts` — Steam identifiers/fields near `:11,19` and settings near `:29-47`.
- `src/features/settings-data.tsx` — new Steam section near `BackloggdSection` (`:233+`).
- `src/data/sync.ts` — ensure Steam-derived fields are not overwritten by IGDB `FIELDS` (`:28-47`).
- `src/data/backloggd.ts` — reuse/extend report helpers (do not assume IGDB-id-only dedupe is enough).
- `src-tauri/src/lib.rs` and `src-tauri/tauri.conf.json:24` — only if a native proxy command is needed.
- `web/src/igdb.web.ts`, `web/worker/src/index.ts`, `web/vite.config.ts`, `web/src/env.d.ts` — only if web Steam support is in scope.

**Potential New Files (proposed):**
- **[proposed]** `src/data/steam.ts`, `src/data/steam-sync.ts`, `src/features/steam-settings.tsx`, `src/data/steam.test.ts`, `src/data/steam-sync.test.ts`, optionally `web/src/steam.web.ts`.

**Implementation Approach:** Treat Steam as a one-way authoritative source for owned games and playtime: authenticate/resolve user, fetch owned games, map app IDs to IGDB IDs (exact app-id mapping first, then strict `/ ` name search), dedupe against existing `igdbId`/normalized titles, and import via the same report/progress pattern as Backloggd. Refresh only Steam-owned fields; never overwrite user fields. Reframe the roadmap's "two-way sync" unless a supported write path is verified.

**Dependencies and Integrations:** Feeds platform ownership (12), gameplay time stats (3), import sources (14), stats, settings UI, possibly Tauri/web proxy.

**Database Changes:** None at SQL level. Additive fields proposed: `steamAppId?`, optional `steamPlaytimeSeconds?`, `steamUpdatedAt?`, achievements list, and a settings-level Steam ID/key. If web credentials are added, strip them like IGDB creds in `web/src/repository.web.ts:14-17` so they never enter the Drive snapshot.

**Potential Challenges:** External Steam auth/API limits (privacy settings, key restrictions, terms) — **not verifiable from this repo**; no app-id→IGDB mapping exists; Steam playtime units/meaning differ from local `totalSeconds`; achievement availability varies by game; CORS/proxy needed for web; "two-way" likely infeasible.

**Testing Requirements:** Vitest tests with mocked Steam fixtures (owned-games parsing, playtime conversion, achievement mapping, dedupe priority, user-field preservation, private-profile cases); manual QA with a real account; never call live APIs in tests.

**Investigation Required:** Steam auth strategy (WebAPI key vs OAuth vs user-exported file), actual API rights/privacy behavior, achievement availability, whether web support is required, credential storage policy. External references (not code-verified): Steamworks Web API overview/auth/OAuth docs and endpoints `ISteamUser/GetOwnedGames`, `ISteamUserStats/GetUserStatsForGame`, `ISteamUserStats/GetSchemaForGame`.

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

**Dependencies and Integrations:** Platform helpers, PlatformPicker, AddGame form, Details, Stats, importer, CSV, future Steam sync (feature 9).

**Database Changes:** None at SQL level; additive JSON field with `undefined` for old games; no changes to sync allow-list (ownership is user-owned).

**Potential Challenges:** Four existing platform concepts must not be conflated; multiple entries can double-count in `stats.platforms()`; storefront names are not in `ALL_PLATFORMS`; physical/digital may be per-platform or per-game; Steam integration is a separate feature.

**Testing Requirements:** Vitest tests for normalizers, legacy migration, multiple entries, stats non-double-counting; manual QA of picker and Details display.

**Investigation Required:** Single vs multiple records, granularity of physical/digital, curated vs free-text store, and whether Steam-derived ownership is in scope here.

---

## 13. Franchise Completion

**Objective:** Show franchise-level completion, e.g. "You've finished 4 of 9 Resident Evil games", reusing existing series data.

**Current Implementation:**
- `Game.franchises?: string[]` (`src/domain/game.ts:17`) is populated from IGDB everywhere (`src/data/igdb.ts:8`, `web/src/igdb.web.ts:303`, `src/features/library-components.tsx:156`, `src/features/discover.tsx:312`, `src/data/backloggd.ts:129`) and refreshed by sync (`src/data/sync.ts:34`).
- Stats already computes franchise tiles from **library games only**: `index()` maps `fr: g.franchises ?? []` (`src/domain/stats.ts:43`), `agg()` (`:81-89`), `franchises()` (`:349-366`) with "Franchises completed", "Franchise completion", "Completion by franchise"; `CATEGORIES` entry `:18`; `ICONS.franchises` (`src/features/stats.tsx:13-16`).
- Completion signal: `done = g.status === "Completed"` (`src/domain/stats.ts:45`). Trophy cross-reference: `src/domain/trophies.ts:177-178` ("Pantheon of Worlds").
- Series tree: `SeriesData` (`src/data/igdb.ts:94-98`), `igdbSeries` (`:99-102`), Rust `igdb_series` (`src-tauri/src/lib.rs:816-944`, 4 levels up/down, `limit 100` per query), web mirror `web/src/igdb.web.ts:212`.
- UI: `SeriesButton` (`:90-101`) and `SeriesModal` (`:52-88`) in `src/features/series.tsx`; mounted only in Details (`src/main.tsx:891`) with IGDB id/credentials — **no library data passed**. Non-duplication precedent: bundle data is cached with `memo` (`src/data/igdb.ts:128-135`) and only persisted if changed (`src/features/bundle.tsx:22-37`), with helpers in `src/domain/gametype.ts:32-36`.

**Probable Files to Modify:**
- `src/domain/stats.ts` — new completion metric/reuse `franchises()` (`:349-366`).
- `src/features/series.tsx` — accept library games/status and overlay completion on tree nodes (`:13-88`).
- `src/main.tsx` — pass `data.games` into `SeriesButton` (`:891`).
- `src/data/igdb.ts` — add `igdbSeriesCached` using existing `memo()` (`:36-52,99-102`).
- `web/src/igdb.web.ts` — mirror any new cached export (`:212`).
- `src/features/stats.tsx` — only if a new category is added.

**Potential New Files (proposed):**
- **[proposed]** `src/domain/franchise.ts`, `src/domain/franchise.test.ts`, optionally `src/features/franchise-progress.tsx`.

**Implementation Approach:** Decide the authoritative source for the total (IGDB collection tree via `igdbSeries`, stored `franchises` names, or a curated list). Prefer computing progress on the fly from `SeriesData` plus the library, matching by `igdbId` first and normalized name second; cache the series tree in memory with the existing `memo` pattern. Avoid persisting franchise data. Display in the series modal and/or Stats.

**Dependencies and Integrations:** Series command + web mirror, `franchises` field, completion status, Stats franchise section, trophies, bundle non-duplication precedent.

**Database Changes:** None required. Persisting a slim series snapshot would duplicate data and should be avoided; if chosen, add optional fields to the JSON blob.

**Potential Challenges:** IGDB `franchises` (names) ≠ `collections`/series tree; the "9 games" total may come from neither source exactly; series queries are on-demand, credential-dependent, and capped; dedupe games appearing in parent/child collections; offline behavior must be defined.

**Testing Requirements:** Vitest tests with `SeriesData` + `Game[]` fixtures (counts, dedupe, ID vs name matching, missing dates); verify existing `stats.franchises()` tiles unchanged without series data; manual QA of series modal with/without credentials.

**Investigation Required:** Authoritative franchise total source, UI placement, and whether the web mirror alone is sufficient for parity.

---

# C. IMPORT AND EXPORT

## 14. More Import Sources

**Objective:** Add CSV import, Steam library import, and paste-a-list-of-titles import, ideally through a reusable pipeline.

**Current Implementation:**
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
- **[proposed]** `src/data/import.ts` (parse → resolve IGDB → map → dedupe → report), `src/data/csv.ts`, `src/data/import.test.ts`, `src/data/steam.ts` (source adapter, see feature 9), `src/features/import-sources.tsx` (paste-a-list UI).

**Implementation Approach:** Extract the generic parts of `importBackloggd` (progress/report types, `withRetry`, chunking, dedupe, strict search fallback) into a shared pipeline; implement three thin adapters (CSV parser, Steam adapter reusing feature 9, pasted-title resolver). Round-trip compatibility with `toCsv()` (`settings-data.tsx:29-37`) is a sensible CSV target format. Show one consistent progress/report UI.

**Dependencies and Integrations:** Settings UI, IGDB search/batch, Backloggd engine, sync/report helpers, CSV export, Steam sync (feature 9), web proxy if web support is needed.

**Database Changes:** None at SQL level. Optional `importSource?`/`sourceId?` fields are backward-compatible JSON additions; keep them out of IGDB `FIELDS`.

**Potential Challenges:** Current dedupe only checks numeric `igdbId` (UI warns manual games cannot be detected, `settings-data.tsx:281-286`); pasted titles are ambiguous; CSV quoting/BOM/headers need robust parsing; IGDB rate limits (retry/chunking already exist); cancellation is mid-batch only; large imports stress the 500 ms full-blob save; any new `igdb.ts` export must be mirrored in web.

**Testing Requirements:** Vitest tests for CSV/paste parsers (quoting, BOM, headers, malformed rows), dedupe, report generation, `Game` mapping with mocked IGDB; component tests for the `Phase` machine only if a React test helper is added; manual QA of cancel/progress.

**Investigation Required:** Target CSV format, Steam data source (export file vs WebAPI), disambiguation policy for pasted titles, merge-vs-skip policy for duplicates without IGDB IDs, and whether all sources must work in the web build.

---

## 15. Shareable Profile / Statistics Card

**Objective:** Export a shareable image of the profile banner including the badge and relevant statistics.

**Current Implementation:**
- Profile banner: `ProfileSection` (`src/features/overview.tsx:9-101`), banner JSX (`:58-98`) with aurora element, avatar, name/bio, `<RarityBadge games={data.games} />` (`:94`), game count (`:97`). Profile picture is already canvas-resized to JPEG data URL (`:36-53`); `cropCover` (`:109-128`) and `hq` (`:106`) are other canvas helpers.
- Badge: `RarityBadge` (`src/components/rarity-badge.tsx:4-17`) uses `topBadge(games)` (`src/domain/trophies.ts:262-263`) via `evaluate()` (`:244-254`) and `RARITY_COLOR` (`:257-260`), labels from `RARITY_LABEL` (`:5`).
- Stats data: `Tile`/`Section` (`src/domain/stats.ts:5-10`), `index()`/`build()` (`:35-47,505-506`), `overview()` tiles (`:248-265`), `milestones()` badge counts (`:433-441`).
- Other canvas helpers: `readImage` (`src/features/library-components.tsx:80-108`), `toDataUrl` (`src/features/media.tsx:24-35`).
- File save: `saveOrDownload` with native dialog vs Blob download (`src/features/settings-data.tsx:39-50`); `saveTextFile` (`src/data/igdb.ts:122-126`) → Rust `save_text_file` (`src-tauri/src/lib.rs:1123-1147`) **text only**; web mirror `web/src/igdb.web.ts:317-326`.
- CSP: `src-tauri/tauri.conf.json:24-25` (`img-src 'self' data: asset: … + IGDB/YouTube`); `web/vite.config.ts:42` includes `blob:`.
- No `html2canvas`/`html-to-image` dependency exists (`package.json:14-33`).

**Probable Files to Modify:**
- `src/features/overview.tsx` — export button / card mount (`:58-98`).
- `src/main.tsx` — Dashboard receives `ProfileSection` at `:251`; wire a new card similarly.
- `src/data/igdb.ts` + `web/src/igdb.web.ts` — add binary/image save wrapper.
- `src-tauri/src/lib.rs` — new base64/binary save command and register in `generate_handler!` (`:1187-1204`), reusing `tauri-plugin-dialog` and `base64`.
- `src/components/rarity-badge.tsx` — optional card-friendly variant.
- `src/domain/stats.ts` — reuse stat values.
- `src/features/overview.css` — styling/source layout.

**Potential New Files (proposed):**
- **[proposed]** `src/features/share-card.tsx`, `src/domain/share-card.ts`, `src/features/share-card.css`, `src/domain/share-card.test.ts`.

**Implementation Approach:** Build the card with Canvas2D from explicit data (profile fields, `topBadge`, selected stat tiles) rather than DOM-to-image, avoiding new dependencies and CSS fidelity issues. Produce a PNG data URL/Blob and save through a new native binary save command or the existing web Blob path. Provide a deterministic layout at high resolution (e.g. 1200×630), with fallbacks for empty libraries.

**Dependencies and Integrations:** Profile/badge/stats domains, canvas utilities, save dialogs (Tauri/web), theme accent (feature 5), spending/franchise/time stats (features 3/11/13).

**Database Changes:** None for export itself. Optional share-card preferences in `AppSettings` remain JSON-only.

**Potential Challenges:** CSS aurora/animations cannot be reproduced by Canvas2D automatically; remote IGDB images may taint the canvas (CORS not verifiable here); existing `save_text_file` is text-only; jsdom canvas is unusable without extra deps; web vs native save UX differs; theme/accent consistency.

**Testing Requirements:** Vitest tests for card data selection, label formatting, fallbacks; jsdom test asserting the export button and data assembly with mocked canvas/save; manual visual verification of the generated image.

**Investigation Required:** Card dimensions/format, exact stat set, top badge vs all milestones, web support requirement, and cross-origin image drawing feasibility in both builds.

---

# D. PROGRESSIVE WEB APP

## 16. PWA Installation and Offline Caching

**Objective:** Make the web build installable, provide an offline fallback, and define safe caching strategies.

**Current Implementation (verified absence + reusable primitives):**
- No manifest, service worker, Workbox, `vite-plugin-pwa`, `public/` directory, or offline caching exists. `web/index.html:1-12` has only charset/viewport/title/`#root`/module script; `web/vite.config.ts:64` plugins are `[swapModules(), react(), csp()]`; CSP at `:36-54` is build-only with `script-src 'self' https://accounts.google.com` (inline scripts blocked, same-origin SW allowed).
- `web/worker/` is a **Cloudflare Worker** (server-side proxy), not a browser service worker — do not confuse them.
- Offline-relevant code that already exists: IndexedDB `web/src/db.ts:9-13` (`kv`, `images`); `navigator.storage.persist()` (`web/src/repository.web.ts:43`); image blobs (`web/src/codec.ts:48-109`); `navigator.onLine` + `dirty` queue + `visibilitychange` (`web/src/sync.ts:320-354`); `cache: "no-store"` IGDB transport and in-memory LRU caches (`web/src/igdb.web.ts:26-49,328-352`); icons in `src-tauri/icons/` and `src/images/logo/`.
- `vercel.json:1-5` SPA rewrite excludes `assets/` and paths with dots; Cloudflare Pages config is absent; deploy target docs conflict.

**Probable Files to Modify:**
- `web/index.html` — manifest link, `theme-color`, icon links.
- `web/vite.config.ts` — PWA plugin or static asset setup, `publicDir` handling (`:59-63`), CSP extension only if needed.
- `web/src/entry.tsx` — register/upgrade service worker after `init()` (`:1-7`), preserve F11 fullscreen patch (`:9-15`).
- `web/src/igdb.web.ts` — offline policy for `post()`/`cache:"no-store"` (`:26-49`) and in-memory caches.
- `web/src/sync.ts`, `web/src/drive.ts` — offline UX around `navigator.onLine`, `dirty`, auth failures.
- `web/src/cloud-panel.tsx`, `web/src/settings-data.web.tsx` — install/offline/cache controls.
- `vercel.json` or new Cloudflare Pages config (`_headers`, `_redirects`).
- `package.json` — only if adopting a build plugin.
- Shared `src/`, `src-tauri/`, desktop config should remain untouched.

**Potential New Files (proposed):**
- **[proposed]** `web/public/manifest.webmanifest`, `web/public/sw.js` (or `web/src/sw.ts`), `web/public/icons/icon-192.png`, `icon-512.png`, maskable variant, `apple-touch-icon.png`, `web/public/_headers`, `web/public/_redirects`, `web/src/pwa.ts`, `web/src/offline-status.tsx`, plus tests.

**Implementation Approach:** Add a manifest + same-origin service worker; cache the app shell and content-hashed static assets (cache-first for hashed assets, network-first with cache fallback for HTML/navigation); register the SW from `entry.tsx` (not inline script, due to CSP); keep IndexedDB as the only source of truth for library data; queue cloud pushes through the existing `dirty` flag; decide explicitly whether IGDB responses are cached (prefer short-lived, size-capped metadata cache with a "cached" marker, never credentials). Add update prompts and a clear-cache control.

**Dependencies and Integrations:** WebApp architecture (feature 6), IndexedDB/codec, Drive sync conflict model, CSP, deploy config, theme colors (feature 5), possible UX overlap with Android (feature 7).

**Database Changes:** None for AppData/SQLite. IndexedDB v1 (`web/src/db.ts:9`) only changes if a new metadata cache store is added (requires version bump). Never store the Drive snapshot or credentials in SW Cache Storage.

**Potential Challenges:** `hasTauri = true` makes IGDB/import UI appear offline; IGDB proxy responses are `no-store` and carry credentials in headers; cross-origin images yield opaque responses; SW caches plus Blobs compete for quota; first visit cannot be offline; `vercel.json` rewrites must not swallow `/sw.js`; iOS Safari PWA limitations; IGDB terms for offline metadata.

**Testing Requirements:** Manifest/installability audit (HTTPS, 192/512 icons, `display`, `start_url`); SW lifecycle/update tests; offline navigation to SPA routes; offline rendering of saved covers from IndexedDB; verify no credentials in caches; offline `dirty` → reconnect push and conflict path; CSP console check; quota/eviction paths; Chromium/Firefox/iOS matrix; desktop + web build regression. Real-browser testing (e.g. Playwright) would be a **suggested, not installed** addition.

**Investigation Required:** Scope (install prompt only vs full offline metadata), handwritten SW vs plugin, static asset location (`root/public` vs `web/public` — creating root `public` blurs web isolation), authoritative deploy target, whether `hasTauri = true` should change offline, and IGDB offline policy.

### PWA concepts (for the implementer who is learning this area)

- **PWA:** an ordinary web app enhanced with a manifest + service worker over HTTPS; installable to a home screen/window, capable of offline use. Not a new language or app store package.
- **Web app manifest:** JSON linked from `<head>` (`<link rel="manifest" href="/manifest.webmanifest">`). Declares `name`, `short_name`, `start_url`, `scope`, `display: "standalone"`, `theme_color`, `background_color`, and icons (192/512, maskable). It controls installation/appearance only — **no offline behavior by itself**.
- **Service worker:** background JS, separate from pages, registered from `entry.tsx`; intercepts `fetch` for its scope and chooses network, cache, or both. Lifecycle `install` → `activate` (delete old caches); HTTPS required (localhost exempt); no DOM access; can use Cache Storage and IndexedDB.
- **Caching strategies:** cache-first for immutable hashed assets; network-first with cache fallback for HTML/navigation (avoids stale shell referencing deleted hashed files); stale-while-revalidate for tolerant thumbnails; network-only for auth and writes.
- **Static assets vs API/data:** static bundles/fonts/icons are safe to cache aggressively because filenames are hashed. API/data responses (IGDB metadata, Drive snapshots) are personal/changeable — cache only with TTL, size caps, and never secrets.
- **Avoiding stale/inconsistent user data here:** IndexedDB (`web/src/db.ts`, `KEY.data`) is the single source of truth; the SW must never reconstruct library state from HTTP caches. Edits → IndexedDB → `emitDirty()` → queued Drive push (`web/src/sync.ts:331-337`); conflicts use `remote.modifiedTime`. Offline reads/writes stay local; freshness marks like `igdbUpdatedAt`/`lastIgdbSyncAt` can invalidate cached metadata.
- **Offline boundary:** *should* work offline — app shell, hashed assets, icons, library + images (already IndexedDB), pending sync state, optionally recently viewed IGDB details with a "cached" label. *Should not* work offline — Google sign-in/token renewal, Drive listing/upload/download (queue instead), IGDB credentials, freshness-critical feeds, or anything that could silently overwrite newer cloud data.

---

# PART 4 — CROSS-FEATURE DEPENDENCIES

## Verified dependency overview

| Relationship | Shared code that justifies it | Implementation implication |
|---|---|---|
| **16 PWA → 6 WebApp (hard)** | `web/index.html`, `web/vite.config.ts`, `web/src/entry.tsx`, `web/src/db.ts` | PWA cannot start until the web shell/config are stable |
| **9 Steam sync → 12 Platform ownership** | `Game.platforms`, `playedPlatforms`, `emulatedOn` (`src/domain/game.ts:11,14`; `src/data/platform.ts:34-38`; `src/domain/stats.ts:311-327`) | Ownership model should exist before Steam mapping |
| **9 Steam sync → 3 Gameplay time stats** | `Game.totalSeconds`, TTB fields (`src/domain/game.ts:9,13`), Backloggd playtime precedent (`src/data/backloggd.ts:88-90`) | Steam playtime lands in existing fields before new charts |
| **9 / 14 Steam → web proxy** | Worker allow-list `web/worker/src/index.ts:6-9`; `canRun = hasTauri && creds` in `src/features/settings-data.tsx:240,355` | Web support needs new proxy endpoints + CSP |
| **14 More imports → 9 Steam** | `igdbSearch`, `igdbImportBatch`, `igdbPlatforms` (`src/data/igdb.ts:58-120`), `withRetry`/`mapEntry`/reports (`src/data/backloggd.ts:59-223`) | Build the reusable pipeline (14) before the Steam adapter (9) |
| **13 Franchise completion → series data + completion status** | `Game.franchises` (`src/domain/game.ts:17`), `igdbSeries`/`SeriesData` (`src/data/igdb.ts:94-102`; `src/features/series.tsx:52-57`), `done = status === "Completed"` (`src/domain/stats.ts:45`), `franchises()` (`:349-366`) | No new franchise data source needed if computed on the fly |
| **10 What to play next → 4 Discover + backlog** | `STATUSES[0] = "Backlog"` (`src/domain/game.ts:3`); genres fed into `igdbDiscoverFeedCached` (`src/features/discover.tsx:57,71`); scoring inputs `rating`, `favorite`, `totalSeconds`, `timeAvgSeconds` (`game.ts:8-13`) | Reuse ranking concepts; keep local scorer separate from IGDB feeds |
| **11 Wishlist extras → Stats + export + 15 share card** | Wishlist section (`src/features/dashboard.tsx:111,209-221`), `CATEGORIES`/`build` (`src/domain/stats.ts:12-26,505`), `toCsv` (`settings-data.tsx:29-37`) | Spending fields feed stats tiles and the card |
| **3 Gameplay time → 15 / 13 / 9** | `len` from TTB (`src/domain/stats.ts:44`), hidden `length()` (`:401-412`), `BigStat` (`src/features/dashboard.tsx:38`) | Stabilize aggregation before exporting/consuming it |
| **12 Ownership → 14 / 3** | Platform ID mapping (`src/data/backloggd.ts:69-77`), `platforms()` (`src/domain/stats.ts:311-327`) | Ownership fields affect import mapping and stats |
| **8 Add Game search bug → 4 / 14 (shared search)** | Auto-search effect (`src/features/library-components.tsx:47-54`), `igdbSearch` shared with Discover (`:5,87`) and Backloggd (`src/data/backloggd.ts:184`) | Fixing the trigger benefits all search UX |
| **15 Share card → 5 Theme + 3/11/13 stats** | `Profile` (`src/domain/game.ts:24`), `--accent` (`src/style.css:37`), `topBadge` (`src/domain/trophies.ts:262`) | Card should follow final theme/stats decisions |
| **16 PWA → 5 Theme (minor)** | Manifest `theme_color` should follow profile accent / `--accent` | Coordinate colors |
| **1 Played/completed → 13/3/10** | `Status` (`src/domain/game.ts:3-4`), `compareGames` "completion" (`src/main.tsx:305`), legacy `"Played"` normalized away (`src/data/repository.ts:15`, `web/src/codec.ts:126`) | Clarify semantics before stats/recommendation rely on it |

## Largely independent features

- **2 Fit All asc/desc** — confined to `src/features/journey.tsx` (`FitView` `:274-342`, `session` `:135`, `toggleFit` `:781-786`); no cross-module data change.
- **5 Theme system** — mainly CSS + `AppSettings.theme`, with light coupling to 16/15.
- **7 Android app** — packaging concern using `src-tauri/`; no domain coupling; can run in parallel, but may compete with PWA for "installed app" UX.
- **8 Add Game search fix** — localized component fix, though it shares `igdbSearch`.

**Feature 1 is the main ambiguity:** "Played/completed without entry screen" could mean quick status changes from library/details, or resurrecting the legacy `Played` filter (normalized away in `src/data/repository.ts:15` and `web/src/codec.ts:126`). Requires product clarification before scheduling.

---

# PART 5 — SUGGESTED IMPLEMENTATION ORDER

No dates are assigned. Ordering is by dependency, complexity, and risk to existing functionality.

**Phase 1 — Isolated, low-risk fixes**
1. **8** Add Game search-visibility fix (`src/features/library-components.tsx:47-54,190-210`).
2. **2** Fit All asc/desc (`src/features/journey.tsx:274-342,467-481,811-858`).
3. Housekeeping: remove save debug logs / clear error toast (`src/main.tsx:164-208`).

**Phase 2 — Settle data-model extensions early (all JSON, no SQL migrations)**
4. **1** status/date semantics; **12** ownership fields (existing platform fields already present); **11** wishlist price/payment/reminder fields; **10** priority. Define defaults in `src/domain/game.ts:61-77` and normalization in `src/data/repository.ts` / `web/src/codec.ts:111-129`. Keep all new user-owned fields out of `src/data/sync.ts` `FIELDS` (`:28-47`).

**Phase 3 — Domain/analytics built on those fields**
5. **3** gameplay time stats (re-evaluate hidden `length` section).
6. **13** franchise completion (reuse `stats.franchises()` + `igdbSeries`).
7. **4** Discover relevance (change Rust and `web/src/igdb.web.ts` together).
8. **10** What Should I Play Next (depends on 4 + backlog/priority fields).

**Phase 4 — Higher-risk import/sync (network, rate limits, duplicates)**
9. **14** reusable import pipeline + CSV/paste adapters (reuse `toCsv` shape and `importBackloggd`).
10. **9** Steam sync (depends on 12, 3, 14; auth strategy must be decided first).

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

This task was strictly documentation. Do not implement planned features, refactor existing code, change application behavior, modify database schemas, install dependencies, change configuration, or delete/rename existing files while using this guide. Only the three knowledge-base Markdown files were created.

---

# PART 7 — VERIFICATION NOTES AND UNCERTAIN ASSUMPTIONS

- **Verified directly:** file paths, route table, `AppData`/`Game` field lists, 15 Tauri command names, `app_state` schema, `FIELDS` sync allow-list, LRU cache implementation, module-swap map, env var names, absence of PWA/manifest/service worker, absence of Steam/priority/ownership/price fields, existing tests.
- **Uncertain / needs investigation at implementation time:** exact Add Game search bug reproduction; "Played On" semantics; authoritative franchise total source; Steam API/auth availability and "two-way" feasibility; share-card image/CORS feasibility; authoritative web deploy target (Vercel vs Cloudflare Pages); whether stale `web/worker/src/*` duplicates are intentional; exact Tauri Android generated layout and mobile capability schema; product definitions for mood/time/genre recommendation scoring and "total wishlist spending".
- **Documentation status:** all files in `docs/` were refreshed against source on 2026-11-19 and are consistent with this guide. The root `README.md` and `web/README.md` still contain stale claims (project structure, deploy target, Drive scopes, `.env.example`); use code and this guide for those.
