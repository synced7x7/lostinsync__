import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarDays, Clock3, Minus, Plus, Route, Trophy } from "lucide-react";
import type { Game } from "../domain/game";
import { formatPlaytime } from "../domain/game";
import "./journey.css";

const BG_IMAGE = "/images/journey-bg.jpg"; // TODO: replace with your background image path

const DAY = 86_400_000;
const GAP = 190;   // vertical distance between branches
const X0 = 230;    // where the timeline starts
const MINW = 380;  // minimum branch length so cards never collide
const K = { main: "#8f86ff", side: "#f0c674", active: "#5be3a4", abandoned: "#ff6b86" };
type Kind = keyof typeof K;
type Range = "all" | "year" | "month";

const fmt = (t: number) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(t);
const kindOf = (g: Game): Kind =>
  g.status === "Abandoned" ? "abandoned"
  : g.finishedAt ? (g.status === "Completed" ? "main" : "side")
  : ["Retired", "Shelved", "On hold"].includes(g.status) ? "side" : "active";
const level = (lane: number) => (lane === 0 ? 0 : lane % 2 ? -(lane + 1) / 2 : lane / 2);
const STATUS_LABEL: Record<Kind, string> = { main: "Completed", side: "Side journey", active: "In progress", abandoned: "Abandoned" };

export function JourneyView({ games, openGame }: { games: Game[]; openGame: (id: string) => void }) {
  const [range, setRange] = useState<Range>("all");
  const [zoom, setZoom] = useState(1);
  const [hoverId, setHoverId] = useState<string>();
  const [pickId, setPickId] = useState<string>();
  const scrollRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const now = new Date();
    const hit = (t?: number) =>
      t !== undefined && new Date(t).getFullYear() === now.getFullYear() &&
      (range === "year" || new Date(t).getMonth() === now.getMonth());
    return games.flatMap((game) => {
      const start = Date.parse(game.startedAt ?? "");
      if (Number.isNaN(start)) return [];
      const end = game.finishedAt ? Date.parse(game.finishedAt) : undefined;
      if (range !== "all" && !hit(start) && !hit(end)) return [];
      return [{ game, start, end }];
    });
  }, [games, range]);

  const L = useMemo(() => {
    if (!items.length) return null;
    const sorted = [...items].sort((a, b) => a.start - b.start);
    const min = sorted[0].start, now = Date.now(), ppd = 4 * zoom;
    const laneEnds: number[] = [];
    const raw = sorted.map(({ game, start, end }) => {
      const x1 = X0 + ((start - min) / DAY) * ppd;
      const x2 = Math.max(X0 + (((end ?? now) - min) / DAY) * ppd, x1 + MINW);
      let lane = laneEnds.findIndex((e) => e + 70 <= x1);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = x2;
      const kind = kindOf(game);
      return { game, start, end, x1, x2, lv: level(lane), kind, merge: !!end && kind !== "abandoned" };
    });
    const ups = Math.max(0, ...raw.map((r) => -r.lv));
    const downs = Math.max(0, ...raw.map((r) => r.lv));
    const T = 220 + ups * GAP;
    const endX = Math.max(...raw.map((r) => r.x2)) + 150;
    const last = Math.max(...raw.map((r) => r.end ?? now));
    const years: { y: number; x: number }[] = [];
    for (let y = new Date(min).getUTCFullYear() + 1; Date.UTC(y, 0, 1) <= last; y++)
      years.push({ y, x: X0 + ((Date.UTC(y, 0, 1) - min) / DAY) * ppd });
    return {
      raw: raw.map((r) => ({ ...r, y: T + r.lv * GAP })),
      T, endX, last, years, min,
      width: endX + 260,
      height: T + downs * GAP + 220,
      open: raw.filter((r) => !r.end).length,
    };
  }, [items, zoom]);

  // vertical wheel -> horizontal scroll (only when nothing to scroll vertically)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      if (el.scrollHeight > el.clientHeight + 4 || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY * 2;
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, [L]);

  const active = hoverId ?? pickId;
  const picked = L?.raw.find((r) => r.game.id === pickId);

  const pathOf = (r: NonNullable<typeof L>["raw"][number], T: number) => {
    if (r.lv === 0) return `M ${r.x1} ${T} L ${r.x2} ${T}`;
    const c = 70;
    const head = `M ${r.x1} ${T} C ${r.x1 + c} ${T}, ${r.x1 + c} ${r.y}, ${r.x1 + 2 * c} ${r.y} L ${r.x2 - 2 * c} ${r.y}`;
    return head + (r.merge ? ` C ${r.x2 - c} ${r.y}, ${r.x2 - c} ${T}, ${r.x2} ${T}` : ` L ${r.x2} ${r.y}`);
  };

  return createPortal(
    <div className="jn-screen" style={{ backgroundImage: `url(${BG_IMAGE})` }}>
      <div className="jn-shade" />

      <header className="jn-top">
        <div className="jn-title">
          <span className="jn-mark"><Route size={20} /></span>
          <div><h1>Game Journey</h1><p>Your gaming timeline, visualized</p></div>
        </div>
        <div className="jn-tools">
          <div className="jn-pills">
            {([["all", "All Time"], ["year", "This Year"], ["month", "This Month"]] as const).map(([k, label]) => (
              <button key={k} className={range === k ? "on" : ""} onClick={() => setRange(k)}>{label}</button>
            ))}
          </div>
          <div className="jn-zoom">
            <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))} aria-label="Zoom out"><Minus size={14} /></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(2.4, z + 0.2))} aria-label="Zoom in"><Plus size={14} /></button>
          </div>
        </div>
      </header>

      {!L ? (
        <div className="jn-empty">
          <CalendarDays size={30} />
          <h2>Your journey is waiting</h2>
          <p>Add a start date to your games and they will flow through your history here.</p>
        </div>
      ) : (
        <div className="jn-scroll" ref={scrollRef}>
          <div className="jn-canvas" style={{ width: L.width, height: Math.max(L.height, 600) }} onClick={() => setPickId(undefined)}>
            <svg className="jn-svg" width={L.width} height={Math.max(L.height, 600)}>
              {L.years.map(({ y, x }) => (
                <g key={y}>
                  <line className="jn-year" x1={x} y1={110} x2={x} y2={L.height - 90} />
                  <text className="jn-year-label" x={x} y={L.height - 66} textAnchor="middle">{y}</text>
                </g>
              ))}
              <path className="jn-trunk-glow" d={`M 80 ${L.T} L ${L.endX} ${L.T}`} />
              <path className="jn-trunk" d={`M 80 ${L.T} L ${L.endX} ${L.T}`} />

              {L.raw.map((r) => {
                const d = pathOf(r, L.T);
                const c = K[r.kind];
                return (
                  <g key={r.game.id} className={active && active !== r.game.id ? "dim" : ""}>
                    <path className="jn-glow" stroke={c} d={d} />
                    <path className={`jn-line ${r.kind}`} stroke={c} d={d} />
                    <circle cx={r.x1} cy={L.T} r={5} fill={c} className="jn-dot" style={{ color: c }} />
                    <circle cx={r.x2} cy={r.merge ? L.T : r.y} r={r.merge ? 7 : 6} fill={r.merge ? "#fff" : c}
                      className={`jn-dot${r.kind === "active" ? " pulse" : ""}`} style={{ color: c }} />
                  </g>
                );
              })}

              <circle cx={80} cy={L.T} r={17} className="jn-start-ring" />
              <circle cx={80} cy={L.T} r={8} className="jn-start" />
              <text className="jn-end-label" x={80} y={L.T + 46} textAnchor="middle">START · {fmt(L.min)}</text>
              <rect className="jn-end" x={L.endX - 7} y={L.T - 7} width={14} height={14} transform={`rotate(45 ${L.endX} ${L.T})`} />
              <text className="jn-end-label" x={L.endX} y={L.T - 26} textAnchor="middle">
                {L.open ? "TODAY" : "END"} · {fmt(L.open ? Date.now() : L.last)}
              </text>
            </svg>

            {L.raw.map((r) => {
              const c = K[r.kind];
              const dim = active && active !== r.game.id;
              return (
                <button
                  key={r.game.id}
                  className={`jn-node${dim ? " dim" : ""}${pickId === r.game.id ? " on" : ""}`}
                  style={{ left: (r.x1 + r.x2) / 2, top: r.y, ["--c" as string]: c }}
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
                  <span className="jn-label bot">
                    <em>{fmt(r.start)}</em><b>→</b><em>{r.end ? fmt(r.end) : "now"}</em>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {picked && (
        <aside className="jn-detail" style={{ ["--c" as string]: K[picked.kind] }}>
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

      <div className="jn-legend">
        <span><i style={{ background: K.main }} />Main Journey</span>
        <span><i style={{ background: K.side }} />Side Journey</span>
        <span><i style={{ background: K.active }} />In Progress</span>
        <span><i style={{ background: K.abandoned }} />Abandoned</span>
      </div>
    </div>,
    document.body
  );
}