import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ChevronLeft, Compass, Search, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Header } from "../components/shared";
import { igdbDetailsCached, igdbDiscoverFeedCached, igdbImagesCached, igdbSearch, type IgdbCreds, type IgdbDiscoverGame, type IgdbFeed, type IgdbGame, type IgdbHit, type IgdbDebugImage, type TasteProfile } from "../data/igdb";
import { formatCount, type AppData, type Game } from "../domain/game";
import "./discover.css";

const sections: { key: IgdbFeed; title: string; tone: string }[] = [
  { key: "trending", title: "Trending Now", tone: "rose" },
  { key: "forYou", title: "For You", tone: "violet" },
  { key: "anticipated", title: "Most Anticipated", tone: "green" },
  { key: "popular", title: "All Time Popular", tone: "cyan" },
  { key: "topRated", title: "Top Rated", tone: "gold" },
  { key: "story", title: "Story-Driven Adventures", tone: "rose" },
  { key: "indie", title: "Indie Spotlight", tone: "cyan" },
  { key: "latest", title: "Latest Releases", tone: "rose" },
  { key: "upcoming", title: "Upcoming", tone: "blue" },

];

/* ---------- For You: taste profile (frequency + rating) ---------- */
const IGDB_GENRES = ["Point-and-click", "Fighting", "Shooter", "Music", "Platform", "Puzzle", "Racing", "Real Time Strategy (RTS)", "Role-playing (RPG)", "Simulator", "Sport", "Strategy", "Turn-based strategy (TBS)", "Tactical", "Hack and slash/Beat 'em up", "Quiz/Trivia", "Pinball", "Adventure", "Indie", "Arcade", "Visual Novel", "Card & Board Game", "MOBA"];
const gKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const GENRE_BY_KEY = new Map<string, string>(IGDB_GENRES.map((g) => [gKey(g), g]));
for (const [alias, genre] of Object.entries({
  rpg: "Role-playing (RPG)", roleplaying: "Role-playing (RPG)", rts: "Real Time Strategy (RTS)", tbs: "Turn-based strategy (TBS)",
  sports: "Sport", platformer: "Platform", simulation: "Simulator", hackandslash: "Hack and slash/Beat 'em up", beatemup: "Hack and slash/Beat 'em up",
})) GENRE_BY_KEY.set(alias, genre);

/** Canonical IGDB genre names; legacy "Action, RPG" strings are split and mapped. */
const gameGenres = (g: Game): string[] =>
  [...new Set((g.genres?.length ? g.genres : (g.genre ?? "").split(",")).map((x) => x.trim()).filter(Boolean).map((x) => GENRE_BY_KEY.get(gKey(x)) ?? x))];

function buildTaste(games: Game[]): TasteProfile {
  const acc = new Map<string, { count: number; rated: number; ratingSum: number }>();
  for (const g of games) for (const genre of gameGenres(g)) {
    const a = acc.get(genre) ?? { count: 0, rated: 0, ratingSum: 0 };
    a.count++;
    if (g.rating) { a.rated++; a.ratingSum += g.rating; }
    acc.set(genre, a);
  }
  const all = [...acc.values()];
  const maxCount = Math.max(1, ...all.map((a) => a.count));
  const ratedTotal = all.reduce((s, a) => s + a.rated, 0);
  const libRating = ratedTotal ? all.reduce((s, a) => s + a.ratingSum, 0) / ratedTotal / 10 : 0;
  // a signal the library doesn't have is dropped and the remaining weights are renormalised
  const wf = 0.3, wr = ratedTotal ? 0.4 : 0, wsum = wf + wr;
  const weights: Record<string, number> = {};
  [...acc.entries()]
    .map(([genre, a]) => [genre, (wf * (a.count / maxCount) + wr * (a.rated ? a.ratingSum / a.rated / 10 : libRating)) / wsum] as const)
    .filter(([, w]) => w >= 0.15)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .forEach(([genre, w]) => { weights[genre] = Math.round(w * 1000) / 1000; });
  const ownedIds = games.map((g) => g.igdbId).filter((id): id is number => typeof id === "number");
  return {
    weights, ownedIds,
    confidence: Math.min(1, games.length / 15), // small libraries lean less on genre affinity
    key: JSON.stringify([weights, ownedIds.length, ownedIds.reduce((s, id) => (s + id) % 1_000_003, 0)]),
  };
}

const ratingsBadge = (g: IgdbDiscoverGame) => (g.ratingCount ? `${formatCount(g.ratingCount)} ratings` : undefined);

/* ============================ prefetch + instant-open seeds ============================ */
let prefetchCreds: IgdbCreds | undefined;
export const prefetchGame = (id: number) => {
  if (!prefetchCreds?.clientId || !prefetchCreds?.clientSecret) return;
  void igdbDetailsCached(id, prefetchCreds).catch(() => { });
  void igdbImagesCached(id, prefetchCreds).catch(() => { });
};

// What we already know about a game from a card / search result / collection item,
// so the details page can open immediately and fill in the rest as it arrives.
type Seed = { id: number; name: string; cover?: string; releaseTs?: number; rating?: number; ratingCount?: number; summary?: string; developer?: string };
const seeds = new Map<number, Seed>();
export const seedGame = (s: Seed) => { seeds.set(s.id, { ...seeds.get(s.id), ...s }); };
const stubGame = (id: number): IgdbGame => {
  const s = seeds.get(id);
  return {
    id, name: s?.name ?? "Loading…", cover: s?.cover, releaseTs: s?.releaseTs, developer: s?.developer,
    rating: s?.rating, ratingCount: s?.ratingCount, description: s?.summary,
    genres: [], platforms: [], videos: [], screenshots: [], themes: [], playerPerspectives: [], similarGames: [],
  };
};

/* ============================ discover home ============================ */
const discoverSession: { search: string; results: IgdbHit[] } = { search: "", results: [] };
export function DiscoverView({ data }: { data: AppData }) {
  const credentials: IgdbCreds = { clientId: data.settings.igdbClientId ?? "", clientSecret: data.settings.igdbClientSecret ?? "" };
  const location = useLocation();
  const navigate = useNavigate();
  const feed = new URLSearchParams(location.search).get("feed") as IgdbFeed | null;
  const [feeds, setFeeds] = useState<Partial<Record<IgdbFeed, IgdbDiscoverGame[]>>>({});
  const [search, setSearchState] = useState(discoverSession.search);
  const [searchResults, setResultsState] = useState<IgdbHit[]>(discoverSession.results);
  const setSearch = (value: string) => { discoverSession.search = value; setSearchState(value); };
  const setSearchResults = (results: IgdbHit[]) => { discoverSession.results = results; setResultsState(results); };
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const taste = useMemo(() => buildTaste(data.games), [data.games]);

  useEffect(() => { prefetchCreds = credentials; }, [credentials.clientId, credentials.clientSecret]);

  // each section loads on its own: 3 at a time, in order (stays under IGDB's rate limit)
  useEffect(() => {
    if (!credentials.clientId || !credentials.clientSecret) return;
    let stale = false;
    setFeeds({});
    setError("");
    const queue = [...sections];
    const worker = async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        try {
          const games = await igdbDiscoverFeedCached(s.key, taste, 0, 20, credentials);
          if (!stale) setFeeds((f) => ({ ...f, [s.key]: games }));
        } catch (reason) {
          if (!stale) {
            setFeeds((f) => ({ ...f, [s.key]: [] }));
            setError(reason instanceof Error ? reason.message : "Could not load some discovery feeds.");
          }
        }
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    return () => { stale = true; };
  }, [credentials.clientId, credentials.clientSecret, taste.key]);

  const runSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try { setError(""); setSearchResults(await igdbSearch(search, credentials)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Search failed."); }
    finally { setSearching(false); }
  };
  const openGame = (id: number) => navigate(`/details?igdb=${id}`);

  if (!credentials.clientId || !credentials.clientSecret) {
    return (
      <>
    
        <div className="discover-empty glass"><Compass size={34} /><h2>Connect IGDB to discover your next game</h2><p>Add your Twitch Client ID and Client Secret in Settings to unlock live recommendations, releases, ratings, and search.</p></div>
      </>
    );
  }
  if (feed) return <FeedPage key={feed} feed={feed} credentials={credentials} taste={taste} openGame={openGame} goBack={() => navigate("/discover")} />;

  return (
    <div className="discover-page">
      
        <DiscoverSearch
          value={search} onChange={setSearch} onSubmit={() => void runSearch()} busy={searching} results={searchResults}
          onPick={(game) => { seedGame(game); prefetchGame(game.id); openGame(game.id); }}
        />
   
      {error && <div className="discover-error">{error}</div>}
      {sections.map((item) => {
        const games = feeds[item.key];
        if (!games) return <FeedSkeleton key={item.key} title={item.title} tone={item.tone} />;
        return games.length ? <FeedSection key={item.key} section={item} games={games} openGame={openGame} onViewAll={() => navigate(`/discover?feed=${item.key}`)} /> : null;
      })}
    </div>
  );
}

function DiscoverSearch({ value, onChange, onSubmit, busy, results, onPick }: {
  value: string; onChange: (v: string) => void; onSubmit: () => void; busy: boolean;
  results: IgdbHit[]; onPick: (game: IgdbHit) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) { e.preventDefault(); setOpen(true); }
      else if (e.key === "Escape") setOpen(false);
    };
    const down = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("keydown", key);
    document.addEventListener("mousedown", down);
    return () => { window.removeEventListener("keydown", key); document.removeEventListener("mousedown", down); };
  }, []);

  return (
    <div className={`dsearch${open ? " open" : ""}`} ref={box}>
      <div className="dsearch-bar">
        <button className="dsearch-icon" onClick={() => (open ? onSubmit() : setOpen(true))} aria-label="Search the database" title="Search (/ or Ctrl+K)">
          <Search size={18} />
        </button>
        <input
          ref={input} value={value} tabIndex={open ? 0 : -1}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          placeholder='Search games · "/ Hades" · "& 12345"'
        />
        {busy
          ? <span className="dsearch-spin" />
          : value && <button className="dsearch-clear" onClick={() => { onChange(""); input.current?.focus(); }} aria-label="Clear"><X size={14} /></button>}
      </div>
      {open && results.length > 0 && (
        <div className="dsearch-pop">
          {results.map((game, i) => (
            <button
              key={game.id} className="dsearch-item" style={{ animationDelay: `${Math.min(i, 8) * 28}ms` }}
              onClick={() => { setOpen(false); onPick(game); }}
            >
              <img src={game.cover} alt="" loading="lazy" />
              <span>
                <strong>{game.name}</strong>
                <small>{game.gameType ?? "Unknown"} · {game.releaseTs ? new Date(game.releaseTs * 1000).getFullYear() : "TBA"}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FeedSkeleton({ title, tone }: { title: string; tone: string }) {
  return (
    <section className="discover-section">
      <div className="discover-section-heading"><div><h2>{title}</h2><span className={`discover-tone ${tone}`} /></div></div>
      <div className="discover-row">
        {Array.from({ length: 8 }, (_, i) => <div className="discover-card skeleton" key={i}><div className="discover-card-art" /></div>)}
      </div>
    </section>
  );
}

function FeedSection({ section, games, openGame, onViewAll }: { section: typeof sections[number]; games: IgdbDiscoverGame[]; openGame: (id: number) => void; onViewAll: () => void }) {
  return (
    <section className="discover-section">
      <div className="discover-section-heading">
        <div><p className="eyebrow">{section.key === "forYou" ? "BASED ON YOUR LIBRARY" : "LIVE FROM IGDB"}</p><h2>{section.title}</h2></div>
        <span className={`discover-tone ${section.tone}`} />
        <button className="discover-view-all" onClick={onViewAll}>View all</button>
      </div>
      <SimilarShelf games={games} onOpen={openGame} badge={section.key === "popular" ? ratingsBadge : undefined} />
    </section>
  );
}

/* ============================ shelf with smooth horizontal wheel scrolling ============================ */
function SimilarShelf({ games, onOpen, badge }: { games: IgdbDiscoverGame[]; onOpen: (id: number) => void; badge?: (g: IgdbDiscoverGame) => string | undefined }) {
  const shelfRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef(0);
  const rafRef = useRef(0);
  useEffect(() => {
    const shelf = shelfRef.current;
    if (!shelf) return;
    const tick = () => {
      const diff = targetRef.current - shelf.scrollLeft;
      if (Math.abs(diff) < 0.5) { shelf.scrollLeft = targetRef.current; rafRef.current = 0; return; }
      shelf.scrollLeft += diff * 0.22;
      rafRef.current = requestAnimationFrame(tick);
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!rafRef.current) targetRef.current = shelf.scrollLeft;
      const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      targetRef.current = Math.max(0, Math.min(shelf.scrollWidth - shelf.clientWidth, targetRef.current + delta));
      if (!rafRef.current) rafRef.current = requestAnimationFrame(tick);
    };
    const sync = () => { if (!rafRef.current) targetRef.current = shelf.scrollLeft; };
    shelf.addEventListener("wheel", wheel, { passive: false });
    shelf.addEventListener("scroll", sync, { passive: true });
    return () => { shelf.removeEventListener("wheel", wheel); shelf.removeEventListener("scroll", sync); cancelAnimationFrame(rafRef.current); };
  }, []);
  return <div className="discover-row" ref={shelfRef}>{games.map((game) => <DiscoverCard game={game} badge={badge?.(game)} key={game.id} onDoubleClick={() => onOpen(game.id)} />)}</div>;
}

/* ============================ "View all" page ============================ */
function FeedPage({ feed, credentials, taste, openGame, goBack }: { feed: IgdbFeed; credentials: IgdbCreds; taste: TasteProfile; openGame: (id: number) => void; goBack: () => void }) {
  const section = sections.find((item) => item.key === feed) ?? sections[0];
  const [games, setGames] = useState<IgdbDiscoverGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const inflight = useRef(false);
  const offset = useRef(0);
  const doneRef = useRef(false);
  const loadMore = async () => {
    if (inflight.current || doneRef.current) return;
    inflight.current = true;
    setLoading(true);
    try {
      const next = await igdbDiscoverFeedCached(feed, taste, offset.current, 30, credentials);
      setGames((current) => [...current, ...next]);
      offset.current += next.length;
      if (next.length < 30 || offset.current >= 100) { doneRef.current = true; setDone(true); }
    } finally {
      inflight.current = false;
      setLoading(false);
    }
  };
  useEffect(() => { void loadMore(); }, []);
  useEffect(() => {
    const target = sentinel.current;
    if (!target) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: "500px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loading, done]);
  return (
    <div className="discover-page">
      <button className="back-button" onClick={goBack}><ChevronLeft size={16} /> Back to Discover</button>
      <Header eyebrow="IGDB DISCOVERY" title={section.title} />
      <div className="discover-grid">{games.map((game) => <DiscoverCard game={game} key={game.id} badge={feed === "popular" ? ratingsBadge(game) : undefined} onDoubleClick={() => openGame(game.id)} />)}</div>
      <div ref={sentinel} className="discover-loading">{loading ? "Loading more games..." : done ? "You have reached the end of this feed." : ""}</div>
    </div>
  );
}

/* ============================ card ============================ */
function DiscoverCard({ game, badge, onDoubleClick }: { game: IgdbDiscoverGame; badge?: string; onDoubleClick: () => void }) {
  const timer = useRef<number | undefined>(undefined);
  return (
    <button
      className="discover-card"
      title="Double-click to open details"
      onClick={() => { seedGame(game); prefetchGame(game.id); }} // first click of a double-click starts loading
      onDoubleClick={() => { seedGame(game); onDoubleClick(); }}
      onMouseEnter={() => { timer.current = window.setTimeout(() => prefetchGame(game.id), 400); }}
      onMouseLeave={() => window.clearTimeout(timer.current)}
    >
      <div className={`discover-card-art${game.cover ? "" : " empty"}`}>
        {game.cover ? <img src={game.cover} alt={game.name} /> : (
          <>
            <Compass size={28} />
            <span className="discover-card-fallback">{game.name}</span>
          </>
        )}
      </div>
      {badge && <span className="discover-card-badge">{badge}</span>}
    </button>
  );
}

/* ============================ game details (reuses the library Details view) ============================ */
type DetailsViewProps = {
  game: Game; data: AppData; update: (data: AppData) => void; saveGame: (game: Game) => void; deleteGame: (game: Game) => void;
  goBack: () => void; onOpenGame: (id: number) => void; igdb: IgdbCreds; backLabel?: string; extra?: ReactNode; preview?: boolean;
};

export function DiscoverGameDetails({ igdbId, game, close, openGame, credentials, savedGame, data, update, onAdd, onSave, onDelete, DetailsView }: {
  igdbId: number; game?: IgdbGame; loading: boolean; close: () => void; openGame: (id: number) => void; credentials: IgdbCreds;
  savedGame?: Game; data: AppData; update: (data: AppData) => void; onAdd: (game: Game) => void; onSave: (game: Game) => void; onDelete: (game: Game) => void;
  DetailsView: ComponentType<DetailsViewProps>;
}) {
  const ready = !!game && game.id === igdbId; // ignore the previous game's data while the new one loads
  const shell = useMemo<IgdbGame>(() => (ready ? game! : stubGame(igdbId)), [ready, game, igdbId]);

  const [images, setImages] = useState<IgdbDebugImage[]>([]);
  useEffect(() => {
    let stale = false;
    setImages([]);
    void igdbImagesCached(igdbId, credentials).then((i) => !stale && setImages(i)).catch(() => { });
    return () => { stale = true; };
  }, [igdbId, credentials.clientId, credentials.clientSecret]);

  const view = useMemo<Game>(() => {
    const base = savedGame ?? { ...draftFromIgdb(shell), screenshots: [], videos: [] };
    return {
      ...base,
      gameType: ready ? shell.gameType ?? base.gameType : base.gameType,
      gameStatus: ready ? shell.gameStatus ?? base.gameStatus : base.gameStatus,
      franchises: ready ? shell.franchises ?? base.franchises : base.franchises,
      themes: ready ? shell.themes ?? base.themes : base.themes,
      playerPerspectives: ready ? shell.playerPerspectives ?? base.playerPerspectives : base.playerPerspectives,
      igdbImages: base.igdbImages?.length ? base.igdbImages : images,
      igdbVideos: base.igdbVideos?.length ? base.igdbVideos : shell.videos.map((v) => ({ id: v.videoId, name: v.name })),
    };
  }, [shell, savedGame, images]);

  return (
    <DetailsView
      game={view} data={data} update={update} igdb={credentials} onOpenGame={openGame}
      goBack={close} backLabel="Back to Discover" preview={!savedGame}
      saveGame={(next) => (savedGame ? onSave(next) : onAdd(next))}
      deleteGame={(g) => savedGame && onDelete(g)}
      extra={<>
        {!ready && <><div className="detail-skeleton" /><FeedSkeleton title="Similar Games" tone="violet" /></>}
        {shell.similarGames.length > 0 && (
          <section className="discover-section" style={{ marginTop: "24px" }}>
            <div className="discover-section-heading"><h2>Similar Games</h2></div>
            <SimilarShelf games={shell.similarGames} onOpen={openGame} />
          </section>
        )}
      </>}
    />
  );
}

function draftFromIgdb(game: IgdbGame): Game {
  return {
    id: crypto.randomUUID(), title: game.name, platform: game.platforms[0] ?? "", genre: game.genres.join(", "),
    tags: [], status: "Backlog", playedPlatforms: [], notes: "", favorite: false, cover: game.cover, backgroundCover: game.background,
    totalSeconds: 0, createdAt: new Date().toISOString(), developer: game.developer,
    releaseDate: game.releaseTs ? new Date(game.releaseTs * 1000).toISOString().slice(0, 10) : undefined,
    description: game.description, genres: game.genres, platforms: game.platforms, igdbId: game.id, igdbRating: game.rating,
    igdbRatingCount: game.ratingCount, timeAvgSeconds: game.timeAvg, timeMainSeconds: game.timeMain, timeFullSeconds: game.timeFull,
    screenshots: game.screenshots, videos: game.videos.map((video) => ({ id: video.videoId, name: video.name })),
    gameType: game.gameType, gameStatus: game.gameStatus, franchises: game.franchises,
    themes: game.themes, playerPerspectives: game.playerPerspectives,
  };
}