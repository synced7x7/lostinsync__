# Design system

> **Verified against source on 2026-11-19.**

## Current state

The app has a **theme system** with three built-in dark themes: **Aurora** (default), **Ember**, and **Moonlight**. Semantic tokens are declared in `src/style.css` on `:root, [data-theme="aurora"]` and overridden in `[data-theme="ember"]` and `[data-theme="moonlight"]`.

```css
--bg, --bg-glow-1, --bg-glow-2, --panel, --panel-strong, --line, --line-soft,
--text, --muted, --dim, --accent, --accent-strong,
--cyan, --rose, --success, --shadow, --radius
```

Component-scoped variables extend these: `--p` (rating ring), `--c` / `--rc` (rarity colors), `--g` (trophy rarity RGB), `--tc` (chart tone), `--jn-left` (timeline).

The visual language uses translucent panels, backdrop blur, thin borders, soft gradients, generous spacing, and restrained accent colors. The interface remains usable without the remote font import so core features stay offline.

## Theming

- `src/domain/theme.ts` defines `ThemeId` (`aurora | ember | moonlight`), theme metadata, `normalizeTheme()` (unknown values fall back to `aurora`), and `applyTheme()` which sets `document.documentElement.dataset.theme`.
- `AppSettings.theme` is typed as `ThemeId` (`src/domain/game.ts`) and persisted in the normal `AppData.settings` JSON blob. Desktop (`src/data/repository.ts`) and web (`web/src/codec.ts`) normalize legacy/unknown values on load.
- `src/main.tsx` applies the active theme via `useEffect` when `data.settings.theme` changes.
- Settings (`src/features/settings.tsx`) exposes a theme picker; selecting a theme persists through `updateSettings`.
- ECharts colors are canvas-based, so `src/domain/stats.ts` reads CSS variables through `syncChartTheme()` inside `build()`, and `src/features/stats.tsx` includes the theme in chart keys/memo deps to rebuild charts on theme change.

## Adding a theme

1. Add the theme ID to `THEME_IDS` and metadata to `THEMES` in `src/domain/theme.ts`.
2. Add a `[data-theme="your-id"]` token block in `src/style.css`.
3. Verify contrast and hard-coded color hotspots (charts, gradients, SVG fills) still read acceptably.

Some literal colors remain in feature stylesheets and canvas/SVG code; overriding tokens covers most of the UI, but full theme fidelity requires migrating remaining hard-coded colors to CSS variables or theme-aware JS.

Web-specific styling lives in `web/src/cloud.css`. The copy at `web/worker/src/cloud.css` is stale, unused dead code.
