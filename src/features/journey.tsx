import {
  memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarDays, ChevronDown, Clock3, Maximize2, Minimize2, Minus, Plus, Route, Trophy } from "lucide-react";
import type { Game } from "../domain/game";
import { formatPlaytime } from "../domain/game";
import "./journey.css";

const DAY = 86_400_000;
const GAP = 150;       // vertical distance between branches
const X0 = 80;         // where the timeline starts
const SHORT = 5;       // branches narrower than this are drawn as a vertical "pillar"
const CARD_HALF = 90;  // horizontal space a game card + title needs on its lane
const TOP = 70;        // space reserved for the header above the world
const LOD_Z = 0.4;     // below this zoom: no covers/labels/dates, 1 strand
const ROW = 56;        // fit-mode row height
const PITCH = 62;      // row height + gap

const K = { main: "#8f86ff", active: "#5be3a4" };
type Kind = keyof typeof K;
type Range = "all" | "month" | number;

const PALETTE = ["#6ea8ff", "#5be3a4", "#ff9a4d", "#c58bff", "#f0c674", "#ff7aa8", "#4fd8e8"];
const STATUS_LABEL: Record<Kind, string> = { main: "Completed", active: "In progress" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmt = (t: number) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(t);
const fmtShort = (t: number) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(t);

const level = (lane: number) => (lane === 0 ? 0 : lane % 2 ? -(lane + 1) / 2 : lane / 2);
const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
const clampZoom = (z: number) => Math.max(0.1, Math.min(2.4, Math.round(z * 1000) / 1000));
const cssVar = (c: string) => ({ ["--c" as string]: c }) as CSSProperties;

/** IGDB covers -> 180x256 thumbnails. Uploaded (data:) covers are left alone. */
const thumb = (u?: string) =>
  u && u.includes("images.igdb.com") ? u.replace(/\/t_[a-z0-9_]+\//, "/t_cover_small_2x/") : u;

/** axis ticks: years for long spans, months for medium, weeks/days for short */
const makeTicks = (min: number, last: number, daily = false) => {
  const span = (last - min) / DAY;
  const out: { t: number; label: string }[] = [];
  if (span > 900) {
    for (let y = new Date(min).getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= last; y++)
      out.push({ t: Date.UTC(y, 0, 1), label: String(y) });
  } else if (span > 70) {
    const d = new Date(min);
    let y = d.getUTCFullYear(), m = d.getUTCMonth() + 1;
    for (; ; m++) {
      if (m > 11) { m = 0; y++; }
      const t = Date.UTC(y, m, 1);
      if (t > last) break;
      out.push({ t, label: m === 0 ? String(y) : MON[m] });
    }
  } else if (daily) {
    for (let t = min; t <= last; t += DAY) out.push({ t, label: String(new Date(t).getUTCDate()) });
  } else {
    for (let t = min + 7 * DAY; t <= last; t += 7 * DAY) out.push({ t, label: fmtShort(t) });
  }
  return out;
};

/* ───────────── path + braid geometry ───────────── */
type P = { x: number; y: number };

const bez = (a: P, b: P, c: P, d: P, n = 14): P[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t;
    return {
      x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
      y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
    };
  });

const line = (a: P, b: P): P[] => {
  const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 8));
  return Array.from({ length: n + 1 }, (_, i) => ({
    x: a.x + ((b.x - a.x) * i) / n,
    y: a.y + ((b.y - a.y) * i) / n,
  }));
};

const route = (x1: number, x2: number, T: number, y: number, merge: boolean): P[] => {
  if (y === T) return line({ x: x1, y: T }, { x: x2, y: T });
  const c = Math.min(70, (x2 - x1) / 4);
  const out = [
    ...bez({ x: x1, y: T }, { x: x1 + c, y: T }, { x: x1 + c, y }, { x: x1 + 2 * c, y }),
    ...line({ x: x1 + 2 * c, y }, { x: x2 - 2 * c, y }).slice(1),
  ];
  return merge
    ? [...out, ...bez({ x: x2 - 2 * c, y }, { x: x2 - c, y }, { x: x2 - c, y: T }, { x: x2, y: T }).slice(1)]
    : [...out, ...line({ x: x2 - 2 * c, y }, { x: x2, y }).slice(1)];
};

const strand = (pts: P[], phase: number, amp: number) => {
  const len: number[] = [0];
  pts.forEach((p, i) => i && len.push(len[i - 1] + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y)));
  const total = len[len.length - 1] || 1;
  return pts
    .map((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy) || 1;
      const edge = Math.min(1, len[i] / 70, (total - len[i]) / 70);
      const env = edge * edge * (3 - 2 * edge);
      const o = amp * env * Math.sin(len[i] / 22 + phase);
      return `${i ? "L" : "M"} ${(p.x - (dy / m) * o).toFixed(1)} ${(p.y + (dx / m) * o).toFixed(1)}`;
    })
    .join(" ");
};

const STRANDS = [
  { phase: 0, mix: "white 0%" },
  { phase: (2 * Math.PI) / 3, mix: "white 45%" },
  { phase: (4 * Math.PI) / 3, mix: "black 35%" },
];
const mix = (c: string, i: number) => (i === 0 ? c : `color-mix(in srgb, ${c}, ${STRANDS[i].mix})`);

/* ───────────── types ───────────── */
type Item = { id: string; start: number; end?: number; status: string };
type Row = Item & { color: string; kind: Kind };
type Lbl = { x: number; ty: number; text: string };
type Br = Row & {
  x1: number; x2: number; xm: number; y: number; T: number; ex: number; ey: number;
  pillar: boolean; merge: boolean; lv: number; amp: number; e0: number; e1: number; labels: Lbl[];
};
type Base = {
  sorted: Row[]; min: number; last: number; now: number;
  cs: (t: number) => number; ticks: { t: number; label: string }[]; open: number;
};

const session: { range?: Range; zoom: number; fit: boolean } = { zoom: 1, fit: false };

const latestYear = (games: Game[]): Range => {
  const now = Date.now();
  const dates = games
    .filter((g) => g.status === "Completed" || g.status === "Playing")
    .flatMap((g) => {
      const s = Date.parse(g.startedAt ?? "");
      if (Number.isNaN(s)) return [];
      const f = Date.parse(g.finishedAt ?? "");
      return [s, Number.isNaN(f) ? (g.status === "Playing" ? now : s) : f];
    });
  return dates.length ? new Date(Math.max(...dates)).getUTCFullYear() : "all";
};

/* ───────────── lazy, cached geometry (only for branches that get drawn) ───────────── */
type Geo = { pts: P[]; glow?: string; s: (string | undefined)[] };
const geoCache = new Map<string, Geo>();
const geoKey = (b: Br) => `${b.pillar ? "p" : "r"}${b.merge ? "m" : "o"}|${b.x1}|${b.x2}|${b.xm}|${b.T}|${b.y}|${b.amp}`;
const geo = (b: Br): Geo => {
  const k = geoKey(b);
  let g = geoCache.get(k);
  if (g) { geoCache.delete(k); geoCache.set(k, g); return g; } // mark as recently used
  g = {
    pts: b.pillar ? line({ x: b.xm, y: b.T }, { x: b.xm, y: b.y }) : route(b.x1, b.x2, b.T, b.y, b.merge),
    s: [],
  };
  geoCache.set(k, g);
  if (geoCache.size > 800) geoCache.delete(geoCache.keys().next().value as string); // bounded
  return g;
};
const glowOf = (b: Br) => {
  const g = geo(b);
  return (g.glow ??= g.pts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "));
};
const strandOf = (b: Br, i: number) => {
  const g = geo(b);
  return (g.s[i] ??= strand(g.pts, STRANDS[i].phase, b.amp));
};

/* ───────────── hover store (no React re-render of the whole view) ───────────── */
type Store = { get: () => string | undefined; hover: (id?: string) => void; sub: (f: () => void) => () => void };
const makeStore = (): Store => {
  let v: string | undefined;
  const subs = new Set<() => void>();
  return {
    get: () => v,
    hover: (id) => { if (id === v) return; v = id; subs.forEach((f) => f()); },
    sub: (f) => { subs.add(f); return () => { subs.delete(f); }; },
  };
};

/* ───────────── memoized pieces ───────────── */
const Branch = memo(function Branch({ b, lod }: { b: Br; lod: boolean }) {
  const c = b.color;
  const n = lod ? 1 : STRANDS.length;
  const ex = b.pillar ? b.xm : b.ex;
  const ey = b.pillar ? b.T : b.ey;
  const er = b.pillar || b.merge ? 7 : 6;
  return (
    <g>
      <path className="jn-glow" stroke={c} d={glowOf(b)} />
      {Array.from({ length: n }, (_, i) => (
        <path key={i} className="jn-strand" style={{ stroke: mix(c, i) }} d={strandOf(b, i)} />
      ))}
      {!b.pillar && (
        <>
          <circle className="jn-halo" cx={b.x1} cy={b.T} r={11} fill={c} />
          <circle className="jn-dot" cx={b.x1} cy={b.T} r={5} fill={c} />
        </>
      )}
      <circle className={`jn-halo${b.kind === "active" ? " pulse" : ""}`} cx={ex} cy={ey} r={er + 6} fill={c} />
      <circle className="jn-dot" cx={ex} cy={ey} r={er} fill={b.merge ? "#fff" : c} />
      {!lod && b.labels.map((l, i) => (
        <text key={i} className="jn-pt" x={l.x} y={l.ty} textAnchor="middle">{l.text}</text>
      ))}
    </g>
  );
});

function NodeFace({ game, kind }: { game: Game; kind: Kind }) {
  const src = thumb(game.cover);
  return (
    <>
      <span className="jn-label top">
        <strong>{game.title}</strong>
        <small><i />
          {formatPlaytime(game.totalSeconds)}
          {" ‣ "}
          {STATUS_LABEL[kind]}</small>
      </span>
      <span className="jn-cover">
        {src && <img src={src} alt="" loading="lazy" decoding="async" draggable={false} />}
      </span>
    </>
  );
}

const Node = memo(function Node({
  b, game, lod, on, store, onPick, onOpen,
}: {
  b: Br; game: Game; lod: boolean; on: boolean; store: Store;
  onPick: (id?: string) => void; onOpen: (id: string) => void;
}) {
  return (
    <button
      className={`jn-node${lod ? " lod" : ""}${on ? " on" : ""}`}
      style={{ left: b.xm, top: b.y, ...cssVar(b.color) }}
      onMouseEnter={() => store.hover(b.id)}
      onMouseLeave={() => store.hover(undefined)}
      onClick={(e) => { e.stopPropagation(); onPick(b.id); }}
      onDoubleClick={() => onOpen(b.id)}
      title={lod ? `${game.title} · click for details, double-click to open` : "Click for details · double-click to open"}
    >
      {lod ? <span className="jn-pip" /> : <NodeFace game={game} kind={b.kind} />}
    </button>
  );
});

/** The hovered/selected game, redrawn at full detail on top of the dimmed base layer. */
function HoverLayer({
  map, games, pickId, store,
}: { map: Map<string, Br>; games: Map<string, Game>; pickId?: string; store: Store }) {
  const h = useSyncExternalStore(store.sub, store.get, store.get);
  const id = h ?? pickId;
  const b = id ? map.get(id) : undefined;
  const game = id ? games.get(id) : undefined;
  if (!b || !game) return null;
  return (
    <>
      <svg className="jn-svg"><Branch b={b} lod={false} /></svg>
      <div className="jn-node hot on" style={{ left: b.xm, top: b.y, ...cssVar(b.color) }}>
        <NodeFace game={game} kind={b.kind} />
      </div>
    </>
  );
}

/* ───────────── fit mode: virtualized rows, grid drawn once ───────────── */
const FitView = memo(function FitView({
  base, games, pickId, onPick, onOpen,
}: {
  base: Base; games: Map<string, Game>; pickId?: string;
  onPick: (id?: string) => void; onOpen: (id: string) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState({ first: 0, count: 14 });
  const calc = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    const first = Math.max(0, Math.floor(el.scrollTop / PITCH) - 4);
    const count = Math.ceil(el.clientHeight / PITCH) + 9;
    setWin((w) => (w.first === first && w.count === count ? w : { first, count }));
  }, []);
  useLayoutEffect(() => {
    calc();
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(calc);
    ro.observe(el);
    return () => ro.disconnect();
  }, [calc]);

  useLayoutEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; calc(); }, [base, calc]);

  const span = Math.max(base.last - base.min, DAY);
  const pct = (t: number) => clamp(((base.cs(t) - base.min) / span) * 100, 100);
  const rows = base.sorted.slice(win.first, win.first + win.count);
  const showToday = base.open > 0 && base.now >= base.min && base.now <= base.last;

  return (
    <div className="jn-ov" onClick={() => onPick(undefined)}>
      <div className="jn-ov-axis">
        <span className="jn-ov-count">{base.sorted.length} {base.sorted.length === 1 ? "game" : "games"}</span>
        <div className="jn-ov-ticks">
          {base.ticks.map((k) => <span key={k.t} style={{ left: `${pct(k.t)}%` }}>{k.label}</span>)}
        </div>
      </div>
      <div className="jn-ov-wrap">
        <div className="jn-ov-grid">
          <div className="jn-ov-gin">
            {base.ticks.map((k) => <i key={k.t} style={{ left: `${pct(k.t)}%` }} />)}
            {showToday && <i className="today" style={{ left: `${pct(base.now)}%` }} />}
          </div>
        </div>
        <div className="jn-ov-body" ref={bodyRef} onScroll={calc}>
          <div className="jn-ov-inner" style={{ height: base.sorted.length * PITCH }}>
            {rows.map((r, k) => {
              const game = games.get(r.id);
              if (!game) return null;
              const left = pct(r.start);
              const width = Math.max(1.5, pct(r.end ?? base.now) - left);
              const flip = left + width > 66;
              const dateStyle: CSSProperties = flip
                ? { right: `calc(${100 - left}% + 14px)` }
                : { left: `calc(${left + width}% + 14px)` };
              const src = thumb(game.cover);
              return (
                <div
                  key={r.id}
                  className={`jn-ov-row${pickId === r.id ? " on" : ""}`}
                  style={{ top: (win.first + k) * PITCH, height: ROW, ...cssVar(r.color) }}
                  onClick={(e) => { e.stopPropagation(); onPick(r.id); }}
                  onDoubleClick={() => onOpen(r.id)}
                  title="Click for details · double-click to open"
                >
                  <div className="jn-ov-name">
                    <span className="jn-ov-cover">
                      {src && <img src={src} alt="" loading="lazy" decoding="async" draggable={false} />}
                    </span>
                    <div>
                      <strong>{game.title}</strong>
                      <small>{formatPlaytime(game.totalSeconds)} · {STATUS_LABEL[r.kind]}</small>
                    </div>
                  </div>
                  <div className="jn-ov-track">
                    <div className={`jn-ov-bar${r.end ? "" : " open"}`} style={{ left: `${left}%`, width: `${width}%` }} />
                    <span className="jn-ov-date" style={dateStyle}>{fmt(r.start)} → {r.end ? fmt(r.end) : "Now"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

/* ───────────── component ───────────── */
export function JourneyView({
  games,
  openGame,
}: {
  games: Game[];
  openGame: (id: string) => void;
}) {
  const [range, setRange] = useState<Range>(() => session.range ?? latestYear(games));
  const [menu, setMenu] = useState(false);
  const [fit, setFit] = useState(session.fit);
  const [pickId, setPickId] = useState<string>();
  const [zoomInput, setZoomInput] = useState(() => String(Math.round(clampZoom(session.zoom) * 100)));
  const [lod, setLod] = useState(() => clampZoom(session.zoom) < LOD_Z);
  const [vis, setVis] = useState({ a: 0, b: 0 });
  // Progressive timeline rendering
  const BATCH_SIZE = 80;

  const [loadedFrom, setLoadedFrom] = useState(0);
  const loadedFromRef = useRef(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const spacerRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(clampZoom(session.zoom));
  const rangeRef = useRef(range);
  const fitRef = useRef(fit);
  const visRef = useRef(vis);
  const dragged = useRef(false);
  const pickRef = useRef(pickId);
  const propsRef = useRef({ openGame });
  const gamesRef = useRef(games);
  rangeRef.current = range;
  fitRef.current = fit;
  pickRef.current = pickId;
  propsRef.current = { openGame };
  gamesRef.current = games;

  const store = useMemo(makeStore, []);
  const gameById = useMemo(() => new Map(games.map((g) => [g.id, g])), [games]);
  const onPick = useCallback((id?: string) => setPickId(id), []);
  const onOpen = useCallback((id: string) => propsRef.current.openGame(id), []);


  // session-only: remembered in memory while the app is open, never saved to the database
  const queuePrefs = useCallback((_now = false) => {
    session.range = rangeRef.current;
    session.zoom = zoomRef.current;
    session.fit = fitRef.current;
  }, []);

  /* ── 8. stable layout: keyed on id, status, start, end only ── */
  const sig = useMemo(
    () =>
      games.flatMap((g) => {
        if (g.status !== "Completed" && g.status !== "Playing") return [];
        const s = Date.parse(g.startedAt ?? "");
        if (Number.isNaN(s)) return [];
        return [`${g.id}|${g.status}|${s}|${g.finishedAt ?? ""}`];
      }).join(";"),
    [games]
  );
  const all = useMemo<Item[]>(
    () =>
      gamesRef.current.flatMap((g) => {
        if (g.status !== "Completed" && g.status !== "Playing") return [];
        const start = Date.parse(g.startedAt ?? "");
        if (Number.isNaN(start)) return [];
        const end = g.finishedAt ? Date.parse(g.finishedAt) : NaN;
        return [{ id: g.id, status: g.status, start, end: Number.isNaN(end) ? undefined : end }];
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sig]
  );

  const years = useMemo(() => {
    if (!all.length) return [] as number[];
    const now = Date.now();
    const a = new Date(Math.min(...all.map((i) => i.start))).getUTCFullYear();
    const b = new Date(Math.max(...all.map((i) => i.end ?? now))).getUTCFullYear();
    return Array.from({ length: Math.max(1, b - a + 1) }, (_, i) => b - i);
  }, [all]);

  const win = useMemo(() => {
    if (range === "all") return null;
    const now = Date.now();
    if (range === "month") {
      const d = new Date();
      return {
        a: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1),
        b: Math.min(now, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1),
      };
    }
    return { a: Date.UTC(range, 0, 1), b: Math.min(now, Date.UTC(range + 1, 0, 1) - 1) };
  }, [range]);

  const items = useMemo(() => {
    if (!win) return all;
    const now = Date.now();
    return all.filter((i) => i.start <= win.b && (i.end ?? now) >= win.a);
  }, [all, win]);

  const base = useMemo<Base | null>(() => {
    if (!items.length) return null;
    const now = Date.now();
    const sorted: Row[] = [...items]
      .sort((a, b) => a.start - b.start)
      .map((r, idx) => ({
        ...r,
        color: PALETTE[idx % PALETTE.length],
        kind: (r.status === "Completed" ? "main" : "active") as Kind,
      }));
    const min = win ? win.a : sorted[0].start;
    const last = win ? win.b : Math.max(...sorted.map((r) => r.end ?? now));
    const cs = (t: number) => (win ? Math.min(win.b, Math.max(win.a, t)) : t);
    return { sorted, min, last, now, cs, ticks: makeTicks(min, last, range === "month"), open: sorted.filter((r) => !r.end).length };
  }, [items, win]);

  /* ── timeline layout (geometry is NOT built here, only positions) ── */
  const L = useMemo(() => {
    if (!base) return null;
    const { sorted, min, last, now, cs } = base;
    const ppd = range === "all" ? 4 : range === "month" ? 24 : 5;
    const xOf = (t: number) => X0 + ((cs(t) - min) / DAY) * ppd;
    const laneEnds: number[] = [];

    const raw = sorted.map((r) => {
      const x1 = xOf(r.start);
      const x2 = Math.max(x1, xOf(r.end ?? now));
      const pillar = x2 - x1 < SHORT;
      const xm = (x1 + x2) / 2;
      const o1 = Math.min(x1, xm - CARD_HALF);
      const o2 = Math.max(x2, xm + CARD_HALF);
      let lane = pillar ? 1 : 0;
      while (laneEnds[lane] !== undefined && laneEnds[lane] + 24 > o1) lane++;
      laneEnds[lane] = o2;
      return { ...r, x1, x2, xm, pillar, lv: level(lane), merge: !!r.end };
    });

    const ups = Math.max(0, ...raw.map((r) => -r.lv));
    const downs = Math.max(0, ...raw.map((r) => r.lv));
    const T = 150 + ups * GAP;
    const axisY = T + downs * GAP + 80;
    const endX = Math.max(xOf(last), ...raw.map((r) => r.x2));

    const branches: Br[] = raw.map((r) => {
      const y = T + r.lv * GAP;
      return {
        ...r, y, T,
        ex: r.x2,
        ey: r.merge ? T : y,
        amp: r.pillar ? 4 : r.lv === 0 ? 5 : 6,
        e0: Math.min(r.x1, r.xm - CARD_HALF) - 70,
        e1: Math.max(r.x2, r.xm + CARD_HALF) + 70,
        labels: [],
      };
    });

    // date labels: stack into tiers using each label's real width, attached to their branch
    type Pending = { b: Br; x: number; y: number; text: string };
    const rowsByY = new Map<number, Pending[]>();
    const add = (b: Br, x: number, y: number, text: string) => {
      const arr = rowsByY.get(y) ?? [];
      arr.push({ b, x, y, text });
      rowsByY.set(y, arr);
    };
    branches.forEach((b) => {
      if (b.pillar) {
        const same = b.end !== undefined && fmt(b.start) === fmt(b.end);
        add(b, b.xm, T, same ? fmt(b.start) : `${fmtShort(b.start)} → ${b.end ? fmt(b.end) : "Now"}`);
      } else {
        add(b, b.x1, T, fmt(b.start));
        add(b, b.ex, b.ey, b.end ? fmt(b.end) : "Now");
      }
    });
    rowsByY.forEach((arr) => {
      arr.sort((a, b) => a.x - b.x);
      const tiers: number[] = [];
      arr.forEach((l) => {
        const half = (l.text.length * 6.3) / 2;
        let t = tiers.findIndex((edge) => l.x - half >= edge + 8);
        if (t < 0) t = tiers.length;
        tiers[t] = l.x + half;
        l.b.labels.push({ x: l.x, ty: l.y - 18 - t * 14, text: l.text });
      });
    });

    return {
      branches,
      byId: new Map(branches.map((b) => [b.id, b])),
      T, axisY, endX,
      ticks: base.ticks.map((k) => ({ x: xOf(k.t), label: k.label })),
      width: endX + 260,
      height: axisY + 50,
    };
  }, [base, range]);
  const Lref = useRef(L);
  Lref.current = L;
  // Initially render the newest batch of games
  useLayoutEffect(() => {
    const total = L?.branches.length ?? 0;
    const start = Math.max(0, total - BATCH_SIZE);

    loadedFromRef.current = start;
    setLoadedFrom(start);
  }, [L]);

  /* ── 6. viewport layer: transform + culling window, updated imperatively ── */
  const sync = useCallback(() => {
    const el = scrollRef.current, w = worldRef.current;
    if (!el || !w) return;
    const z = zoomRef.current;
    w.style.transform = `translate3d(${-el.scrollLeft}px, ${TOP - el.scrollTop}px, 0) scale(${z})`;
    const step = Math.max(300, 300 / z);
    const left = el.scrollLeft / z, right = (el.scrollLeft + el.clientWidth) / z;
    // Load older games when approaching the oldest currently rendered branch
    const currentL = Lref.current;
    const firstLoaded = currentL?.branches[loadedFromRef.current];

    if (
      firstLoaded &&
      loadedFromRef.current > 0 &&
      left <= firstLoaded.e0 + step * 2
    ) {
      const nextStart = Math.max(0, loadedFromRef.current - BATCH_SIZE);

      loadedFromRef.current = nextStart;
      setLoadedFrom(nextStart);
    }
    const a = Math.floor((left - 2 * step) / step) * step;
    const b = Math.ceil((right + 2 * step) / step) * step;
    const v = visRef.current;
    if (v.a !== a || v.b !== b) { visRef.current = { a, b }; setVis({ a, b }); }
  }, []);

  const sizeSpacer = useCallback(() => {
    const el = scrollRef.current, sp = spacerRef.current, st = stickyRef.current, l = Lref.current;
    if (!el || !sp || !st || !l) return;
    const z = zoomRef.current;
    sp.style.width = `${Math.max(l.width * z, el.clientWidth)}px`;
    sp.style.height = `${Math.max(l.height * z + TOP, el.clientHeight)}px`;
    st.style.width = `${el.clientWidth}px`;
    st.style.height = `${el.clientHeight}px`;
  }, []);

  // start at the far right, vertically centred on the most recent node
  useLayoutEffect(() => {
    if (fit || !L) return;
    const el = scrollRef.current;
    if (!el) return;
    sizeSpacer();
    el.scrollLeft = el.scrollWidth;
    el.scrollTop = Math.max(0, L.T * zoomRef.current + TOP - el.clientHeight / 2);
    visRef.current = { a: NaN, b: NaN };
    sync();
    store.hover(undefined);
  }, [L, fit, sizeSpacer, sync, store]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { sizeSpacer(); sync(); });
    });
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [!!L, fit, sizeSpacer, sync]);

  // one container class dims the whole base layer; the focused game is redrawn on top
  useEffect(() => {
    const upd = () => worldRef.current?.classList.toggle("hov", (store.get() ?? pickRef.current) !== undefined);
    upd();
    return store.sub(upd);
  }, [store, pickId, L, fit]);

  /* ── zoom (ref-based, same-frame scroll fix) ── */
  const uiRaf = useRef(0);
  const uiTick = useCallback(() => {
    if (uiRaf.current) return;
    uiRaf.current = requestAnimationFrame(() => {
      uiRaf.current = 0;
      const z = zoomRef.current;
      setZoomInput(String(Math.round(z * 100)));
      setLod(z < LOD_Z);
    });
  }, []);
  const reraster = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const applyZoom = useCallback((next: number, clientX?: number) => {
    const z0 = zoomRef.current, z = clampZoom(next);
    if (z === z0) { uiTick(); return; }
    const el = scrollRef.current;
    zoomRef.current = z;
    if (el && Lref.current) {
      const off = clientX == null ? el.clientWidth / 2 : clientX - el.getBoundingClientRect().left;
      const wx = (el.scrollLeft + off) / z0;
      const wy = el.scrollTop / z0;
      sizeSpacer();
      el.scrollLeft = wx * z - off;
      el.scrollTop = wy * z;
      sync();
      // re-rasterise crisply once zooming settles
      if (reraster.current) clearTimeout(reraster.current);
      reraster.current = setTimeout(() => {
        const w = worldRef.current;
        if (!w) return;
        w.style.willChange = "auto";
        requestAnimationFrame(() => { w.style.willChange = "transform"; });
      }, 180);
    }
    uiTick();
    queuePrefs();
  }, [sizeSpacer, sync, uiTick, queuePrefs]);
  useEffect(() => () => { if (reraster.current) clearTimeout(reraster.current); cancelAnimationFrame(uiRaf.current); }, []);

  // preferences changed from outside (not by us)
  // eslint-disable-line react-hooks/exhaustive-deps

  /* ── smooth wheel, click-and-drag pan, ctrl+wheel zoom ── */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || fit) return;
    let tx = el.scrollLeft, ty = el.scrollTop, raf = 0, down = false, moved = false;
    let sx = 0, sy = 0, sl = 0, st = 0;
    let zRaf = 0, zNext = 0, zX = 0;

    const tick = () => {
      const dx = tx - el.scrollLeft, dy = ty - el.scrollTop;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) { raf = 0; return; }
      el.scrollLeft += dx * 0.18;
      el.scrollTop += dy * 0.18;
      sync();
      raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey) {
        zNext = (zRaf ? zNext : zoomRef.current) - e.deltaY * 0.001;
        zX = e.clientX;
        if (!zRaf) {
          zRaf = requestAnimationFrame(() => {
            zRaf = 0;
            cancelAnimationFrame(raf); raf = 0;
            applyZoom(zNext, zX);
            tx = el.scrollLeft; ty = el.scrollTop;
          });
        }
        return;
      }
      const maxX = el.scrollWidth - el.clientWidth, maxY = el.scrollHeight - el.clientHeight;
      const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 1.6;
      if (maxX > 0) tx = clamp(tx + d, maxX);
      else ty = clamp(ty + d, maxY);
      kick();
    };
    const onScroll = () => {
      sync();
      if (!raf && !down) { tx = el.scrollLeft; ty = el.scrollTop; }
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest(".jn-node")) return;
      down = true; moved = false;
      sx = e.clientX; sy = e.clientY; sl = el.scrollLeft; st = el.scrollTop;
    };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!moved && Math.hypot(dx, dy) > 4) {
        moved = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add("drag");
      }
      if (moved) {
        cancelAnimationFrame(raf); raf = 0;
        el.scrollLeft = sl - dx;
        el.scrollTop = st - dy;
        tx = el.scrollLeft; ty = el.scrollTop;
      }
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      down = false;
      if (moved) {
        dragged.current = true;
        setTimeout(() => (dragged.current = false), 0);
        el.releasePointerCapture?.(e.pointerId);
        el.classList.remove("drag");
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(zRaf);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [!!L, fit, applyZoom, sync]);

  const changeRange = (next: Range) => {
    setRange(next);
    rangeRef.current = next;
    queuePrefs(true);
  };
  const toggleFit = () => {
    const next = !fit;
    setFit(next);
    fitRef.current = next;
    queuePrefs(true);
  };

  /* ── 1. culling: only what overlaps the visible x-range (+ margin) ── */
  const vb = useMemo(
    () =>
      L
        ? L.branches.filter(
          (b, index) =>
            index >= loadedFrom &&
            b.e1 >= vis.a &&
            b.e0 <= vis.b
        )
        : [],
    [L, vis, loadedFrom]
  );
  const vt = useMemo(() => (L ? L.ticks.filter((k) => k.x >= vis.a - 60 && k.x <= vis.b + 60) : []), [L, vis]);

  const pickedGame = pickId ? gameById.get(pickId) : undefined;
  const pickedRow = pickId ? L?.byId.get(pickId) : undefined;

  return createPortal(
    <div className="jn-screen">
      <div className="jn-shade" />
      {menu && <div className="jn-dd-bg" onClick={() => setMenu(false)} />}

      <header className="jn-top">
        <div className="jn-title">
          <span className="jn-mark"><Route size={18} /></span>
          <div><h1>Game Journey</h1><p>Your gaming timeline, visualized</p></div>
        </div>
        <div className="jn-tools">
          <div className="jn-pills">
            <button className={range === "all" ? "on" : ""} onClick={() => { changeRange("all"); setMenu(false); }}>All Time</button>
            <div className="jn-dd">
              <button className={typeof range === "number" ? "on" : ""} onClick={() => setMenu(!menu)} disabled={!years.length}>
                {typeof range === "number" ? range : "Year"} <ChevronDown size={13} />
              </button>
              {menu && (
                <div className="jn-dd-menu">
                  {years.map((y) => (
                    <button key={y} className={range === y ? "on" : ""} onClick={() => { changeRange(y); setMenu(false); }}>{y}</button>
                  ))}
                </div>
              )}
            </div>
            <button className={range === "month" ? "on" : ""} onClick={() => { changeRange("month"); setMenu(false); }}>This Month</button>
          </div>
          <button className={`jn-fit${fit ? " on" : ""}`} onClick={toggleFit} title="See the whole journey in one screen">
            {fit ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {fit ? "Timeline" : "Fit all"}
          </button>
          {!fit && (
            <div className="jn-zoom">
              <button onClick={() => applyZoom(zoomRef.current - 0.1)} aria-label="Zoom out"><Minus size={14} /></button>
              <input
                type="number"
                min={10}
                max={240}
                step={10}
                value={zoomInput}
                onChange={(e) => setZoomInput(e.target.value)}
                onBlur={() => {
                  const value = Number(zoomInput);
                  if (Number.isFinite(value) && value > 0) applyZoom(value / 100);
                  else uiTick();
                }}
                aria-label="Timeline zoom percentage"
              />
              <span>%</span>
              <button onClick={() => applyZoom(zoomRef.current + 0.1)} aria-label="Zoom in"><Plus size={14} /></button>
            </div>
          )}
        </div>
      </header>

      {!L || !base ? (
        <div className="jn-empty">
          <CalendarDays size={30} />
          <h2>{range === "all" ? "Your journey is waiting" : "Nothing in this period"}</h2>
          <p>Games you are playing or have completed, with a start date, will appear here.</p>
        </div>
      ) : fit ? (
        <FitView base={base} games={gameById} pickId={pickId} onPick={onPick} onOpen={onOpen} />
      ) : (
        /* ───── Timeline: scroll container only supplies the scroll extent ───── */
        <div className="jn-scroll" ref={scrollRef}>
          <div className="jn-spacer" ref={spacerRef}>
            <div className="jn-sticky" ref={stickyRef} onClick={() => { if (!dragged.current) onPick(undefined); }}>
              <div className="jn-world" ref={worldRef}>
                <div className="jn-base">
                  <svg className="jn-svg">
                    {vt.map((k) => (
                      <g key={k.x}>
                        <line className="jn-year" x1={k.x} y1={100} x2={k.x} y2={L.axisY - 22} />
                        <text className="jn-year-label" x={k.x} y={L.axisY} textAnchor="middle">{k.label}</text>
                      </g>
                    ))}
                    {vis.b >= X0 && vis.a <= L.endX && (
                      <>
                        <path className="jn-trunk-glow" d={`M ${Math.max(X0, vis.a)} ${L.T} L ${Math.min(L.endX, vis.b)} ${L.T}`} />
                        <path className="jn-trunk" d={`M ${Math.max(X0, vis.a)} ${L.T} L ${Math.min(L.endX, vis.b)} ${L.T}`} />
                      </>
                    )}
                    {vb.map((b) => <Branch key={b.id} b={b} lod={lod} />)}
                  </svg>
                  {vb.map((b) => {
                    const game = gameById.get(b.id);
                    return game ? (
                      <Node key={b.id} b={b} game={game} lod={lod} on={pickId === b.id} store={store} onPick={onPick} onOpen={onOpen} />
                    ) : null;
                  })}
                </div>

                <div className="jn-hot">
                  <HoverLayer map={L.byId} games={gameById} pickId={pickId} store={store} />
                </div>

                <svg className="jn-svg jn-marks">
                  {vis.a <= X0 + 40 && (
                    <>
                      <circle cx={X0} cy={L.T} r={17} className="jn-start-ring" />
                      <circle cx={X0} cy={L.T} r={8} className="jn-start" />
                      <text className="jn-end-label" x={X0} y={L.T + 40} textAnchor="middle">START</text>
                    </>
                  )}
                  {vis.b >= L.endX - 40 && (
                    <rect className="jn-end" x={L.endX - 7} y={L.T - 7} width={14} height={14} transform={`rotate(45 ${L.endX} ${L.T})`} />
                  )}
                </svg>
              </div>
            </div>
          </div>
        </div>
      )}

      {pickedGame && pickedRow && (
        <aside className="jn-detail" style={cssVar(K[pickedRow.kind])}>
          <div className="jn-detail-head">
            <span className="jn-detail-cover" style={pickedGame.cover ? { backgroundImage: `url(${thumb(pickedGame.cover)})` } : undefined} />
            <div>
              <h2>{pickedGame.title}</h2>
              <p>{[pickedGame.genre, pickedGame.developer].filter(Boolean).join(" • ") || "Uncategorized"}</p>
              <span className="jn-chip">{STATUS_LABEL[pickedRow.kind]}</span>
            </div>
          </div>
          <ul>
            <li><Clock3 size={15} />{formatPlaytime(pickedGame.totalSeconds)}</li>
            <li><CalendarDays size={15} />{fmt(pickedRow.start)} – {pickedRow.end ? fmt(pickedRow.end) : "now"}</li>
            {pickedGame.platinumed && <li><Trophy size={15} /> Platinumed</li>}
          </ul>
          <button className="jn-open" onClick={() => onOpen(pickedGame.id)}>View Details <ArrowRight size={14} /></button>
        </aside>
      )}
    </div>,
    document.body
  );
}