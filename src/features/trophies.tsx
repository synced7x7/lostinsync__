import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Lock, Trophy as TrophyIcon, X } from "lucide-react";
import type { AppData } from "../domain/game";
import { evaluate, RARITY_LABEL, type Override, type Tier, type TrophyState } from "../domain/trophies";
import "./trophies.css";

// badges: src/images/badges/*  |  backgrounds: src/images/trophy-bg/*  (4 files, page order = natural filename order, e.g. 1.png … 4.png)
const FILES = import.meta.glob("../images/badges/*.{png,webp,jpg}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const BGS = Object.entries(
  import.meta.glob("../images/trophy-bg/*.{png,webp,jpg}", { eager: true, query: "?url", import: "default" }) as Record<string, string>,
).sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true })).map(([, url]) => url);

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const LIST = Object.entries(FILES).map(([p, url]) => {
  const f = p.split("/").pop()!.replace(/\.\w+$/, "");
  const m = f.match(/^(\d+\.\d+)\s+(.*)$/);
  return { num: m?.[1], name: norm(m?.[2] ?? f), url };
});
const artOf = (t: Tier) => (LIST.find((f) => f.name === norm(t.name)) ?? LIST.find((f) => f.num === t.num))?.url;

// ===================== TWEAK EVERY BADGE HERE =====================
// page = 0..3 (background index) | x / y = centre in % of the background image | w = badge width in % of image width
type Pos = { x: number; y: number; w: number };
type Place = Pos & { page: number };
const BASE: Pos[] = [
  { x: 50, y: 30.3, w: 14.4 },
  { x: 17.5, y: 68.5, w: 12.2 }, { x: 34.7, y: 68.5, w: 12 }, { x: 50.4, y: 68.5, w: 12.2 },
  { x: 65.8, y: 68.5, w: 12 }, { x: 82.5, y: 68.5, w: 12.2 },
];
const P = (page: number, i: number): Place => ({ page, ...BASE[i] }); // starting point only; overwrite with literals, e.g. { page: 0, x: 51.2, y: 29.8, w: 15 }
const PLACE: Record<string, Place> = {
  // ---- page 1 ----
  devfav: P(0, 0),      // Developer's Choice (lostinsync__)
  annual: P(0, 1),      // Annual Legends
  retro: P(0, 2),       // Time Traveler (pre-2000)
  "4.1": P(0, 3),       // Requiescat in Pace
  "4.2": P(0, 4),       // Leave me alone
  "4.3": P(0, 5),       // Biohazard
  // ---- page 2 ----
  career: P(1, 0),      // Gaming Career (lostinsync__)
  "4.4": P(1, 1),       // Symphony of the Night
  "4.5": P(1, 2),       // Blacklist #1
  "4.6": P(1, 3),       // The fallen leaves tell a story
  genre: P(1, 4),       // Genre Master
  hours: P(1, 5),       // One Game, One Obsession
  // ---- page 3 ----
  "9.4": P(2, 0),       // GOTY Slayer (lostinsync__)
  span: P(2, 1),        // Wandering Nomad
  complete: P(2, 2),    // Completionist
  "8.1": P(2, 3),       // Arcade Roots
  "8.2": P(2, 4),       // Classic Era
  "8.3": P(2, 5),       // 2000s Veteran
  // ---- page 4 ----
  final: P(3, 0),       // lostinsync__
  "8.4": P(3, 1),       // HD Generation
  "8.5": P(3, 2),       // Modern Era
  "9.1": P(3, 3),       // Relic of the Ancients
  "9.2": P(3, 4),       // Vanguard Rusher
  "9.3": P(3, 5),       // Bleeding Edge
};
// ==================================================================

const PAGES = 4;
const CHEAT_KEY = "lis.trophy.cheat";

function Art({ tier }: { tier: Tier }) {
  const src = artOf(tier);
  return src ? <img src={src} alt="" draggable={false} /> : <TrophyIcon className="tr-ph" size={44} />;
}

function BadgeSlot({ s, pos, onClick }: { s?: TrophyState; pos: Pos; onClick: () => void }) {
  if (!s) return null;
  return (
    <button
      className={`tr-slot ${s.top ? `on glow-${s.top.rarity}` : "off"}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: `${pos.w}%` }}
      onClick={onClick}
      aria-label={s.top ? s.top.name : "Locked trophy"}
    >
      {s.top && <Art tier={s.top} />}
    </button>
  );
}

function Panel({ s, onClose }: { s: TrophyState; onClose: () => void }) {
  const got = s.tiers.filter((t) => t.unlocked);
  const path = [...new Set(got.map((t) => RARITY_LABEL[t.rarity]))];
  return (
    <aside className={`tr-panel glass ${s.top ? `r-${s.top.rarity}` : ""}`}>
      <button className="icon-btn tr-x" onClick={onClose}><X size={16} /></button>
      {!s.top ? (
        <>
          <h3>{s.tiers[0].name}</h3>
          <p className="muted"><Lock size={12} /> Locked</p>
        </>
      ) : (
        <>
          {path.length > 1 && <p className="tr-path">{path.join(" → ")}</p>}
          {[...got].reverse().map((t) => (
            <div className="tr-tier" key={t.id}>
              <span className="tr-thumb"><Art tier={t} /></span>
              <div>
                <strong>{t.name}</strong>
                <em className={`rar r-${t.rarity}`}>{RARITY_LABEL[t.rarity]}</em>
                <p>{t.desc}</p>
              </div>
            </div>
          ))}
        </>
      )}
    </aside>
  );
}

// ===================== CHEAT PANEL (bottom-left, type "iddqd" on the Trophies tab) =====================
function Dev({ states, cheat, setCheat }: { states: TrophyState[]; cheat: Override; setCheat: (c: Override) => void }) {
  const tiers = states.flatMap((s) => s.tiers);
  const cycle = (id: string) => {
    const n = { ...cheat };
    if (n[id] === undefined) n[id] = true; else if (n[id]) n[id] = false; else delete n[id];
    setCheat(n);
  };
  return (
    <div className="tr-dev glass">
      <div className="tr-dev-bar">
        <strong>Cheats</strong>
        <button onClick={() => setCheat(Object.fromEntries(tiers.map((t) => [t.id, true])))}>All on</button>
        <button onClick={() => setCheat(Object.fromEntries(tiers.map((t) => [t.id, false])))}>All off</button>
        <button onClick={() => setCheat({})}>Reset</button>
      </div>
      {tiers.map((t) => (
        <button key={t.id} className={`tr-dev-row ${t.unlocked ? "on" : ""}`} onClick={() => cycle(t.id)}>
          <span>{t.num} {t.name}</span>
          <em>{cheat[t.id] === undefined ? "AUTO" : cheat[t.id] ? "ON" : "OFF"}</em>
        </button>
      ))}
    </div>
  );
}

export function TrophiesView({ data }: { data: AppData }) {
  const [cheat, setCheat] = useState<Override>(() => { try { return JSON.parse(localStorage.getItem(CHEAT_KEY) ?? "{}"); } catch { return {}; } });
  const [dev, setDev] = useState(false);
  const [sel, setSel] = useState<string>();
  const [page, setPage] = useState(0);

  useEffect(() => { try { localStorage.setItem(CHEAT_KEY, JSON.stringify(cheat)); } catch { /* ignore */ } }, [cheat]);
  useEffect(() => {
    let buf = "";
    const on = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
      buf = (buf + e.key).slice(-5).toLowerCase();
      if (buf === "iddqd") { setDev((d) => !d); buf = ""; }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  const go = (d: number) => { setSel(undefined); setPage((p) => Math.min(PAGES - 1, Math.max(0, p + d))); };

  const states = useMemo(() => evaluate(data.games, cheat), [data.games, cheat]);
  const items = states.filter((s) => PLACE[s.trophy.id]?.page === page);
  const selected = states.find((s) => s.trophy.id === sel);

  return createPortal(
    <div className="tr-stage">
      <div className="tr-canvas">
        <img className="tr-bg" src={BGS[page]} alt="" draggable={false} />
        {items.map((s) => <BadgeSlot key={s.trophy.id} s={s} pos={PLACE[s.trophy.id]} onClick={() => setSel(s.trophy.id)} />)}
      </div>
      <div className="tr-nav">
        <button className="icon-btn" disabled={page === 0} onClick={() => go(-1)}><ChevronLeft size={18} /></button>
        {Array.from({ length: PAGES }, (_, i) => (
          <i key={i} className={i === page ? "on" : ""} onClick={() => { setSel(undefined); setPage(i); }} style={{ "--i": i } as CSSProperties} />
        ))}
        <button className="icon-btn" disabled={page === PAGES - 1} onClick={() => go(1)}><ChevronRight size={18} /></button>
      </div>
      {selected && <Panel s={selected} onClose={() => setSel(undefined)} />}
      {dev && <Dev states={states} cheat={cheat} setCheat={setCheat} />}
    </div>,
    document.body,
  );
}