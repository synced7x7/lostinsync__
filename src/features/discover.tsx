import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ChevronLeft, Compass, Search } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Header } from "../components/shared";
import { igdbDetailsCached, igdbDiscoverFeedCached, igdbImagesCached, igdbSearch, type IgdbCreds, type IgdbDiscoverGame, type IgdbFeed, type IgdbGame, type IgdbHit, type IgdbDebugImage } from "../data/igdb";
import type { AppData, Game } from "../domain/game";
import "./discover.css";

const sections: { key: IgdbFeed; title: string; tone: string }[] = [
  { key: "trending", title: "Trending Now", tone: "rose" },
  { key: "anticipated", title: "Most Anticipated", tone: "green" },
  { key: "forYou", title: "For You", tone: "violet" },
  { key: "popular", title: "Most Popular", tone: "cyan" },
  { key: "topRated", title: "Top Rated", tone: "gold" },
  { key: "latest", title: "Latest Releases", tone: "rose" },
  { key: "hiddenGems", title: "Hidden Gems", tone: "violet" },
  { key: "indie", title: "Indie Spotlight", tone: "cyan" },
  { key: "upcoming", title: "Upcoming", tone: "blue" },
  { key: "story", title: "Story-Driven Adventures", tone: "rose" },
];

/* ============================ prefetch + instant-open seeds ============================ */
let prefetchCreds: IgdbCreds | undefined;
export const prefetchGame = (id: number) => {
  if (!prefetchCreds?.clientId || !prefetchCreds?.clientSecret) return;
  void igdbDetailsCached(id, prefetchCreds).catch(() => {});
  void igdbImagesCached(id, prefetchCreds).catch(() => {});
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
export function DiscoverView({ data }: { data: AppData }) {
  const credentials: IgdbCreds = { clientId: data.settings.igdbClientId ?? "", clientSecret: data.settings.igdbClientSecret ?? "" };
  const location = useLocation();
  const navigate = useNavigate();
  const feed = new URLSearchParams(location.search).get("feed") as IgdbFeed | null;
  const [feeds, setFeeds] = useState<Partial<Record<IgdbFeed, IgdbDiscoverGame[]>>>({});
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<IgdbHit[]>([]);
  const [error, setError] = useState("");
  const genres = useMemo(() => [...new Set(data.games.flatMap((game) => game.genres ?? [game.genre]).filter(Boolean))], [data.games]);

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
          const games = await igdbDiscoverFeedCached(s.key, genres, 0, 20, credentials);
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
  }, [credentials.clientId, credentials.clientSecret, genres.join("|")]);

  const runSearch = async () => {
    if (!search.trim()) return;
    try { setError(""); setSearchResults(await igdbSearch(search, credentials)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Search failed."); }
  };
  const openGame = (id: number) => navigate(`/details?igdb=${id}`);

  if (!credentials.clientId || !credentials.clientSecret) {
    return (
      <>
        <Header eyebrow="IGDB DISCOVERY" title="Discover" />
        <div className="discover-empty glass"><Compass size={34} /><h2>Connect IGDB to discover your next game</h2><p>Add your Twitch Client ID and Client Secret in Settings to unlock live recommendations, releases, ratings, and search.</p></div>
      </>
    );
  }
  if (feed) return <FeedPage feed={feed} credentials={credentials} genres={genres} openGame={openGame} goBack={() => navigate("/discover")} />;

  return (
    <div className="discover-page">
      <Header eyebrow="IGDB DISCOVERY" title="Discover" />
      {error && <div className="discover-error">{error}</div>}
      <section className="discover-search glass">
        <div><p className="eyebrow">SEARCH THE DATABASE</p></div>
        <div className="discover-search-row">
          <input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void runSearch()} placeholder='Try "Hades", "/ Hades", or "& 12345" for an IGDB ID' />
          <button className="button primary" onClick={() => void runSearch()}><Search size={16} /> Search</button>
        </div>
        {searchResults.length > 0 && (
          <div className="discover-results">
            {searchResults.map((game) => (
              <button key={game.id} className="discover-result" title="Double-click to open"
                onClick={() => { seedGame(game); prefetchGame(game.id); }}
                onDoubleClick={() => { seedGame(game); openGame(game.id); }}>
                <img src={game.cover} alt="" />
                <span><strong>{game.name}</strong></span>
              </button>
            ))}
          </div>
        )}
      </section>
      {sections.map((item) => {
        const games = feeds[item.key];
        if (!games) return <FeedSkeleton key={item.key} title={item.title} tone={item.tone} />;
        return games.length ? <FeedSection key={item.key} section={item} games={games} openGame={openGame} onViewAll={() => navigate(`/discover?feed=${item.key}`)} /> : null;
      })}
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
      <SimilarShelf games={games} onOpen={openGame} />
    </section>
  );
}

/* ============================ shelf with smooth horizontal wheel scrolling ============================ */
function SimilarShelf({ games, onOpen }: { games: IgdbDiscoverGame[]; onOpen: (id: number) => void }) {
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
  return <div className="discover-row" ref={shelfRef}>{games.map((game) => <DiscoverCard game={game} key={game.id} onDoubleClick={() => onOpen(game.id)} />)}</div>;
}

/* ============================ "View all" page ============================ */
function FeedPage({ feed, credentials, genres, openGame, goBack }: { feed: IgdbFeed; credentials: IgdbCreds; genres: string[]; openGame: (id: number) => void; goBack: () => void }) {
  const section = sections.find((item) => item.key === feed) ?? sections[0];
  const [games, setGames] = useState<IgdbDiscoverGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const loadMore = async () => {
    if (loading || done) return;
    setLoading(true);
    try {
      const next = await igdbDiscoverFeedCached(feed, genres, games.length, 30, credentials);
      setGames((current) => [...current, ...next]);
      if (next.length < 30 || games.length + next.length >= 100) setDone(true);
    } finally { setLoading(false); }
  };
  useEffect(() => { void loadMore(); }, []);
  useEffect(() => {
    const target = sentinel.current;
    if (!target) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: "500px" });
    observer.observe(target);
    return () => observer.disconnect();
  });
  return (
    <div className="discover-page">
      <button className="back-button" onClick={goBack}><ChevronLeft size={16} /> Back to Discover</button>
      <Header eyebrow="IGDB DISCOVERY" title={section.title} />
      <div className="discover-grid">{games.map((game) => <DiscoverCard game={game} key={game.id} onDoubleClick={() => openGame(game.id)} />)}</div>
      <div ref={sentinel} className="discover-loading">{loading ? "Loading more games..." : done ? "You have reached the end of this feed." : ""}</div>
    </div>
  );
}

/* ============================ card ============================ */
function DiscoverCard({ game, onDoubleClick }: { game: IgdbDiscoverGame; onDoubleClick: () => void }) {
  const timer = useRef<number | undefined>(undefined);
  return (
    <button
      className="discover-card"
      title="Double-click to open details"
      onClick={() => { seedGame(game); prefetchGame(game.id); }} // first click of a double-click starts loading
      onDoubleClick={() => { seedGame(game); onDoubleClick(); }}
      onMouseEnter={() => { timer.current = window.setTimeout(() => prefetchGame(game.id), 250); }}
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
    </button>
  );
}

/* ============================ game details (reuses the library Details view) ============================ */
type DetailsViewProps = {
  game: Game; data: AppData; update: (data: AppData) => void; saveGame: (game: Game) => void; deleteGame: (game: Game) => void;
  goBack: () => void; onOpenGame: (id: number) => void; igdb: IgdbCreds; backLabel?: string; extra?: ReactNode;
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
    void igdbImagesCached(igdbId, credentials).then((i) => !stale && setImages(i)).catch(() => {});
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

  // const tags = [...shell.themes, ...shell.playerPerspectives];
  return (
    <DetailsView
      game={view} data={data} update={update} igdb={credentials} onOpenGame={openGame}
      goBack={close} backLabel="Back to Discover"
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
    tags: [], status: "Completed", notes: "", favorite: false, cover: game.cover, backgroundCover: game.background,
    totalSeconds: 0, createdAt: new Date().toISOString(), developer: game.developer,
    releaseDate: game.releaseTs ? new Date(game.releaseTs * 1000).toISOString().slice(0, 10) : undefined,
    description: game.description, genres: game.genres, platforms: game.platforms, igdbId: game.id, igdbRating: game.rating,
    igdbRatingCount: game.ratingCount, timeAvgSeconds: game.timeAvg, timeMainSeconds: game.timeMain, timeFullSeconds: game.timeFull,
    screenshots: game.screenshots, videos: game.videos.map((video) => ({ id: video.videoId, name: video.name })),
    gameType: game.gameType, gameStatus: game.gameStatus, franchises: game.franchises,
    themes: game.themes, playerPerspectives: game.playerPerspectives,
  };
}