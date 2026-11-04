import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, Compass, Search, Star, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Header } from "../components/shared";
import { igdbDiscover, igdbDiscoverFeed, igdbSearch, type IgdbCreds, type IgdbDiscover, type IgdbDiscoverGame, type IgdbFeed, type IgdbGame, type IgdbHit } from "../data/igdb";
import type { AppData } from "../domain/game";
import "./discover.css";

const sections: { key: IgdbFeed; title: string; tone: string }[] = [
  { key: "forYou", title: "For You", tone: "violet" }, { key: "popular", title: "Most Popular", tone: "cyan" },
  { key: "topRated", title: "Top Rated", tone: "gold" }, { key: "latest", title: "Latest Releases", tone: "rose" },
  { key: "upcoming", title: "Upcoming", tone: "blue" }, { key: "anticipated", title: "Most Anticipated", tone: "green" },
  { key: "hiddenGems", title: "Hidden Gems", tone: "violet" }, { key: "indie", title: "Indie Spotlight", tone: "cyan" },
  { key: "story", title: "Story-Driven Adventures", tone: "rose" },
];
const dateLabel = (timestamp?: number) => timestamp ? new Date(timestamp * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Release date unknown";

export function DiscoverView({ data }: { data: AppData }) {
  const credentials: IgdbCreds = { clientId: data.settings.igdbClientId ?? "", clientSecret: data.settings.igdbClientSecret ?? "" };
  const location = useLocation();
  const navigate = useNavigate();
  const feed = new URLSearchParams(location.search).get("feed") as IgdbFeed | null;
  const [feeds, setFeeds] = useState<IgdbDiscover>();
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<IgdbHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const genres = useMemo(() => [...new Set(data.games.flatMap((game) => game.genres ?? [game.genre]).filter(Boolean))], [data.games]);

  useEffect(() => {
    if (!credentials.clientId || !credentials.clientSecret) return;
    setBusy(true);
    void igdbDiscover(genres, credentials).then(setFeeds).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load discovery feeds.")).finally(() => setBusy(false));
  }, [credentials.clientId, credentials.clientSecret, genres.join("|")]);

  const runSearch = async () => {
    if (!search.trim()) return;
    try { setError(""); setSearchResults(await igdbSearch(search, credentials)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Search failed."); }
  };
  const openGame = (id: number) => navigate(`/details?igdb=${id}`);
  if (!credentials.clientId || !credentials.clientSecret) return <><Header eyebrow="IGDB DISCOVERY" title="Discover" /><div className="discover-empty glass"><Compass size={34} /><h2>Connect IGDB to discover your next game</h2><p>Add your Twitch Client ID and Client Secret in Settings to unlock live recommendations, releases, ratings, and search.</p></div></>;
  if (feed) return <FeedPage feed={feed} credentials={credentials} genres={genres} openGame={openGame} goBack={() => navigate("/discover")} />;
  return (
    <div className="discover-page">
      <Header eyebrow="IGDB DISCOVERY" title="Discover" />
      {error && <div className="discover-error">{error}</div>}
      <section className="discover-search glass"><div><p className="eyebrow">SEARCH THE DATABASE</p><h2>Find any game</h2></div><div className="discover-search-row"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void runSearch()} placeholder='Try "Hades" or "/ Hades" for an exact match' /><button className="button primary" onClick={() => void runSearch()}><Search size={16} /> Search</button></div>{searchResults.length > 0 && <div className="discover-results">{searchResults.map((game) => <button key={game.id} className="discover-result" onDoubleClick={() => openGame(game.id)} title="Double-click to open"><img src={game.cover} alt="" /><span><strong>{game.name}</strong><small>Double-click to open details</small></span></button>)}</div>}</section>
      {busy && !feeds && <div className="discover-loading">Curating your feeds...</div>}
      {feeds && sections.map((item) => <FeedSection key={item.key} section={item} games={feeds[item.key]} openGame={openGame} onViewAll={() => navigate(`/discover?feed=${item.key}`)} />)}
    </div>
  );
}

function FeedSection({ section, games, openGame, onViewAll }: { section: typeof sections[number]; games: IgdbDiscoverGame[]; openGame: (id: number) => void; onViewAll: () => void }) {
  const row = useRef<HTMLDivElement>(null);
  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    event.preventDefault();
    row.current?.scrollBy({ left: event.deltaY, behavior: "smooth" });
  };
  return <section className="discover-section"><div className="discover-section-heading"><div><p className="eyebrow">{section.key === "forYou" ? "BASED ON YOUR LIBRARY" : "LIVE FROM IGDB"}</p><h2>{section.title}</h2></div><span className={`discover-tone ${section.tone}`} /><button className="discover-view-all" onClick={onViewAll}>View all</button></div><div className="discover-row" ref={row} onWheel={onWheel}>{games.map((game) => <DiscoverCard game={game} key={game.id} onDoubleClick={() => openGame(game.id)} />)}</div></section>;
}

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
      const next = await igdbDiscoverFeed(feed, genres, games.length, 30, credentials);
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
  return <div className="discover-page"><button className="back-button" onClick={goBack}><ChevronLeft size={16} /> Back to Discover</button><Header eyebrow="IGDB DISCOVERY" title={section.title} /><div className="discover-grid">{games.map((game) => <DiscoverCard game={game} key={game.id} onDoubleClick={() => openGame(game.id)} />)}</div><div ref={sentinel} className="discover-loading">{loading ? "Loading more games..." : done ? "You have reached the end of this feed." : ""}</div></div>;
}

function DiscoverCard({ game, onDoubleClick }: { game: IgdbDiscoverGame; onDoubleClick: () => void }) {
  return <button className="discover-card" onDoubleClick={onDoubleClick} title="Double-click to open details"><div className="discover-card-art">{game.cover ? <img src={game.cover} alt={game.name} /> : <Compass size={28} />}</div></button>;
}

export function DiscoverGameDetails({ game, loading, close, openGame }: { game?: IgdbGame; loading: boolean; close: () => void; openGame: (id: number) => void }) {
  if (loading || !game) return <div className="discover-detail-loading"><Compass size={30} /><span>Loading game description and details...</span></div>;
  return <div className="discover-game-page"><button className="back-button" onClick={close}><ChevronLeft size={16} /> Back to Discover</button><section className="discover-detail glass"><button className="discover-close" onClick={close} aria-label="Close details"><X size={18} /></button><div className="discover-detail-art">{game.cover && <img src={game.cover} alt="" />}</div><div className="discover-detail-copy"><p className="eyebrow">IGDB GAME PROFILE</p><h2>{game.name}</h2><p>{game.description ?? "No description is available for this game."}</p><div className="discover-meta"><span><CalendarDays size={14} /> {dateLabel(game.releaseTs)}</span><span><Star size={14} /> {game.rating != null ? `${(game.rating / 10).toFixed(1)}/10` : "Not rated"}</span></div><div className="discover-tags">{[...game.genres, ...game.themes, ...game.playerPerspectives].map((tag) => <span key={tag}>{tag}</span>)}</div>{game.storyline && <div><p className="eyebrow">STORYLINE</p><p>{game.storyline}</p></div>}</div></section>{game.similarGames.length > 0 && <section className="discover-section"><div className="discover-section-heading"><h2>Similar Games</h2></div><div className="discover-row">{game.similarGames.map((similar) => <DiscoverCard game={similar} key={similar.id} onDoubleClick={() => openGame(similar.id)} />)}</div></section>}</div>;
}
