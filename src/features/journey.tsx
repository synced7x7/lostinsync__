import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarDays, ChevronDown, Clock3, Maximize2, Minimize2, Minus, Plus, Route, Trophy } from "lucide-react";
import type { Game } from "../domain/game";
import { formatPlaytime } from "../domain/game";
import "./journey.css";

const BG_IMAGE = "/images/journey-bg.jpg"; // TODO: replace with your background image path

const DAY = 86_400_000;
const GAP = 150;      // vertical distance between branches
const X0 = 80;       // where the timeline starts
const SHORT = 140;     // branches narrower than this are drawn as a vertical "pillar"
const CARD_HALF = 90;  // horizontal space a game card + title needs on its lane


const K = { main: "#8f86ff", active: "#5be3a4" };
type Kind = keyof typeof K;
type Range = "all" | "month" | number; // number = a calendar year

const PALETTE = ["#6ea8ff", "#5be3a4", "#ff9a4d", "#c58bff", "#f0c674", "#ff7aa8", "#4fd8e8"];
const STATUS_LABEL: Record<Kind, string> = { main: "Completed", active: "In progress" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmt = (t: number) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(t);
const fmtShort = (t: number) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" }).format(t);

const level = (lane: number) => (lane === 0 ? 0 : lane % 2 ? -(lane + 1) / 2 : lane / 2);
const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));
const cssVar = (c: string) => ({ ["--c" as string]: c }) as CSSProperties;

/** axis ticks: years for long spans, months for medium, weeks for short */
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
    for (let t = min; t <= last; t += DAY) {
      out.push({ t, label: String(new Date(t).getUTCDate()) });
    }
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

type Item = { game: Game; start: number; end?: number };
type JourneyPreferences = { range: Range; zoom: number; fit: boolean };

/* ───────────── component ───────────── */
export function JourneyView({
  games,
  openGame,
  preferences,
  onPreferencesChange,
}: {
  games: Game[];
  openGame: (id: string) => void;
  preferences: JourneyPreferences;
  onPreferencesChange: (preferences: JourneyPreferences) => void;
}) {
  const [range, setRange] = useState<Range>(preferences.range);
  const [menu, setMenu] = useState(false);
  const [zoom, setZoom] = useState(() => Math.max(0.1, Math.min(2.4, preferences.zoom)));
  const [zoomInput, setZoomInput] = useState(() => String(Math.round(preferences.zoom * 100)));
  const [fit, setFit] = useState(preferences.fit);
  const [hoverId, setHoverId] = useState<string>();
  const [pickId, setPickId] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const keep = useRef<{ ratio: number; offset: number } | null>(null);

  useEffect(() => {
    setRange(preferences.range);
    setZoom(Math.max(0.1, Math.min(2.4, preferences.zoom)));
    setZoomInput(String(Math.round(preferences.zoom * 100)));
    setFit(preferences.fit);
  }, [preferences.range, preferences.zoom, preferences.fit]);

  // only completed + in-progress games that have a start date
  const all = useMemo<Item[]>(
    () =>
      games.flatMap((game) => {
        if (game.status !== "Completed" && game.status !== "Playing") return [];
        const start = Date.parse(game.startedAt ?? "");
        if (Number.isNaN(start)) return [];
        const end = game.finishedAt ? Date.parse(game.finishedAt) : NaN;
        return [{ game, start, end: Number.isNaN(end) ? undefined : end }];
      }),
    [games]
  );

  // dropdown years: earliest start -> latest completion (or this year if something is still open)
  const years = useMemo(() => {
    if (!all.length) return [] as number[];
    const now = Date.now();
    const a = new Date(Math.min(...all.map((i) => i.start))).getUTCFullYear();
    const b = new Date(Math.max(...all.map((i) => i.end ?? now))).getUTCFullYear();
    return Array.from({ length: Math.max(1, b - a + 1) }, (_, i) => b - i);
  }, [all]);

  // the visible time window for the chosen range
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

  // games that overlap the window
  const items = useMemo(() => {
    if (!win) return all;
    const now = Date.now();
    return all.filter((i) => i.start <= win.b && (i.end ?? now) >= win.a);
  }, [all, win]);

  const base = useMemo(() => {
    if (!items.length) return null;
    const now = Date.now();
    const sorted = [...items]
      .sort((a, b) => a.start - b.start)
      .map((r, idx) => ({
        ...r,
        color: PALETTE[idx % PALETTE.length],
        kind: (r.game.status === "Completed" ? "main" : "active") as Kind,
      }));
    const min = win ? win.a : sorted[0].start;
    const last = win ? win.b : Math.max(...sorted.map((r) => r.end ?? now));
    const cs = (t: number) => (win ? Math.min(win.b, Math.max(win.a, t)) : t);
    return { sorted, min, last, now, cs, ticks: makeTicks(min, last, range === "month"), open: sorted.filter((r) => !r.end).length };
  }, [items, win]);

  /* ── timeline layout ── */
  const L = useMemo(() => {
    if (!base) return null;
    const { sorted, min, last, now, cs } = base;
    const ppd = range === "all" ? 4 : range === "month" ? 24 : 5;
    const xOf = (t: number) => X0 + ((cs(t) - min) / DAY) * ppd; // one date -> x mapping for everything
    const laneEnds: number[] = [];

    const raw = sorted.map((r) => {
      const x1 = xOf(r.start);
      const x2 = Math.max(x1, xOf(r.end ?? now));
      const pillar = x2 - x1 < SHORT;
      const xm = (x1 + x2) / 2;
      const o1 = Math.min(x1, xm - CARD_HALF);
      const o2 = Math.max(x2, xm + CARD_HALF);
      let lane = pillar ? 1 : 0; // pillars never sit on the trunk
      while (laneEnds[lane] !== undefined && laneEnds[lane] + 24 > o1) lane++;
      laneEnds[lane] = o2;
      return { ...r, x1, x2, xm, pillar, lv: level(lane), merge: !!r.end };
    });

    const ups = Math.max(0, ...raw.map((r) => -r.lv));
    const downs = Math.max(0, ...raw.map((r) => r.lv));
    const T = 150 + ups * GAP;
    const axisY = T + downs * GAP + 80;
    const endX = Math.max(xOf(last), ...raw.map((r) => r.x2)); // END diamond sits exactly on the last date

    const branches = raw.map((r) => {
      const y = T + r.lv * GAP;
      const pts = r.pillar ? line({ x: r.xm, y: T }, { x: r.xm, y }) : route(r.x1, r.x2, T, y, r.merge);
      const amp = r.pillar ? 4 : r.lv === 0 ? 5 : 6;
      return {
        ...r, y,
        ex: r.x2,
        ey: r.merge ? T : y,
        glow: pts.map((p, i) => `${i ? "L" : "M"} ${p.x} ${p.y}`).join(" "),
        strands: STRANDS.map((s) => strand(pts, s.phase, amp)),
      };
    });

    // date labels: stack into tiers using each label's real width
    type Lbl = { id: string; x: number; y: number; text: string; ty: number };
    const rows = new Map<number, Lbl[]>();
    const add = (id: string, x: number, y: number, text: string) => {
      const arr = rows.get(y) ?? [];
      arr.push({ id, x, y, text, ty: 0 });
      rows.set(y, arr);
    };
    branches.forEach((b) => {
      if (b.pillar) {
        const same = b.end !== undefined && fmt(b.start) === fmt(b.end);
        add(b.game.id, b.xm, T, same ? fmt(b.start) : `${fmtShort(b.start)} → ${b.end ? fmt(b.end) : "Now"}`);
      } else {
        add(b.game.id, b.x1, T, fmt(b.start));
        add(b.game.id, b.ex, b.ey, b.end ? fmt(b.end) : "Now");
      }
    });
    const labels: Lbl[] = [];
    rows.forEach((arr) => {
      arr.sort((a, b) => a.x - b.x);
      const tiers: number[] = []; // right edge of the last label in each tier
      arr.forEach((l) => {
        const half = (l.text.length * 6.3) / 2;
        let t = tiers.findIndex((edge) => l.x - half >= edge + 8);
        if (t < 0) t = tiers.length;
        tiers[t] = l.x + half;
        l.ty = l.y - 18 - t * 14;
        labels.push(l);
      });
    });

    return {
      branches, labels, T, axisY, endX,
      ticks: base.ticks.map((k) => ({ x: xOf(k.t), label: k.label })),
      width: endX + 260,
      height: axisY + 50,
    };
  }, [base, range]);

  const scale = zoom;

  // start at the far right (most recent) whenever the timeline opens or the range changes
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    el.scrollTop = 0;
  }, [range, !!L, fit]);

  // keep the same centre when zooming
  const zoomTo = (next: number, clientX?: number) => {
    const el = scrollRef.current;
    if (el && el.scrollWidth) {
      const offset = clientX == null ? el.clientWidth / 2 : clientX - el.getBoundingClientRect().left;
      keep.current = { ratio: (el.scrollLeft + offset) / el.scrollWidth, offset };
    }
    const bounded = Math.max(0.1, Math.min(2.4, next));
    setZoom(bounded);
    setZoomInput(String(Math.round(bounded * 100)));
    onPreferencesChange({ range, zoom: bounded, fit });
  };
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || keep.current == null) return;
    el.scrollLeft = keep.current.ratio * el.scrollWidth - keep.current.offset;
    keep.current = null;
  }, [zoom]);

  // smooth wheel + click-and-drag panning
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let tx = el.scrollLeft, ty = el.scrollTop, raf = 0, down = false, moved = false;
    let sx = 0, sy = 0, sl = 0, st = 0;

    const tick = () => {
      const dx = tx - el.scrollLeft, dy = ty - el.scrollTop;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) { raf = 0; return; }
      el.scrollLeft += dx * 0.18;
      el.scrollTop += dy * 0.18;
      raf = requestAnimationFrame(tick);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey && !fit) {
        zoomTo(zoom - e.deltaY * 0.001, e.clientX);
        return;
      }
      const maxX = el.scrollWidth - el.clientWidth, maxY = el.scrollHeight - el.clientHeight;
      const d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 1.6;
      if (maxX > 0) tx = clamp(tx + d, maxX);
      else ty = clamp(ty + d, maxY);
      kick();
    };
    const onScroll = () => { if (!raf && !down) { tx = el.scrollLeft; ty = el.scrollTop; } };

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
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [!!L, fit, range, zoom]);

  const changeRange = (next: Range) => {
    setRange(next);
    onPreferencesChange({ range: next, zoom, fit });
  };

  const active = hoverId ?? pickId;
  const picked = base?.sorted.find((r) => r.game.id === pickId);

  /* overview helpers */
  const span = base ? Math.max(base.last - base.min, DAY) : 1;
  const pct = (t: number) => (base ? clamp(((base.cs(t) - base.min) / span) * 100, 100) : 0);

  return createPortal(
    <div className="jn-screen" style={{ backgroundImage: `url(${BG_IMAGE})` }}>
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
          <button className={`jn-fit${fit ? " on" : ""}`} onClick={() => {
            const next = !fit;
            setFit(next);
            onPreferencesChange({ range, zoom, fit: next });
          }} title="See the whole journey in one screen">
            {fit ? <Minimize2 size={14} /> : <Maximize2 size={14} />} {fit ? "Timeline" : "Fit all"}
          </button>
          {!fit && (
            <div className="jn-zoom">
              <button onClick={() => zoomTo(zoom - 0.1)} aria-label="Zoom out"><Minus size={14} /></button>
              <input
                type="number"
                min={10}
                max={240}
                step={10}
                value={zoomInput}
                onChange={(e) => setZoomInput(e.target.value)}
                onBlur={() => {
                  const value = Number(zoomInput);
                  zoomTo(Number.isFinite(value) ? value / 100 : zoom);
                }}
                aria-label="Timeline zoom percentage"
              />
              <span>%</span>
              <button onClick={() => zoomTo(zoom + 0.1)} aria-label="Zoom in"><Plus size={14} /></button>
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
        /* ───── Fit all: compact overview, one row per game ───── */
        <div className="jn-ov" onClick={() => setPickId(undefined)}>
          <div className="jn-ov-axis">
            <span className="jn-ov-count">{base.sorted.length} {base.sorted.length === 1 ? "game" : "games"}</span>
            <div className="jn-ov-ticks">
              {base.ticks.map((k) => (
                <span key={k.t} style={{ left: `${pct(k.t)}%` }}>{k.label}</span>
              ))}
            </div>
          </div>
          <div className="jn-ov-body">
            {base.sorted.map((r) => {
              const left = pct(r.start);
              const right = pct(r.end ?? base.now);
              const width = Math.max(1.5, right - left);
              const flip = left + width > 66;
              const dim = active && active !== r.game.id;
              const dateStyle: CSSProperties = flip
                ? { right: `calc(${100 - left}% + 14px)` }
                : { left: `calc(${left + width}% + 14px)` };
              return (
                <div
                  key={r.game.id}
                  className={`jn-ov-row${dim ? " dim" : ""}${pickId === r.game.id ? " on" : ""}`}
                  style={cssVar(r.color)}
                  onMouseEnter={() => setHoverId(r.game.id)}
                  onMouseLeave={() => setHoverId(undefined)}
                  onClick={(e) => { e.stopPropagation(); setPickId(r.game.id); }}
                  onDoubleClick={() => openGame(r.game.id)}
                  title="Click for details · double-click to open"
                >
                  <div className="jn-ov-name">
                    <span className="jn-ov-cover" style={r.game.cover ? { backgroundImage: `url(${r.game.cover})` } : undefined} />
                    <div>
                      <strong>{r.game.title}</strong>
                      <small>{formatPlaytime(r.game.totalSeconds)} · {STATUS_LABEL[r.kind]}</small>
                    </div>
                  </div>
                  <div className="jn-ov-track">
                    {base.ticks.map((k) => <i key={k.t} className="jn-ov-line" style={{ left: `${pct(k.t)}%` }} />)}
                    {base.open > 0 && base.now >= base.min && base.now <= base.last && (
                      <i className="jn-ov-today" style={{ left: `${pct(base.now)}%` }} />
                    )}
                    <div className={`jn-ov-bar${r.end ? "" : " open"}`} style={{ left: `${left}%`, width: `${width}%` }} />
                    <span className="jn-ov-date" style={dateStyle}>{fmt(r.start)} → {r.end ? fmt(r.end) : "Now"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* ───── Timeline ───── */
        <div className="jn-scroll" ref={scrollRef}>
          <div className="jn-stage" style={{ width: L.width * scale, height: L.height * scale }}>
            <div
              className="jn-canvas"
              style={{ width: L.width, height: L.height, transform: `scale(${scale})` }}
              onClick={() => { if (!dragged.current) setPickId(undefined); }}
            >
              <svg className="jn-svg" width={L.width} height={L.height}>
                {L.ticks.map((k, i) => (
                  <g key={i}>
                    <line className="jn-year" x1={k.x} y1={100} x2={k.x} y2={L.axisY - 22} />
                    <text className="jn-year-label" x={k.x} y={L.axisY} textAnchor="middle">{k.label}</text>
                  </g>
                ))}

                <path className="jn-trunk-glow" d={`M 80 ${L.T} L ${L.endX} ${L.T}`} />
                <path className="jn-trunk" d={`M 80 ${L.T} L ${L.endX} ${L.T}`} />

                {L.branches.map((r) => (
                  <g key={r.game.id} className={active && active !== r.game.id ? "dim" : ""}>
                    <path className="jn-glow" stroke={r.color} d={r.glow} />
                    {r.strands.map((d, i) => (
                      <path key={i} className="jn-strand" style={{ stroke: `color-mix(in srgb, ${r.color}, ${STRANDS[i].mix})` }} d={d} />
                    ))}
                    {r.pillar ? (
                      <circle
                        cx={r.xm} cy={L.T} r={7}
                        fill={r.merge ? "#fff" : r.color}
                        className={`jn-dot${r.kind === "active" ? " pulse" : ""}`}
                        style={{ color: r.color }}
                      />
                    ) : (
                      <>
                        <circle cx={r.x1} cy={L.T} r={5} fill={r.color} className="jn-dot" style={{ color: r.color }} />
                        <circle
                          cx={r.ex} cy={r.ey} r={r.merge ? 7 : 6}
                          fill={r.merge ? "#fff" : r.color}
                          className={`jn-dot${r.kind === "active" ? " pulse" : ""}`}
                          style={{ color: r.color }}
                        />
                      </>
                    )}
                  </g>
                ))}

                {L.labels.map((l, i) => (
                  <text key={i} className={`jn-pt${active && active !== l.id ? " dim" : ""}`} x={l.x} y={l.ty} textAnchor="middle">{l.text}</text>
                ))}

                <circle cx={80} cy={L.T} r={17} className="jn-start-ring" />
                <circle cx={80} cy={L.T} r={8} className="jn-start" />
                <text className="jn-end-label" x={80} y={L.T + 40} textAnchor="middle">START</text>                <rect className="jn-end" x={L.endX - 7} y={L.T - 7} width={14} height={14} transform={`rotate(45 ${L.endX} ${L.T})`} />
                <text className="jn-end-label" x={L.endX} y={L.T + 40} textAnchor="middle">
                  {base.open ? "TODAY" : "END"} · {fmt(base.open ? base.now : base.last)}
                </text>
              </svg>

              {L.branches.map((r) => {
                const dim = active && active !== r.game.id;
                return (
                  <button
                    key={r.game.id}
                    className={`jn-node${dim ? " dim" : ""}${pickId === r.game.id ? " on" : ""}`}
                    style={{ left: (r.x1 + r.x2) / 2, top: r.y, ...cssVar(r.color) }}
                    onMouseEnter={() => setHoverId(r.game.id)}
                    onMouseLeave={() => setHoverId(undefined)}
                    onClick={(e) => { e.stopPropagation(); setPickId(r.game.id); }}
                    onDoubleClick={() => openGame(r.game.id)}
                    title="Click for details · double-click to open"
                  >
                    <span className="jn-label top">
                      <strong>{r.game.title}</strong>
                      <small><i />{formatPlaytime(r.game.totalSeconds)} · {STATUS_LABEL[r.kind]}</small>
                    </span>
                    <span className="jn-cover" style={r.game.cover ? { backgroundImage: `url(${r.game.cover})` } : undefined} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {picked && (
        <aside className="jn-detail" style={cssVar(K[picked.kind])}>
          <div className="jn-detail-head">
            <span className="jn-detail-cover" style={picked.game.cover ? { backgroundImage: `url(${picked.game.cover})` } : undefined} />
            <div>
              <h2>{picked.game.title}</h2>
              <p>{[picked.game.genre, picked.game.developer].filter(Boolean).join(" • ") || "Uncategorized"}</p>
              <span className="jn-chip">{STATUS_LABEL[picked.kind]}</span>
            </div>
          </div>
          <ul>
            <li><Clock3 size={15} />{formatPlaytime(picked.game.totalSeconds)}</li>
            <li><CalendarDays size={15} />{fmt(picked.start)} – {picked.end ? fmt(picked.end) : "now"}</li>
            {picked.game.mastery != null && <li><Trophy size={15} />{picked.game.mastery}% mastery</li>}
          </ul>
          <button className="jn-open" onClick={() => openGame(picked.game.id)}>View Details <ArrowRight size={14} /></button>
        </aside>
      )}
    </div>,
    document.body
  );
}