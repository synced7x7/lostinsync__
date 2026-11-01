import { useMemo, useState } from "react";
import { CalendarDays, Minus, Plus, Route, X } from "lucide-react";
import type { Game } from "../domain/game";
import { formatPlaytime } from "../domain/game";
import { formatDate, Header } from "../components/shared";
import "./journey.css";

type JourneyGame = {
  game: Game;
  start: number;
  end: number;
  lane: number;
  color: string;
  xStart: number;
  xEnd: number;
  xNode: number;
};

const COLORS = ["#9b8cff", "#6ea8ff", "#59d9da", "#f0c674", "#7ed89b", "#f58ab2", "#f49b65"];
const DAY = 86_400_000;
const MIN_RANGE = 30 * DAY;

function dayLabel(value: number, detailed = false) {
  return new Intl.DateTimeFormat(undefined, detailed ? { month: "short", day: "numeric" } : { year: "numeric" }).format(value);
}

function parseDate(value?: string) {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function JourneyView({ games, openGame }: { games: Game[]; openGame: (id: string) => void }) {
  const [zoom, setZoom] = useState(1);
  const [year, setYear] = useState("all");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [hoveredId, setHoveredId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();

  const datedGames = useMemo(() => games
    .map((game) => ({ game, start: parseDate(game.startedAt), end: parseDate(game.finishedAt) }))
    .filter((entry): entry is { game: Game; start: number; end: number | undefined } => entry.start !== undefined), [games]);

  const years = useMemo(() => Array.from(new Set(datedGames.map(({ start }) => new Date(start).getFullYear()))).sort((a, b) => b - a), [datedGames]);
  const filtered = useMemo(() => datedGames.filter(({ start, end }) => {
    const selectedYear = year === "all" || new Date(start).getFullYear() === Number(year) || (end !== undefined && new Date(end).getFullYear() === Number(year));
    const after = !rangeStart || start >= Date.parse(rangeStart);
    const before = !rangeEnd || start <= Date.parse(rangeEnd) + DAY - 1;
    return selectedYear && after && before;
  }), [datedGames, rangeEnd, rangeStart, year]);

  const layout = useMemo(() => {
    if (!filtered.length) return { games: [] as JourneyGame[], min: 0, max: 0, width: 0, lanes: 0 };
    const sorted = [...filtered].sort((a, b) => a.start - b.start || a.game.title.localeCompare(b.game.title));
    const min = Math.min(...sorted.map(({ start }) => start));
    const max = Math.max(Date.now(), ...sorted.map(({ end, start }) => end ?? start));
    const range = Math.max(MIN_RANGE, max - min);
    const width = Math.max(1300, Math.round((range / DAY) * 2.8 * zoom));
    const laneEnds: number[] = [];
    const entries = sorted.map(({ game, start, end }, index) => {
      const actualEnd = end ?? max;
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = actualEnd;
      const xStart = 100 + ((start - min) / range) * (width - 160);
      const xEnd = 100 + ((actualEnd - min) / range) * (width - 160);
      return {
        game,
        start,
        end: actualEnd,
        lane,
        color: COLORS[index % COLORS.length],
        xStart,
        xEnd,
        xNode: xStart + Math.max(0, xEnd - xStart) / 2,
      };
    });
    return { games: entries, min, max, width, lanes: Math.max(1, laneEnds.length) };
  }, [filtered, zoom]);

  const height = 270 + layout.lanes * 92;
  const selected = layout.games.find((entry) => entry.game.id === selectedId);
  const hovered = layout.games.find((entry) => entry.game.id === hoveredId);
  const focus = hovered ?? selected;
  const axisSteps = Math.max(4, Math.min(12, Math.round(layout.width / 220)));
  const step = layout.max > layout.min ? (layout.max - layout.min) / axisSteps : 0;
  const todayX = layout.max > layout.min && Date.now() >= layout.min && Date.now() <= layout.max
    ? 100 + ((Date.now() - layout.min) / (layout.max - layout.min)) * (layout.width - 160)
    : undefined;

  return (
    <>
      <Header eyebrow="CHRONOLOGICAL PLAY HISTORY" title="Game Journey" />
      <section className="journey-intro glass">
        <div>
          <span className="journey-mark"><Route size={19} /></span>
          <p className="eyebrow">YOUR GAMING CONSTELLATION</p>
          <h2>Every start, detour, and return.</h2>
          <p className="muted">Follow the paths your games made through time. Overlapping journeys branch out, then reconnect when they end.</p>
        </div>
        <div className="journey-controls">
          <label><span>Year</span><select value={year} onChange={(event) => setYear(event.target.value)}><option value="all">All time</option>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label><span>From</span><input type="date" value={rangeStart} onChange={(event) => setRangeStart(event.target.value)} /></label>
          <label><span>To</span><input type="date" value={rangeEnd} onChange={(event) => setRangeEnd(event.target.value)} /></label>
          <div className="journey-zoom"><button onClick={() => setZoom((value) => Math.max(.65, value - .2))} aria-label="Zoom out"><Minus size={15} /></button><strong>{Math.round(zoom * 100)}%</strong><button onClick={() => setZoom((value) => Math.min(2.4, value + .2))} aria-label="Zoom in"><Plus size={15} /></button></div>
        </div>
      </section>

      {!layout.games.length ? (
        <section className="journey-empty glass"><CalendarDays size={28} /><h2>Your journey is waiting</h2><p>Add start dates to games to see them flow through your history.</p></section>
      ) : (
        <section className="journey-board glass">
          <div className="journey-scroll">
            <div className="journey-canvas" style={{ width: layout.width, minHeight: height }}>
              <svg className="journey-svg" width={layout.width} height={height} aria-label="Interactive game journey graph">
                <path className="journey-main-path" d={`M 24 190 C ${layout.width * .25} 190, ${layout.width * .7} 190, ${layout.width - 24} 190`} />
                {step > 0 && Array.from({ length: axisSteps + 1 }, (_, index) => {
                  const date = layout.min + step * index;
                  const x = 100 + ((date - layout.min) / (layout.max - layout.min)) * (layout.width - 160);
                  return <g key={date}><line className="journey-grid-line" x1={x} y1={80} x2={x} y2={height - 44} /><text className="journey-axis-label" x={x} y={height - 18} textAnchor="middle">{dayLabel(date, zoom > 1.2)}</text></g>;
                })}
                {todayX !== undefined && <g><line className="journey-today-line" x1={todayX} y1={58} x2={todayX} y2={height - 44} /><text className="journey-today-label" x={todayX} y={48} textAnchor="middle">TODAY</text></g>}
                {layout.games.map((entry) => {
                  const y = 190 + entry.lane * 92;
                  const isActive = !entry.game.finishedAt;
                  const highlighted = !focus || focus.game.id === entry.game.id;
                  const branchPath = entry.lane === 0
                    ? `M ${entry.xStart} 190 C ${entry.xStart + 45} 190, ${entry.xEnd - 45} 190, ${entry.xEnd} 190`
                    : `M ${entry.xStart} 190 C ${entry.xStart + 35} 190, ${entry.xStart + 35} ${y}, ${entry.xNode} ${y} S ${entry.xEnd - 35} ${y}, ${entry.xEnd} ${isActive ? y : 190}`;
                  return <g key={entry.game.id} className={highlighted ? "" : "journey-dim"}><path className={`journey-branch${isActive ? " journey-branch-active" : ""}${entry.game.status === "Abandoned" ? " journey-branch-abandoned" : ""}`} stroke={entry.color} d={branchPath} /><circle className="journey-point" cx={entry.xStart} cy={190} r={5} fill={entry.color} /><circle className="journey-point" cx={entry.xEnd} cy={isActive ? y : 190} r={5} fill={entry.color} /></g>;
                })}
              </svg>
              {layout.games.map((entry) => {
                const y = 190 + entry.lane * 92;
                const highlighted = !focus || focus.game.id === entry.game.id;
                return <button key={entry.game.id} className={`journey-node${highlighted ? "" : " journey-dim"}`} style={{ left: entry.xNode, top: y }} onMouseEnter={() => setHoveredId(entry.game.id)} onMouseLeave={() => setHoveredId(undefined)} onFocus={() => setHoveredId(entry.game.id)} onBlur={() => setHoveredId(undefined)} onClick={() => setSelectedId(entry.game.id)} onDoubleClick={() => openGame(entry.game.id)} title="Click for details, double-click to open">
                  <span className="journey-cover" style={entry.game.cover ? { backgroundImage: `url(${entry.game.cover})` } : undefined} />
                  <span className="journey-node-copy"><strong>{entry.game.title}</strong><small>{formatDate(entry.game.startedAt!)} {entry.game.finishedAt ? `→ ${formatDate(entry.game.finishedAt)}` : "→ now"}</small></span>
                </button>;
              })}
            </div>
          </div>
          {focus && <aside className="journey-detail glass"><button className="journey-close" onClick={() => { setSelectedId(undefined); setHoveredId(undefined); }}><X size={15} /></button><div className="journey-detail-cover" style={focus.game.cover ? { backgroundImage: `url(${focus.game.cover})` } : undefined} /><div><p className="eyebrow">{focus.game.status}</p><h2>{focus.game.title}</h2><p className="muted">{focus.game.genre || "Uncategorized"} · {focus.game.platform}</p><dl><div><dt>Started</dt><dd>{formatDate(focus.game.startedAt!)}</dd></div><div><dt>Ended</dt><dd>{focus.game.finishedAt ? formatDate(focus.game.finishedAt) : "In progress"}</dd></div><div><dt>Playtime</dt><dd>{formatPlaytime(focus.game.totalSeconds)}</dd></div><div><dt>Mastery</dt><dd>{focus.game.mastery != null ? `${focus.game.mastery}%` : "—"}</dd></div></dl></div></aside>}
        </section>
      )}
    </>
  );
}
