import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { ChevronLeft, ChevronRight, Layers } from "lucide-react";
import type { Game } from "../domain/game";
import { formatPlaytime } from "../domain/game";
import { igdbSeriesCached, hasTauri } from "../data/igdb";
import { buildFranchise, groupByFranchise, seriesGamesFor, type FranchiseGroup, type FranchiseRow } from "../domain/franchise";
import { Empty, Header } from "../components/shared";
import { PALETTE, STRANDS, cssVar, line, mix, strand, thumb } from "./journey";
import "./franchises.css";

const STEP = 132;   // horizontal space per game
const PAD = 70;     // lead-in / lead-out of the ribbon
const H = 200;      // row height
const ROWH = 222;   // row pitch (200px card + 22px gap)
const MID = 118;    // ribbon centre line (middle of the cover)
const AMP = 15;
const OVER_ROWS = 2;   // rows rendered above/below the viewport
const OVER_SLOTS = 3;  // games rendered left/right of the viewport

const colorOf = (key: string) => {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

/* ───────────── session cache: survives leaving/re-entering the page, cleared only on app reload ───────────── */
type SeriesGames = ReturnType<typeof seriesGamesFor>;
type Creds = { clientId: string; clientSecret: string };
const session = {
  cred: "",
  series: new Map<string, SeriesGames>(), // franchise key -> slim list of its series games
  checked: new Set<string>(),              // franchise keys already resolved (even if IGDB has no series)
  inflight: new Set<string>(),
};
const listeners = new Set<() => void>();
const queue: { g: FranchiseGroup; creds: Creds }[] = [];
let running = 0;

async function load(g: FranchiseGroup, creds: Creds) {
  const ids = g.games.flatMap((x) => (x.igdbId ? [x.igdbId] : [])).slice(0, 3);
  for (const id of ids) {
    const data = await igdbSeriesCached(id, creds).catch(() => undefined);
    if (data?.collections.length) { session.series.set(g.key, seriesGamesFor(g, data)); return; }
  }
}
function pump() {
  while (running < 3 && queue.length) {
    const { g, creds } = queue.shift()!;
    running++;
    void load(g, creds).finally(() => {
      running--;
      session.inflight.delete(g.key);
      session.checked.add(g.key);
      listeners.forEach((f) => f());
      pump();
    });
  }
}
/** Load series only for the rows currently on screen; rows that scrolled away are dropped from the queue. */
function want(groups: FranchiseGroup[], creds: Creds) {
  if (session.cred !== creds.clientId) {
    session.cred = creds.clientId; session.series.clear(); session.checked.clear();
  }
  const keep = new Set(groups.map((g) => g.key));
  for (let i = queue.length - 1; i >= 0; i--)
    if (!keep.has(queue[i].g.key)) { session.inflight.delete(queue[i].g.key); queue.splice(i, 1); }
  for (const g of groups) {
    if (session.checked.has(g.key) || session.inflight.has(g.key)) continue;
    session.inflight.add(g.key);
    queue.push({ g, creds });
  }
  pump();
}

/* ───────────── ribbon: only the visible chunk is drawn; phase is continuous across chunks ───────────── */
type Rib = { glow: string; s: string[] };
const ribCache = new Map<string, Rib>();
const ribbon = (xa: number, w: number): Rib => {
  const k = `${xa}|${w}`;
  let r = ribCache.get(k);
  if (r) return r;
  const pts = line({ x: 0, y: MID }, { x: w, y: MID });
  r = {
    glow: pts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "),
    s: STRANDS.map((x) => strand(pts, x.phase + xa / 22, AMP)),
  };
  ribCache.set(k, r);
  if (ribCache.size > 120) ribCache.delete(ribCache.keys().next().value as string);
  return r;
};

const Ribbon = memo(function Ribbon({ n, a, b, lit, color }: { n: number; a: number; b: number; lit: number; color: string }) {
  const id = useId().replace(/:/g, "");
  const xa = a === 0 ? 0 : PAD + a * STEP;
  const xb = b >= n ? n * STEP + PAD * 2 : PAD + b * STEP;
  const w = xb - xa;
  const r = ribbon(xa, w);
  const x = (lit < 0 ? 0 : PAD + (lit + 1) * STEP) - xa; // everything after the last completed game is dimmed
  return (
    <svg className="fr-ribbon" style={{ left: xa }} width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1={x - 30} x2={x + 70} y1="0" y2="0">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity=".16" />
        </linearGradient>
        <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={H}>
          <rect width={w} height={H} fill={`url(#g${id})`} />
        </mask>
      </defs>
      <g mask={`url(#m${id})`}>
        <path className="jn-glow" stroke={color} d={r.glow} />
        {r.s.map((d, i) => <path key={i} className="jn-strand" style={{ stroke: mix(color, i) }} d={d} />)}
      </g>
    </svg>
  );
});

const year = (t?: number) => (t ? String(new Date(t * 1000).getUTCFullYear()) : "TBA");

/** Smooth horizontal scrolling: eases scrollLeft toward a target. Returns a stable `by(dx)`. */
function useSmoothX(ref: RefObject<HTMLDivElement | null>) {
  const st = useRef({ target: 0, raf: 0 });
  useEffect(() => () => cancelAnimationFrame(st.current.raf), []);
  return useCallback((dx: number) => {
    const el = ref.current;
    const s = st.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    if (!s.raf) s.target = el.scrollLeft;
    s.target = Math.max(0, Math.min(max, s.target + dx));
    if (s.raf) return;
    const step = () => {
      const d = s.target - el.scrollLeft;
      if (Math.abs(d) < 0.5) { el.scrollLeft = s.target; s.raf = 0; return; }
      let move = d * 0.16;
      if (Math.abs(move) < 1) move = Math.sign(d) * Math.min(1, Math.abs(d));
      el.scrollLeft += move;
      s.raf = requestAnimationFrame(step);
    };
    s.raf = requestAnimationFrame(step);
  }, [ref]);
}

const FranchiseRowView = memo(function FranchiseRowView({ row, ready, onOpen }: {
  row: FranchiseRow; ready: boolean; onOpen: (id: string) => void;
}) {
  const color = colorOf(row.key);
  const n = row.slots.length;
  const lit = row.slots.reduce((a, s, i) => (s.done ? i : a), -1);
  const scRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const [from, setFrom] = useState(0);
  const [vw, setVw] = useState(1200);
  const [edge, setEdge] = useState({ s: true, e: true }); // at start / at end
  const by = useSmoothX(scRef);   // <- swap in your useSmoothScroll here if its signature differs

  const measure = useCallback(() => {
    const el = scRef.current;
    if (!el) return;
    const s = el.scrollLeft <= 1;
    const e = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
    setEdge((p) => (p.s === s && p.e === e ? p : { s, e }));
  }, []);

  useLayoutEffect(() => {
    const el = scRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => { setVw(el.clientWidth || 1200); measure(); });
    ro.observe(el);
    // wheel over a row always scrolls that row sideways (never the page); the info panel and the gaps between cards scroll the page
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      const k = e.deltaMode === 1 ? 32 : 1;
      by((Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * k * 1.4);
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => { ro.disconnect(); el.removeEventListener("wheel", wheel); cancelAnimationFrame(raf.current); };
  }, [by, measure]);
  useEffect(measure, [ready, n, measure]);

  const onScroll = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const el = scRef.current;
      if (el) setFrom(Math.max(0, Math.floor((el.scrollLeft - PAD) / STEP) - OVER_SLOTS));
      measure();
    });
  };
  const a = Math.min(from, Math.max(0, n - 1));
  const b = Math.min(n, a + Math.ceil(vw / STEP) + OVER_SLOTS * 2 + 1);

  return (
    <section className="fr-row" style={cssVar(color)}>
      <div className="fr-info">
        <h2 title={row.name}>{row.name}</h2>
        {ready ? (
          <>
            <div className="fr-stat"><b>{row.done}</b><span>/ {row.total}</span><em>{row.pct}%</em></div>
            <div className="fr-bar"><i style={{ width: `${row.pct}%` }} /></div>
            <small>{row.seconds > 0 ? `${formatPlaytime(row.seconds)} played` : "Completed"}{!row.fromSeries && " · library"}</small>
          </>
        ) : (
          <small>Loading series…</small>
        )}
      </div>
      <div className="fr-view">
        <div className="fr-scroll" ref={scRef} onScroll={onScroll}>
          {ready && (
            <div className="fr-track" style={{ width: n * STEP + PAD * 2, height: H }}>
              <Ribbon n={n} a={a} b={b} lit={lit} color={color} />
              {row.slots.slice(a, b).map((s, k) => {
                const src = thumb(s.game?.cover ?? s.cover);
                const style: CSSProperties = { left: PAD + (a + k) * STEP, width: STEP };
                return (
                  <div key={s.key} className={`fr-slot${s.done ? " done" : ""}`} style={style}>
                    <span className="fr-name"><strong>{s.title}</strong><small>{year(s.releaseTs)}</small></span>
                    {s.done && s.game ? (
                      <button className="fr-cover" onClick={() => onOpen(s.game!.id)} title={`${s.game.title} · open`}>
                        {src && <img src={src} alt="" loading="lazy" decoding="async" draggable={false} />}
                      </button>
                    ) : (
                      <span className="fr-cover ghost" title={s.title}>?</span>
                    )}
                    <i className="fr-pip" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {ready && !edge.s && <button className="fr-arrow left" onClick={() => by(-STEP * 4)} aria-label="Scroll left"><ChevronLeft size={20} /></button>}
        {ready && !edge.e && <button className="fr-arrow right" onClick={() => by(STEP * 4)} aria-label="Scroll right"><ChevronRight size={20} /></button>}
      </div>
    </section>
  );
}, (x, y) => x.ready === y.ready && x.row.sig === y.row.sig && x.row.seconds === y.row.seconds && x.onOpen === y.onOpen);

const scrollParent = (el: HTMLElement | null): HTMLElement | Window => {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return window;
};

export function FranchiseView({ games, creds, openGame }: { games: Game[]; creds: Creds; openGame: (id: string) => void }) {
  const canLoad = hasTauri && !!creds.clientId && !!creds.clientSecret;
  const groups = useMemo(
    () => groupByFranchise(games)
      .map((g) => ({ g, n: g.games.filter((x) => x.status === "Completed").length }))
      .sort((p, q) => q.n - p.n || p.g.name.localeCompare(q.g.name))
      .map((x) => x.g),
    [games],
  );
  const completedGames = useMemo(() => games.filter((g) => g.status === "Completed" && g.franchises?.length).length, [games]);

  const openRef = useRef(openGame);
  openRef.current = openGame;
  const onOpen = useRef((id: string) => openRef.current(id)).current;

  /* vertical window */
  const listRef = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState({ first: 0, count: 8 });
  const [, bump] = useState(0);
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const sp = scrollParent(el);
    let raf = 0;
    const calc = () => {
      const base = sp === window ? 0 : (sp as HTMLElement).getBoundingClientRect().top;
      const vh = sp === window ? window.innerHeight : (sp as HTMLElement).clientHeight;
      const top = el.getBoundingClientRect().top - base;
      const first = Math.max(0, Math.floor(-top / ROWH) - OVER_ROWS);
      const count = Math.ceil(vh / ROWH) + OVER_ROWS * 2 + 1;
      setWin((w) => (w.first === first && w.count === count ? w : { first, count }));
    };
    const tick = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(calc); };
    calc();
    sp.addEventListener("scroll", tick, { passive: true });
    window.addEventListener("resize", tick);
    return () => { cancelAnimationFrame(raf); sp.removeEventListener("scroll", tick); window.removeEventListener("resize", tick); };
  }, [groups.length]);

  const visible = useMemo(() => groups.slice(win.first, win.first + win.count), [groups, win]);

  useEffect(() => {
    const f = () => bump((n) => n + 1);
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  useEffect(() => {
    if (canLoad) want(visible.filter((g) => g.games.some((x) => x.igdbId)), creds);
  }, [visible, canLoad, creds.clientId, creds.clientSecret]);

  return (
    <>
      <Header
        title="FRANCHISE" eyebrow=""
        action={
          <div className="fr-heading-meta">
            <span className="fr-chip">
              <small>{groups.length}</small> franchises
            </span>
            <span className="fr-chip">
              <strong>{completedGames}</strong> completed
            </span>
            {!canLoad && (
              <span className="fr-chip fr-chip--warn">
                Connect IGDB in Settings for full totals
              </span>
            )}
          </div>
        }
      />
      {groups.length === 0 && <Empty icon={<Layers size={30} />} title="No franchises yet" text="Complete a game that belongs to a franchise." />}
      <div className="fr-list" ref={listRef} style={{ height: groups.length * ROWH }}>
        {visible.map((g, k) => {
          const ready = !canLoad || !g.games.some((x) => x.igdbId) || session.checked.has(g.key);
          return (
            <div key={g.key} className="fr-slotwrap" style={{ top: (win.first + k) * ROWH }}>
              <FranchiseRowView row={buildFranchise(g, ready ? session.series.get(g.key) : undefined)} ready={ready} onOpen={onOpen} />
            </div>
          );
        })}
      </div>
    </>
  );
}