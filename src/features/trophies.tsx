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
// page = 0..3 (background) | x / y = centre in % of the background image
// w = slot (click area) width in % of image width | z = zoom of the badge art inside its slot (1 = fit, 1.2 = 20% bigger)
type Pos = { x: number; y: number; w: number; z: number; ar?: number }; // ar = width / height of the slot (default 1). e.g. ar: 0.8 = taller than wide
type Place = Pos & { page: number };
const PLACE: Record<string, Place> = {
  // ---- page 1 ----
  "4.8": { page: 0, x: 50, y: 25.6, w: 24, z: 1 }, // Pantheon of Worlds (lostinsync__)
  "4.1": { page: 0, x: 17, y: 68.5, w: 16, z: 1 }, // Requiescat in Pace
  "4.2": { page: 0, x: 34.55, y: 68.5, w: 16, z: 1 }, // Leave me alone
  "4.3": { page: 0, x: 49.85, y: 68.5, w: 16, z: 1 }, // Biohazard
  "4.4": { page: 0, x: 65.43, y: 68.5, w: 16, z: 1 }, // Symphony of the Night
  "4.5": { page: 0, x: 82.66, y: 68.5, w: 16, z: 1 }, // Blacklist #1
  // ---- page 2 ----
  devfav: { page: 1, x: 50, y: 27, w: 21.5, z: 1, ar: 0.9 }, // Synced X chain (lostinsync__)
  "4.6": { page: 1, x: 17.4, y: 69.1, w: 16, z: 1 }, // The fallen leaves tell a story
  "4.7": { page: 1, x: 34.66, y: 69.1, w: 16, z: 1 }, // Consider it done
  hours: { page: 1, x: 50.28, y: 68, w: 16, z: 1 }, // Dedicated Soul chain
  annual: { page: 1, x: 65.7, y: 69.1, w: 16, z: 1 }, // Gaming Phenomenon chain
  retro: { page: 1, x: 82.8, y: 69.1, w: 16, z: 1 }, // Keeper of History chain
  // ---- page 3 ----
  "9.4": { page: 2, x: 50, y: 27, w: 24, z: 1 }, // GOTY Slayer (lostinsync__)
  "8.1": { page: 2, x: 17.3, y: 68.5, w: 17, z: 1 }, // Arcade Roots
  "8.2": { page: 2, x: 34.5, y: 68.5, w: 17, z: 1 }, // Classic Era
  "8.3": { page: 2, x: 49.95, y: 66.8, w: 17, z: 1 }, // 2000s Veteran
  "8.4": { page: 2, x: 65.25, y: 68.2, w: 17, z: 1 }, // HD Generation
  "8.5": { page: 2, x: 82.2, y: 67.6, w: 17, z: 1 }, // Modern Era
  // ---- page 4 ----
  career: { page: 3, x: 50, y: 26, w: 24, z: 1 }, // Immortal chain (lostinsync__)
  "5.1": { page: 3, x: 17.4, y: 67.8, w: 16, z: 1 }, // Action Specialist
  "5.2": { page: 3, x: 34.8, y: 67.8, w: 16, z: 1 }, // RPG Veteran
  "5.3": { page: 3, x: 50.02, y: 67.8, w: 16, z: 1 }, // Adventure Seeker
  "5.4": { page: 3, x: 65.5, y: 67.8, w: 16, z: 1 }, // Strategy Master
  "5.5": { page: 3, x: 82.6, y: 68.1, w: 17, z: 1, ar: 1.1 }, // One-Man Army
  // ---- page 5 ----
  final: { page: 4, x: 50, y: 23, w: 25, z: 1 }, // Achievement Hunter chain (lostinsync__)
  span: { page: 4, x: 17.6, y: 68.1, w: 16, z: 1 }, // Wandering Nomad chain
  complete: { page: 4, x: 34.54, y: 69, w: 17, z: 1 }, // Completionist chain
  "9.1": { page: 4, x: 50, y: 68.2, w: 16, z: 1 }, // Relic of the Ancients
  "9.2": { page: 4, x: 65.4, y: 68.5, w: 17, z: 1 }, // Vanguard Rusher
  "9.3": { page: 4, x: 82.7, y: 68.5, w: 17, z: 1 }, // Bleeding Edge
};

// ===================== PAGE TITLES (order = background order 1..5) =====================
// c = title colour, g = glow colour (r,g,b) — matched to each background's palette
const TITLES = [
  { name: "Pantheon of Sagas", c: "#9ec0ff", g: "80,120,255" },  // 1 neon indigo
  { name: "Hall of Dedication", c: "#ff9aa8", g: "255,60,90" },   // 2 crimson moon
  { name: "Golden Timeline", c: "#ffd88a", g: "255,170,50" },  // 3 amber moon
  { name: "Hall of Immortals", c: "#d9b3ff", g: "160,80,255" },  // 4 violet moon
  { name: "the Grim Reaper", c: "#ffa3df", g: "255,50,150" },  // 5 crimson cathedral / eclipse
];
// ==================================================================

const PAGES = 5;
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
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: `${pos.w}%`, aspectRatio: pos.ar ?? 1, "--z": pos.z } as CSSProperties} onClick={onClick}
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
        <img className="tr-bg" src={BGS[page] ?? BGS[page % BGS.length]} alt="" draggable={false} />
        {items.map((s) => <BadgeSlot key={s.trophy.id} s={s} pos={PLACE[s.trophy.id]} onClick={() => setSel(s.trophy.id)} />)}
      </div>
      <header className="tr-title" key={page} style={{ "--t": TITLES[page].c, "--tg": TITLES[page].g } as CSSProperties}>
        <small>TROPHIES · {page + 1} / {PAGES}</small>
        <h1>{TITLES[page].name}</h1>
      </header>
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