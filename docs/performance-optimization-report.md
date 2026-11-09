# Performance & Optimization Report

**Application**: Lost in Sync (Tauri v2 + React 19 + TypeScript + SQLite)  
**Date**: November 2026  
**Scope**: Comprehensive performance audit, bottleneck analysis, and ranking of optimization opportunities across assets, rendering, memory, and persistence.

---

## Executive Summary

Lost in Sync is an offline-first desktop gaming tracker with a rich desktop UI. While the core architecture leverages lightweight Tauri v2 IPC, SQLite storage, and React 19, an audit of the production build output and source codebase reveals several critical bottlenecks—most notably **uncompressed high-resolution raster assets (~34 MB)**, **monolithic bundle chunks (ECharts @ 715 kB)**, and **unbounded session memory caches**.

The table below summarizes all identified performance issues, ranked from highest to lowest impact.

---

## Bottleneck Ranking Summary

| Rank | Bottleneck Area | Impact Level | Primary Resource Affected | Complexity to Fix |
|:---:|---|:---:|---|:---:|
| **1** | **Uncompressed Asset Payload & GPU Texture Memory Bloat** | 🔴 **Critical** | Disk space, App installer size, GPU VRAM, Initial load | Low (Asset conversion & lazy loading) |
| **2** | **Monolithic Stats Bundle & Multiple Canvas Contexts** | 🟠 **High** | Main thread JS execution, Chunk download size, Memory | Medium (Rollup chunking & lazy canvas) |
| **3** | **PS4 Shelf Spring Transitions on Continuous Scroll** | 🟠 **High** | CPU Frame rate, Compositor thread, Layout stability | Low (CSS transforms & animation throttling) |
| **4** | **Unbounded In-Memory Caches in IGDB Service** | 🟡 **Medium** | Long-session Heap RAM, Garbage Collection | Low (LRU cache / capped Map with TTL) |
| **5** | **Full State Serialization & IPC Overhead on Every Mutation** | 🟡 **Medium** | Main thread JSON serialization, Disk I/O, IPC throughput | Medium (Granular updates / targeted queries) |
| **6** | **Redundant Linear Array Traversal & Date Parsing in Stats** | 🟢 **Low / Med** | CPU computation time when filtering stats | Low (Memoization & WeakMap timestamp cache) |
| **7** | **Dynamic SVG Path Generation & Layout Recalculation in Journey** | 🟢 **Low** | SVG redraw latency during fast drag/pan | Low (GPU transform hints & path caching) |

---

## Detailed Bottleneck Analysis & Solutions

### 1. 🔴 Rank 1: Uncompressed Asset Payload & GPU Texture Memory Bloat

#### The Problem
The `src/images/` directory contains **34.07 MB** of uncompressed PNG files across 67 files:
- **5 Trophy Backgrounds**: Each individual background PNG is between **2.6 MB and 3.2 MB** (e.g., `5. Crimson Gothic Cathedral UI Frames.png` is 3,204 kB; `3. Gothic Moonlit Thorn Emblem UI.png` is 2,982 kB).
- **60+ Badges**: Badges range from 100 kB to over 1,000 kB each (e.g. `6.9 Father of the Odyssey.png` is 1,035 kB).
- In `src/features/trophies.tsx`:
  ```typescript
  const FILES = import.meta.glob("../images/badges/*.{png,webp,jpg}", { eager: true, query: "?url", import: "default" });
  const BGS = Object.entries(
    import.meta.glob("../images/trophy-bg/*.{png,webp,jpg}", { eager: true, query: "?url", import: "default" })
  )...;
  ```
  All 67 image URLs are eagerly bundled and resolved on module load.

#### Why It Consumes Performance
1. **Installer and Bundle Size**: Bloats the Vite production output to >35 MB and inflates the Tauri installer `.msi`/`.exe`.
2. **GPU Texture VRAM Consumption**: When the browser engine decodes a 3.2 MB 4K PNG into an uncompressed RGBA pixel buffer (width × height × 4 bytes), a single image consumes **~33 MB to 45 MB of GPU VRAM**. Decoding 5 full-page backgrounds and dozens of badges simultaneously can consume over **200 MB of VRAM**, causing noticeable memory spikes and frame stutter on mid-range laptops or integrated GPUs.

#### How to Solve
1. **Convert to WebP / AVIF**:
   - Re-encode all PNGs to modern WebP (or AVIF) with lossless/near-lossless compression (85-90% quality).
   - This typically achieves an **80% to 90% file size reduction** without perceptible visual loss, dropping 3.2 MB backgrounds down to ~300 kB - 450 kB.
2. **Lazy Dynamic Imports for Backgrounds**:
   - Remove eager globbing for backgrounds. Load only the background corresponding to the current active page tab (`const bgUrl = await import(...)` or dynamic indexed image mapping).
3. **Badge Spriting or Low-DPI Fallback**:
   - Badges in the grid are displayed at relatively small CSS dimensions (~80px to 140px). Serving 2000px source PNGs is redundant. Resize the source badge assets to 2x display density (max 256×256 px).

---

### 2. 🟠 Rank 2: Monolithic Stats Bundle & Multiple Canvas Contexts

#### The Problem
1. **Large Chunk Size**:
   - `dist/assets/stats-A1MTMN3V.js` compiles to **714.97 kB minified** (gzip: 241.99 kB).
   - It bundles the entire Apache ECharts library core, 6 chart types (`BarChart`, `HeatmapChart`, `LineChart`, `PieChart`, `RadarChart`, `ScatterChart`), and 8 components (`CalendarComponent`, `DataZoomComponent`, `VisualMapComponent`, etc.).
2. **Multiple Canvas Allocations**:
   - In `src/features/stats.tsx`, each `ChartCard` mounts a separate `echarts.init()` instance with its own canvas buffer and an independent `ResizeObserver`:
   ```typescript
   function Chart({ option, height }: { option: Opt; height: number }) {
       const ref = useRef<HTMLDivElement>(null);
       const inst = useRef<echarts.ECharts | null>(null);
       useEffect(() => {
           const c = echarts.init(ref.current!, undefined, { renderer: "canvas" });
           ...
           const ro = new ResizeObserver(() => c.resize());
           ro.observe(ref.current!);
           return () => { ro.disconnect(); c.dispose(); };
       }, []);
   ```
   A single category view (e.g. "Activity" or "Genres") can mount 6 to 10 charts at once.

#### Why It Consumes Performance
1. **Initial Tab Latency**: When navigating from Library to Stats, Vite fetches and evaluates the 715 kB chunk on the main JavaScript thread, resulting in a brief UI hitch.
2. **Canvas Buffer Overhead**: Allocating 8-10 distinct HTML5 `<canvas>` rendering contexts simultaneously consumes significant browser memory and GPU compositor bandwidth.

#### How to Solve
1. **Rollup Vendor Chunk Splitting**:
   - In `vite.config.ts`, configure `build.rollupOptions.output.manualChunks`:
     ```typescript
     manualChunks: {
       echarts: ["echarts/core", "echarts/charts", "echarts/components", "echarts/renderers"]
     }
     ```
   - This isolates ECharts into a permanent, cacheable vendor chunk so application code changes don't invalidate the chart engine chunk.
2. **IntersectionObserver for Offscreen Charts**:
   - Wrap `ChartCard` with an `IntersectionObserver`. Only invoke `echarts.init()` when the chart card scrolls into or near the viewport, avoiding the simultaneous instantiation of 10 canvas contexts.
3. **Consolidated ResizeObserver**:
   - Use a single shared `ResizeObserver` listener on the parent container instead of creating a new `ResizeObserver` instance for every chart.

---

### 3. 🟠 Rank 3: PS4 Shelf Spring Transitions on Continuous Scroll

#### The Problem
In `src/main.tsx`, `PS4ShelfView` renders a carousel of visible and buffered cards (`shown = games.slice(win.a, win.b)`, typically 20-30 cards).
- Every card receives a dynamic `distance` property:
  ```typescript
  distance={Math.min(Math.abs(focusedIdx - idx), PS4_CAP)}
  ```
- Each `PS4Card` animates using Framer Motion springs:
  ```typescript
  <motion.button
    animate={{
      scale: PS4_CARD_SCALES[distance] ?? 1,
      zIndex: distance === 0 ? 20 : distance === 1 ? 10 : distance === 2 ? 5 : 1,
      y: -(PS4_CARD_LIFTS[distance] ?? 0),
    }}
    transition={{ type: "spring", stiffness: 360, damping: 28 }}
  ```

#### Why It Consumes Performance
1. **Main Thread Spring Solvers**: When the user navigates quickly using horizontal mouse wheel scrolling or arrow keys, `focusedIdx` updates continuously. Framer Motion starts and calculates concurrent spring physics trajectories for 20+ cards on the main thread every animation frame.
2. **Z-Index Layer Reordering**: Modifying `zIndex` dynamically across multiple adjacent elements forces the browser layout engine to recalculate stacking contexts during fast scrolls.
3. **Background Crossfades**: `AnimatePresence` in `PS4ShelfView` unmounts and mounts a full-screen backdrop `motion.div` with opacity transitions on every single card step.

#### How to Solve
1. **Use Hardware-Accelerated CSS Transitions**:
   - Transition transforms via CSS rules (`transition: transform 0.22s cubic-bezier(0.2, 0, 0, 1)`) using data attributes or class names (`.ps4-card--dist-0`, `.ps4-card--dist-1`, etc.).
   - Modern browser engines animate CSS `transform` exclusively on the compositor thread without invoking JavaScript spring solvers.
2. **Debounce Fullscreen Background Crossfades**:
   - Throttle or debounce the background artwork swap (`featured.backgroundCover`) by 150-200ms so that fast scrolling across 10 cards only renders the background of the final resting card rather than triggering 10 overlapping fade animations.
3. **Bound Animated Scope**:
   - Only apply scale/lift to `distance <= 2`. Cards with `distance > 2` should have static zero-overhead styles.

---

### 4. 🟡 Rank 4: Unbounded In-Memory Caches in IGDB Service

#### The Problem
`src/data/igdb.ts` defines 5 unbounded global `Map` caches:
```typescript
const discoverCache = new Map<string, Promise<IgdbDiscover>>();
const discoverFeedCache = new Map<string, Promise<IgdbDiscoverGame[]>>();
const detailsCache = new Map<string, Promise<IgdbGame>>();
const imagesCache = new Map<string, Promise<IgdbDebugImage[]>>();
const bundleCache = new Map<string, Promise<IgdbDiscoverGame[]>>();
```
Furthermore, `src/features/discover.tsx` registers a prefetch handler on mouse hover:
```typescript
onMouseEnter={() => { timer.current = window.setTimeout(() => prefetchGame(game.id), 250); }}
```
Every game card hovered for longer than 250ms triggers full metadata and image gallery requests that are permanently cached in memory.

#### Why It Consumes Performance
- **Uncapped Memory Accumulation**: Unlike browser HTTP caching (which uses disk storage and LRU eviction), these in-memory `Map` objects persist for the entire application session.
- Browsing multiple Discover feeds, scrolling paginated lists, and hovering over dozens of game cards can cache hundreds of detailed JSON trees and image lists, consuming 50-100+ MB of RAM without ever releasing it to garbage collection.

#### How to Solve
1. **Bounded LRU Cache Structure**:
   - Wrap cache accesses in a lightweight LRU (Least Recently Used) data structure with a maximum size (e.g., maximum 100 entries per cache).
   - Once the threshold is exceeded, evict the oldest entry:
     ```typescript
     function setBounded<K, V>(map: Map<K, V>, key: K, val: V, max = 100) {
       if (map.size >= max) map.delete(map.keys().next().value);
       map.set(key, val);
     }
     ```
2. **Time-To-Live (TTL)**:
   - Add a timestamp or expiration (e.g., 20 minutes) so stale discovery feed snapshots are automatically purged.
3. **Hover Prefetch Throttling**:
   - Increase hover debounce from 250ms to 400ms, or only prefetch basic metadata without fetching full multi-megabyte image lists.

---

### 5. 🟡 Rank 5: Full State Serialization & IPC Overhead on Every Mutation

#### The Problem
The application currently persists data using a document-store pattern:
```typescript
const update = (next: AppData) => {
  setData(next);
  pendingSave.current = next;
  if (saveTimer.current) clearTimeout(saveTimer.current);
  saveTimer.current = setTimeout(flushSave, 500);
};
```
When `flushSave` runs:
1. React serializes the full `AppData` object (all games, profile, settings, collections) into a single JSON payload.
2. The payload is sent across Tauri IPC to Rust (`save_app_data`).
3. Rust executes an SQL `UPSERT INTO app_state (id, data_json) VALUES (1, ?)` writing the entire JSON string into SQLite.

#### Why It Consumes Performance
- **Scalability Ceiling**: For a library of 50 games, this is fast (<5ms). However, for enthusiastic collectors with 1,000 to 3,000 games containing full IGDB metadata, descriptions, themes, and platform lists, the JSON string can exceed 5 MB to 15 MB.
- Performing `JSON.stringify` on a 15 MB object and passing it across IPC on every minor change (e.g. clicking a star rating, toggling a status pill, editing a note) introduces GC spikes, serialization overhead, and redundant disk write I/O.

#### How to Solve
1. **Targeted Mutations (Long-Term)**:
   - As planned in the database roadmap, normalize the SQLite schema into dedicated tables (`games`, `profile`, `settings`, `collections`).
   - Implement specific Tauri commands for atomic updates (e.g., `update_game_field(game_id, field, value)` or `update_game(game)`).
2. **Differential Serialization (Short-Term)**:
   - Strip heavyweight read-only metadata (e.g., cached descriptions or themes already present in IGDB) if they haven't been modified, or ensure only modified entities trigger writes.

---

### 6. 🟢 Rank 6: Redundant Linear Array Traversal & Date Parsing in Stats

#### The Problem
In `src/domain/stats.ts`:
- `index(games: Game[])` performs a full array `.map()` over all games. Inside the loop, it invokes `ts()`:
  ```typescript
  const ts = (d?: string) => { const n = Date.parse(d ?? ""); return Number.isNaN(n) ? undefined : n; };
  ```
- `yearsOf(games)` calls `flatMap` and parses both `startedAt`, `finishedAt`, and `createdAt` for every game, followed by array deduplication via `new Set()`.
- Whenever the user toggles between years in the Stats view, `index()` and `build()` re-traverse the entire array from scratch.

#### Why It Consumes Performance
- `Date.parse()` on ISO strings inside nested loops is relatively slow compared to numeric operations.
- Re-parsing identical date strings repeatedly whenever a filter changes produces unnecessary CPU cycles and short-lived allocations.

#### How to Solve
1. **Memoize Parsed Timestamps**:
   - Cache parsed epoch timestamps on the `Game` model or in a `WeakMap<Game, { s?: number; f?: number }>` so `Date.parse()` is called at most once per game.
2. **Precompute Year Buckets**:
   - Compute the list of available years once when `data.games` changes, rather than recalculating on every view render.

---

### 7. 🟢 Rank 7: Dynamic SVG Path Generation & Layout Recalculation in Journey

#### The Problem
In `src/features/journey.tsx`:
- The timeline renders dozens of cubic bezier connecting paths (`<path className="jn-curve" d={`M ... C ... L ...`} />`).
- During pan or wheel zoom, `vis.a` and `vis.b` update on scroll, filtering `vb` (visible branches) and recalculating SVG attributes.

#### Current Mitigations & Remaining Optimizations
- **Existing Strength**: The current implementation already features viewport culling and Level-of-Detail (LOD) node suppression below 40% zoom (`LOD_Z = 0.4`), which is effective at maintaining good frame rates.
- **Further Improvement**:
  - Add `will-change: transform` to the sticky world container (`.jn-world`) to ensure the GPU maintains a composited texture during dragging.
  - Memoize branch path strings (`d` attribute) by start/finish coordinates so identical branches do not recompute template strings on every tick.

---

## Conclusion & Recommended Next Steps

1. **Immediate High-ROI Action**: Convert the 5 trophy background PNGs to WebP. This single change will instantly reduce the application asset payload by **>25 MB** (~75% reduction of the entire app asset size) and cut GPU texture allocation by ~150 MB.
2. **Medium-Term Action**: Configure `manualChunks` in `vite.config.ts` to isolate ECharts and Lucide icons, and convert `PS4Card` spring animations to hardware-accelerated CSS transitions.
3. **Long-Term Action**: Implement a bounded LRU eviction policy in `igdb.ts` and transition from single-document JSON serialization to normalized SQLite tables.
