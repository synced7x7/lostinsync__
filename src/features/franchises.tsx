import { memo, useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { Layers } from "lucide-react";
import type { Game } from "../domain/game";
import { formatPlaytime } from "../domain/game";
import { igdbSeriesCached, hasTauri, type SeriesData } from "../data/igdb";
import { buildFranchise, groupByFranchise, FRANCHISE_MIN_SLOTS, type FranchiseRow } from "../domain/franchise";
import { Empty, Header } from "../components/shared";
import { PALETTE, STRANDS, cssVar, line, mix, strand, thumb } from "./journey";
import "./franchises.css";

const STEP = 132;   // horizontal space per game
const PAD = 70;     // lead-in / lead-out of the ribbon
const H = 200;      // row height
const MID = 118;    // ribbon centre line (middle of the cover)
const AMP = 15;

const colorOf = (key: string) => {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

/* ribbon geometry depends only on slot count -> cached and shared by every row of that length */
type Rib = { glow: string; s: string[]; w: number };
const ribCache = new Map<number, Rib>();
const ribbon = (n: number): Rib => {
  let r = ribCache.get(n);
  if (r) return r;
  const w = n * STEP + PAD * 2;
  const pts = line({ x: 0, y: MID }, { x: w, y: MID });
  r = {
    w,
    glow: pts.map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "),
    s: STRANDS.map((x) => strand(pts, x.phase, AMP)),
  };
  ribCache.set(n, r);
  if (ribCache.size > 60) ribCache.delete(ribCache.keys().next().value as number);
  return r;
};

const Ribbon = memo(function Ribbon({ n, lit, color }: { n: number; lit: number; color: string }) {
  const id = useId().replace(/:/g, "");
  const r = ribbon(n);
  const x = lit < 0 ? 0 : PAD + (lit + 1) * STEP; // everything after the last completed game is dimmed
  return (
    <svg className="fr-ribbon" width={r.w} height={H} viewBox={`0 0 ${r.w} ${H}`} aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} gradientUnits="userSpaceOnUse" x1={x - 30} x2={x + 70} y1="0" y2="0">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#fff" stopOpacity=".16" />
        </linearGradient>
        <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width={r.w} height={H}>
          <rect width={r.w} height={H} fill={`url(#g${id})`} />
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

const FranchiseRowView = memo(function FranchiseRowView({ row, onOpen }: { row: FranchiseRow; onOpen: (id: string) => void }) {
  const color = colorOf(row.key);
  const lit = row.slots.reduce((a, s, i) => (s.done ? i : a), -1);
  return (
    <section className="fr-row" style={cssVar(color)}>
      <div className="fr-info">
        <h2>{row.name}</h2>
        <p className="fr-count"><b>{row.done}</b> / {row.total} Completed</p>
        <div className="fr-bar"><i style={{ width: `${row.pct}%` }} /></div>
        <small>{row.pct}%{row.seconds > 0 && ` · ${formatPlaytime(row.seconds)} played`}{!row.fromSeries && " · library only"}</small>
      </div>
      <div className="fr-scroll">
        <div className="fr-track" style={{ width: row.slots.length * STEP + PAD * 2, height: H }}>
          <Ribbon n={row.slots.length} lit={lit} color={color} />
          {row.slots.map((s, i) => {
            const src = thumb(s.game?.cover ?? s.cover);
            const style: CSSProperties = { left: PAD + i * STEP, width: STEP };
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
      </div>
    </section>
  );
}, (a, b) => a.row.sig === b.row.sig && a.row.seconds === b.row.seconds && a.onOpen === b.onOpen);

export function FranchiseView({ games, creds, openGame }: {
  games: Game[]; creds: { clientId: string; clientSecret: string }; openGame: (id: string) => void;
}) {
  const groups = useMemo(() => groupByFranchise(games), [games]);
  const openRef = useRef(openGame);
  openRef.current = openGame;
  const onOpen = useCallback((id: string) => openRef.current(id), []);
  const [series, setSeries] = useState<Map<string, SeriesData>>(() => new Map());
  const [pending, setPending] = useState(0);
  const canLoad = hasTauri && !!creds.clientId && !!creds.clientSecret;
  // refetch only when the set of franchises / igdb ids changes, not on every status edit
  const sig = useMemo(() => groups.map((g) => `${g.key}:${g.games.map((x) => x.igdbId ?? 0).join(".")}`).join("|"), [groups]);

  useEffect(() => {
    if (!canLoad) return;
    let dead = false;
    const queue = groups.filter((g) => g.games.some((x) => x.igdbId));
    setPending(queue.length);
    const worker = async () => {
      for (let g = queue.shift(); g && !dead; g = queue.shift()) {
        const ids = g.games.flatMap((x) => (x.igdbId ? [x.igdbId] : [])).slice(0, 3);
        for (const id of ids) {
          const data = await igdbSeriesCached(id, creds).catch(() => undefined);
          if (dead) return;
          if (data?.collections.length) { const key = g.key; setSeries((m) => new Map(m).set(key, data)); break; }
        }
        if (!dead) setPending((n) => Math.max(0, n - 1));
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    return () => { dead = true; };
  }, [sig, canLoad, creds.clientId, creds.clientSecret]);

  const rows = useMemo(
    () => groups.map((g) => buildFranchise(g, series.get(g.key)))
      .filter((r) => r.total >= FRANCHISE_MIN_SLOTS)
      .sort((a, b) => b.done - a.done || b.pct - a.pct || a.name.localeCompare(b.name)),
    [groups, series],
  );
  const done = rows.reduce((n, r) => n + r.done, 0);
  const total = rows.reduce((n, r) => n + r.total, 0);

  return (
    <>
      <Header eyebrow="FRANCHISES" title="Franchise Completion" />
      <p className="fr-sub">
        {rows.length} franchises · {done} / {total} games completed
        {pending > 0 && ` · loading series (${pending} left)`}
        {!canLoad && " · connect IGDB in Settings for full franchise totals"}
      </p>
      {rows.length === 0 && pending === 0 && <Empty icon={<Layers size={30} />} title="No franchises yet" text="Add IGDB-imported games that belong to a franchise." />}
      <div className="fr-list">
        {rows.map((r) => <FranchiseRowView key={r.key} row={r} onOpen={onOpen} />)}
      </div>
    </>
  );
}