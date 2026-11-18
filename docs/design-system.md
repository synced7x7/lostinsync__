# Design system

> **Verified against source on 2026-11-19.**

## Current state

The only implemented theme is **Aurora Glass**. Its semantic tokens are declared on `:root` at the top of `src/style.css` (around lines 25-44):

```css
--bg, --panel, --panel-strong, --line, --line-soft,
--text, --muted, --dim, --accent, --accent-strong,
--cyan, --rose, --success, --shadow, --radius
```

Component-scoped variables extend these: `--p` (rating ring), `--c` / `--rc` (rarity colors), `--g` (trophy rarity RGB), `--tc` (chart tone), `--jn-left` (timeline).

The visual language uses translucent panels, backdrop blur, thin borders, soft gradients, generous spacing, and restrained accent colors. The interface remains usable without the remote font import so core features stay offline.

## Theming today

`AppSettings.theme` is the literal type `"aurora"` (`src/domain/game.ts:30`), the Settings view shows a static "Aurora" pill (`src/features/settings.tsx:18`), and there is **no** `data-theme` attribute, theme provider, class toggle, or `prefers-color-scheme` handling anywhere in the app. Saving a theme selection is therefore not currently possible.

Some literal colors remain at the top of `style.css` and throughout feature stylesheets, and ECharts palette values (`C`, `MUTED`, `AX`, `TIP`, `LEG` in `src/domain/stats.ts:101-114`) are JavaScript constants rather than CSS variables. A future theme system must migrate those too; overriding variables alone would only partially change the UI.

## Adding a theme (not yet implemented)

The example below is a **proposed pattern**, not something the code currently supports. To implement multiple themes you would need to widen `AppSettings.theme`, apply an attribute to the document root, add override blocks, and persist the selection through settings:

```css
[data-theme="ember"] {
  --accent: #ff9a76;
  --accent-strong: #e36a4f;
  --cyan: #ffd166;
}
```

See feature 5 in `agent/future_implementation_guide.md` for the full investigation and file list.

Web-specific styling lives in `web/src/cloud.css`. The copy at `web/worker/src/cloud.css` is stale, unused dead code.
