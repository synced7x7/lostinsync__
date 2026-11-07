import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Clock3, Gamepad2, Heart, HelpCircle, Plus, Search, Star, X } from "lucide-react";
import type { ReactNode } from "react";
import type { AppData, Game } from "../domain/game";
import { Header } from "../components/shared";
import { CollectionShowcase } from "./overview";

const DAY = 86_400_000;

const lastTouched = (g: Game) =>
  Math.max(
    Date.parse(g.activeSince ?? "") || 0,
    Date.parse(g.finishedAt ?? "") || 0,
    Date.parse(g.startedAt ?? "") || 0
  ) || Date.parse(g.createdAt) || 0;

const ago = (t: number) => {
  const d = Math.floor((Date.now() - t) / DAY);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : d < 30 ? `${d}d ago` : d < 365 ? `${Math.floor(d / 30)}mo ago` : `${Math.floor(d / 365)}y ago`;
};

const hours = (s: number) => (s >= 3600 ? `${Math.round(s / 3600)}h` : `${Math.floor(s / 60)}m`);

const pad = (n: number) => String(n).padStart(3, "0");

// x position (%), dot y (px), card height (px) for the five slots
const SLOTS = [
  { x: 10, y: 390, h: 180 },
  { x: 30, y: 340, h: 200 },
  { x: 50, y: 300, h: 250 },
  { x: 70, y: 340, h: 200 },
  { x: 90, y: 390, h: 180 },
];

const WAVE =
  "M 0 395 C 50 395 50 390 100 390 C 200 390 200 340 300 340 C 400 340 400 300 500 300 C 600 300 600 340 700 340 C 800 340 800 390 900 390 C 950 390 950 395 1000 395";

function BigStat({ value, label, tip, accent }: { value: number; label: string; tip: string; accent?: boolean }) {
  return (
    <div className={`big-stat${accent ? " accent" : ""}`}>
      <strong>{pad(value)}</strong>
      <span>{label}<i title={tip}><HelpCircle size={13} /></i></span>
    </div>
  );
}

function Picker({ games, taken, onPick, onClose }: { games: Game[]; taken: string[]; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const list = games.filter((g) => !taken.includes(g.id) && g.title.toLowerCase().includes(q.toLowerCase()));
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal glass pick-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div></div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="pick-search">
          <Search size={15} />
          <input autoFocus placeholder="Search your library…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="pick-list">
          {list.map((g) => (
            <button key={g.id} onClick={() => onPick(g.id)}>
              <i style={g.cover ? { backgroundImage: `url(${g.cover})` } : undefined}>{!g.cover && <Gamepad2 size={14} />}</i>
              <span><strong>{g.title}</strong><small>{g.genre || g.platform || "Game"}</small></span>
            </button>
          ))}
          {!list.length && <p className="muted">No games found.</p>}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function Dashboard({
  data, update, openLibrary, openGame, openDiscoverGame, profile,
}: {
  data: AppData;
  update: (d: AppData) => void;
  openLibrary: () => void;
  openGame: (id: string) => void;
  openDiscoverGame: (id: number) => void;
  profile: ReactNode;
}) {
  const [slot, setSlot] = useState<number | null>(null);
  const byId = useMemo(() => new Map(data.games.map((g) => [g.id, g])), [data.games]);
  const picks = Array.from({ length: 5 }, (_, i) => byId.get(data.profile.topFive?.[i] ?? ""));
  const savePicks = (next: (string | undefined)[]) =>
    update({ ...data, profile: { ...data.profile, topFive: next.map((x) => x ?? "") } });

  const recent = useMemo(
    () =>
      data.games
        .filter((g) => !["Backlog", "Wishlist"].includes(g.status))
        .sort((a, b) => {
          const rank = (game: Game) => game.status === "Playing" ? 0 : game.status === "Completed" ? 1 : 2;
          if (rank(a) !== rank(b)) return rank(a) - rank(b);
          if (a.status === "Completed" && b.status === "Completed") {
            const aHasEnd = Boolean(a.finishedAt);
            const bHasEnd = Boolean(b.finishedAt);
            if (aHasEnd !== bHasEnd) return aHasEnd ? -1 : 1;
            if (aHasEnd && bHasEnd) return (Date.parse(b.finishedAt ?? "") || 0) - (Date.parse(a.finishedAt ?? "") || 0);
          }
          return lastTouched(b) - lastTouched(a);
        })
        .slice(0, 7),
    [data.games]
  );

  const wishlistgames = useMemo(() => data.games.filter((g) => g.status === "Wishlist").slice(0,7), [data.games]);

  const year = String(new Date().getFullYear());
  const playedThisYear = data.games.filter((g) => [g.startedAt, g.finishedAt].some((d) => d?.startsWith(year))).length;
  const completed = data.games.filter((g) => g.status === "Completed").length;
  const wishlist = data.games.filter((g) => g.status === "Wishlist").length;

  return (
    <>
      {profile}
      <section className="fav-section">
        <div className="section-title">
          <div><p className="eyebrow">HALL OF FAME</p></div>
          <button className="text-button" onClick={openLibrary}>Open library <ChevronRight size={14} /></button>
        </div>
        <div className="fav-scroll">
          <div className="fav-stage">
            <svg className="fav-svg" viewBox="0 0 1000 460" preserveAspectRatio="none">
              <defs>
                <linearGradient id="favline" x1="0" x2="1">
                  <stop offset="0" stopColor="#846df4" stopOpacity=".15" />
                  <stop offset=".5" stopColor="#a495ff" />
                  <stop offset="1" stopColor="#67d8e6" stopOpacity=".25" />
                </linearGradient>
              </defs>
              <path className="fav-wave-glow" d={WAVE} stroke="url(#favline)" />
              <path className="fav-wave" d={WAVE} stroke="url(#favline)" />
            </svg>

            {SLOTS.map((s, i) => {
              const g = picks[i];
              const top = s.y - 28 - s.h;
              return (
                <div key={i} className={`fav-slot${i === 2 ? " center" : ""}`} style={{ left: `${s.x}%`, top: 0 }}>
                  <span className="fav-stem" style={{ top: s.y - 28, height: 28 }} />
                  <span className="fav-dot" style={{ top: s.y - 8 }} />
                  {g ? (
                    <div
                      className="fav-card"
                      style={{ top, height: s.h, backgroundImage: g.cover ? `url(${g.cover})` : undefined }}
                      onClick={() => openGame(g.id)}
                    >
                      {i === 2 && <span className="fav-pill"><Star size={11} fill="currentColor" /> Top pick</span>}
                      <button
                        className="fav-x"
                        title="Remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          const n = picks.map((p) => p?.id);
                          n[i] = undefined;
                          savePicks(n);
                        }}
                      ><X size={12} /></button>
                      {!g.cover && <Gamepad2 size={34} className="fav-ph" />}
                      <div className="fav-info">
                        <strong>{g.title}</strong>
                        <small><Clock3 size={11} /> {hours(g.totalSeconds)}</small>
                      </div>
                    </div>
                  ) : (
                    <button className="fav-card empty" style={{ top, height: s.h }} onClick={() => setSlot(i)}>
                      <Plus size={22} /><span>Add favorite</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="stats-strip glass">
        <BigStat value={data.games.length} label="Games Collected" tip="Every game in your library" />
        <BigStat value={completed} label="Completed" tip="Games marked as Completed" />
        <BigStat value={playedThisYear} label={`Played in ${year}`} tip="Games started or finished this year" accent />
        <BigStat value={wishlist} label="Wishlist" tip="Games on your wishlist" />
      </section>

      <section className="section">
        <div className="section-title">
          <div><p className="eyebrow" style={{ marginTop: "15px" }}>PICK UP WHERE YOU LEFT</p></div>
          <button className="text-button" onClick={openLibrary}>View all <ChevronRight size={14} /></button>
        </div>
        {recent.length ? (
          <div className="recent-row">
            {recent.map((g) => (
              <button key={g.id} className="recent-card" onClick={() => openGame(g.id)}>
                <div className="recent-art" style={g.cover ? { backgroundImage: `url(${g.cover})` } : undefined}>
                  {!g.cover && <Gamepad2 size={26} />}
                  {g.favorite && <Heart size={13} fill="currentColor" className="recent-heart" />}
                </div>
                <strong>{g.title}</strong>
                <small>{ago(lastTouched(g))} · {hours(g.totalSeconds)}</small>
              </button>
            ))}
          </div>
        ) : <p className="muted">Games you start will show up here.</p>}
      </section>

      <section className="section">
        <div className="section-title">
          <div><p className="eyebrow" style={{ marginTop: "15px" }}>Wishlist</p></div>
          <button className="text-button" onClick={openLibrary}>View all <ChevronRight size={14} /></button>
        </div>
        {wishlistgames.length ? (
          <div className="recent-row">
            {wishlistgames.map((g) => (
              <button key={g.id} className="recent-card" onClick={() => openGame(g.id)}>
                <div className="recent-art" style={g.cover ? { backgroundImage: `url(${g.cover})` } : undefined}>
                  {!g.cover && <Gamepad2 size={26} />}
                  {g.favorite && <Heart size={13} fill="currentColor" className="recent-heart" />}
                </div>
                <strong>{g.title}</strong>
              </button>
            ))}
          </div>
        ) : <p className="muted">No games on your wishlist.</p>}
      </section>




      {slot !== null && (
        <Picker
          games={data.games}
          taken={picks.map((p) => p?.id ?? "")}
          onClose={() => setSlot(null)}
          onPick={(id) => {
            const n = picks.map((p) => p?.id);
            n[slot] = id;
            savePicks(n);
            setSlot(null);
          }}
        />
      )}
      <CollectionShowcase data={data} update={update} openGame={openGame} openDiscover={openDiscoverGame} />
    </>
  );
}