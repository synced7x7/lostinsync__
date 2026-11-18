# Performance & Optimization Report

**Application**: Lost in Sync (Tauri v2 + React 18 + TypeScript + SQLite)
**Original audit**: November 2026 · **Re-verified against source and build output**: 2026-11-19
**Scope**: Bottleneck analysis across assets, rendering, memory, and persistence.

> **Status note:** Several original findings have since been addressed. The table below records the original ranking with a *current status* column. Numbers were re-measured from `src/images/` and `dist/assets/` on 2026-11-19.

---

## Executive Summary

The audit identified uncompressed PNG assets, a large lazy-loaded ECharts chunk, spring-animated shelves, unbounded IGDB caches, and full-document persistence as the main bottlenecks. Since then, the IGDB caches have been replaced with bounded LRU + TTL maps, and image assets are smaller than at audit time, but the other bottlenecks remain.

---

## Bottleneck Ranking Summary

| Rank | Bottleneck Area | Impact | Current status (2026-11-19) |
|:---:|---|:---:|---|
| **1** | Image payload & GPU texture memory | 🟠 High | **Improved but open** — ~21 MB / 67 PNGs (down from ~34 MB) |
| **2** | Stats bundle & multiple canvas contexts | 🟠 High | **Open** — stats chunk ~698 KB; charts are already lazy-loaded |
| **3** | PS4 shelf spring transitions | 🟠 High | **Open** |
| **4** | Unbounded IGDB in-memory caches | 🟡 Medium | **Resolved** — bounded LRU + 20-min TTL implemented |
| **5** | Full-state serialization on every mutation | 🟡 Medium | **Open** — fundamental to the single-blob design |
| **6** | Redundant date parsing in Stats | 🟢 Low/Med | **Partly mitigated** — `tsCache`/`dp` memo in `src/main.tsx:292-298` |
| **7** | SVG path/layout work in Journey | 🟢 Low | **Open** — LOD culling already in place |

---

## Detailed Analysis

### 1. Image payload & GPU texture memory

**Current measurement:** `src/images/` contains **67 PNG files totaling ~21.12 MB** (previously reported as 34.07 MB). The largest source files are `lostinsynclogolarge.png` (~1.4 MB) and the five trophy backgrounds (~0.82–1.06 MB each, previously 2.6–3.2 MB). The built `dist/assets/` copies are in the same range.

`src/features/trophies.tsx` still eagerly resolves all badge and background URLs with `import.meta.glob(..., { eager: true, query: "?url", import: "default" })`, so all images are bundled and resolved on module load. Large 4K PNGs decoded into RGBA buffers still cost tens of MB of VRAM each.

**Recommendations (unchanged):** convert PNGs to WebP/AVIF, lazy-load only the active trophy background, and downscale badges to ~2× display size (max 256×256).

### 2. Stats bundle & multiple canvas contexts

The `stats` lazy chunk is **~698 KB minified** (previously 714.97 kB). It bundles ECharts core plus six chart types and several components; `src/features/stats.tsx` mounts a separate `echarts.init()` canvas and `ResizeObserver` per `ChartCard`, so one category can allocate 6–10 canvas contexts. Stats is already behind `lazy(() => import("./features/stats"))` in `src/main.tsx`, which limits the cost to first navigation.

**Recommendations:** `manualChunks` for ECharts in `vite.config.ts`, `IntersectionObserver` to init offscreen charts lazily, and one shared `ResizeObserver`.

### 3. PS4 shelf spring transitions

`PS4ShelfView` in `src/main.tsx` renders ~20–30 buffered cards; each `motion.button` runs a Framer Motion spring (`stiffness: 360, damping: 28`) with dynamic `scale`, `zIndex`, and `y` as focus changes, plus `AnimatePresence` backdrop crossfades. Fast wheel/keyboard navigation runs many spring solvers on the main thread.

**Recommendations:** CSS `transform` transitions via distance classes, debounce backdrop swaps 150–200 ms, and skip animation beyond `distance <= 2`.

### 4. IGDB in-memory caches — RESOLVED

The original five unbounded `Map` caches were replaced by `memo()` in `src/data/igdb.ts:36-52`: a bounded LRU with a **20-minute TTL**, failed-promise eviction, and per-cache caps (details 150, images 60, feeds 60, legacy discover 10, bundle 40). The web client mirrors this in `web/src/igdb.web.ts:328-352`. Hover prefetch remains at 250 ms, but results are now bounded and expire.

No further action required unless profiling shows the caps are too generous.

### 5. Full-state serialization on every mutation

Still accurate. `update()` (`src/main.tsx:192-197`) sets state and schedules a 500 ms debounced `flushSave` (`:164-190`), which serializes the entire `AppData` and writes one SQLite row. `flushSave` now logs payload size/stringify timing on every save (`:173-188`) — useful for measurement, but console noise in production and a candidate for removal. For 1,000–3,000 fully enriched games the JSON can reach multiple MB per write.

**Recommendations:** normalize into dedicated tables for games/profile/settings/collections with targeted update commands (long-term), or strip unchanged read-only metadata before writing (short-term).

### 6. Date parsing in Stats — partly mitigated

`src/main.tsx:292-298` now memoizes date parsing through a `tsCache`/`dp` helper, reducing repeated `Date.parse()` cost. `src/domain/stats.ts` still performs full-array `.map()`/`flatMap()` traversals in `index()` and `yearsOf()` on every filter change.

**Recommendations:** precompute year buckets when `data.games` changes; consider a `WeakMap<Game, ...>` for parsed timestamps.

### 7. Journey SVG work

Viewport culling and LOD suppression below 40% zoom (`LOD_Z = 0.4`) are already effective. Remaining ideas: `will-change: transform` on `.jn-world` and memoizing branch `d` path strings.

---

## Recommended Next Steps

1. **High ROI:** convert trophy backgrounds and large badges to WebP and lazy-load the active background.
2. **Medium term:** ECharts vendor chunking, IntersectionObserver for charts, and CSS-based shelf transitions.
3. **Long term:** normalized SQLite tables with targeted mutations; keep the existing LRU caches and date memo as they are.
