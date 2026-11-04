import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, CalendarDays, ChevronLeft, Compass, Heart, PenLine, Plus, Search, Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Header } from "../components/shared";
import { igdbDiscoverCached, igdbDiscoverFeedCached, igdbImagesCached, igdbSearch, type IgdbCreds, type IgdbDiscover, type IgdbDiscoverGame, type IgdbFeed, type IgdbGame, type IgdbHit, type IgdbDebugImage } from "../data/igdb";
import type { AppData } from "../domain/game";
import type { Game } from "../domain/game";
import { AddGame } from "./library-components";
import { MediaSection } from "./media";
import { StarRating } from "../components/shared";
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
    void igdbDiscoverCached(genres, credentials).then(setFeeds).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Could not load discovery feeds.")).finally(() => setBusy(false));
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
  return <section className="discover-section"><div className="discover-section-heading"><div><p className="eyebrow">{section.key === "forYou" ? "BASED ON YOUR LIBRARY" : "LIVE FROM IGDB"}</p><h2>{section.title}</h2></div><span className={`discover-tone ${section.tone}`} /><button className="discover-view-all" onClick={onViewAll}>View all</button></div><SimilarShelf games={games} onOpen={openGame} /></section>;
}

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
  return <div className="discover-page"><button className="back-button" onClick={goBack}><ChevronLeft size={16} /> Back to Discover</button><Header eyebrow="IGDB DISCOVERY" title={section.title} /><div className="discover-grid">{games.map((game) => <DiscoverCard game={game} key={game.id} onDoubleClick={() => openGame(game.id)} />)}</div><div ref={sentinel} className="discover-loading">{loading ? "Loading more games..." : done ? "You have reached the end of this feed." : ""}</div></div>;
}

function DiscoverCard({ game, onDoubleClick }: { game: IgdbDiscoverGame; onDoubleClick: () => void }) {
  return <button className="discover-card" onDoubleClick={onDoubleClick} title="Double-click to open details"><div className="discover-card-art">{game.cover ? <img src={game.cover} alt={game.name} /> : <Compass size={28} />}</div></button>;
}

export function DiscoverGameDetails({ game, loading, close, openGame, credentials, savedGame, onAdd, onSave, onDelete }: { game?: IgdbGame; loading: boolean; close: () => void; openGame: (id: number) => void; credentials: IgdbCreds; savedGame?: Game; onAdd: (game: Game) => void; onSave: (game: Game) => void; onDelete: (game: Game) => void }) {
  const [editing, setEditing] = useState(false);
  const [images, setImages] = useState<IgdbDebugImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  useEffect(() => {
    if (!game) return;
    setImagesLoading(true);
    void igdbImagesCached(game.id, credentials).then(setImages).finally(() => setImagesLoading(false));
  }, [game?.id, credentials.clientId, credentials.clientSecret]);
  if (loading || !game) return <div className="discover-detail-loading"><Compass size={30} /><span>Loading game description and details...</span></div>;
  const draft = savedGame ?? draftFromIgdb(game);
  return <div className="discover-game-page"><button className="back-button" onClick={close}><ChevronLeft size={16} /> Back to Discover</button><DiscoverHero game={game} savedGame={savedGame} onEdit={() => setEditing(true)} onSave={onSave} onDelete={onDelete} /><div className="detail-grid discover-detail-grid"><section className="glass detail-panel"><div className="about-head"><div className="about-main"><p className="eyebrow">ABOUT</p><p className="about-desc open">{game.description ?? "No description is available for this game."}</p></div>{game.rating != null && <div className="score-box"><div className="rating-ring" style={{ "--p": game.rating, "--ring": game.rating >= 75 ? "var(--success)" : game.rating >= 50 ? "#f4c679" : "var(--rose)" } as React.CSSProperties}><strong>{(game.rating / 10).toFixed(1)}</strong></div><span className="score-title">IGDB SCORE</span><small>{game.ratingCount ? `Based on ${game.ratingCount.toLocaleString()} ratings` : "Community score"}</small></div>}</div><div className="plat-block">{[...game.genres, ...game.themes, ...game.playerPerspectives].length > 0 && <div><span className="plat-label">Genres &amp; themes</span><div className="igdb-chips">{[...game.genres, ...game.themes, ...game.playerPerspectives].map((tag) => <span className="pill" key={tag}>{tag}</span>)}</div></div>}</div><StarRating value={savedGame?.rating} readOnly size={16} /></section></div><MediaSection game={{ ...draft, screenshots: [] }} save={(next) => savedGame ? onSave(next) : undefined} igdbLoading={imagesLoading} igdbMedia={{ images, videos: game.videos.map((video) => ({ id: video.videoId, name: video.name })) }} />{game.similarGames.length > 0 && <section className="discover-section"><div className="discover-section-heading"><h2>Similar Games</h2></div><SimilarShelf games={game.similarGames} onOpen={openGame} /></section>}{editing && <AddGame initial={draft} igdb={credentials} onClose={() => setEditing(false)} onAdd={(next) => { savedGame ? onSave(next) : onAdd(next); setEditing(false); }} />}</div>;
}

function DiscoverHero({ game, savedGame, onEdit, onSave, onDelete }: { game: IgdbGame; savedGame?: Game; onEdit: () => void; onSave: (game: Game) => void; onDelete: (game: Game) => void }) {
  return <div className="detail-hero glass" style={game.background ? { backgroundImage: `linear-gradient(90deg, rgba(10,9,22,.95) 0%, rgba(12,13,27,.82) 48%, rgba(10,13,23,.68) 100%), url(${game.background})` } : undefined}><div className="hero-tab"><button title="Edit game" onClick={onEdit}><PenLine size={16} /><span>Edit</span></button><button title={savedGame?.favorite ? "Unfavorite" : "Favorite"} className={savedGame?.favorite ? "fav on" : "fav"} onClick={() => savedGame && onSave({ ...savedGame, favorite: !savedGame.favorite })}><Heart size={16} fill={savedGame?.favorite ? "currentColor" : "none"} /><span>Favorite</span></button>{savedGame && <button title="Delete game" className="del" onClick={() => onDelete(savedGame)}><Trash2 size={16} /><span>Delete</span></button>}</div><div className="detail-art" style={game.cover ? { backgroundImage: `url(${game.cover})` } : undefined} /><div className="detail-copy"><div className="hero-tags"><span className="status">{savedGame?.status ?? game.gameStatus ?? "IGDB"}</span></div><h1>{game.name}</h1><p>{game.platforms.join(", ")} · {game.genres.join(", ") || "Uncategorized"}</p><div className="hero-meta"><div className="hero-credit">{game.developer && <div className="credit-item"><Building2 size={14} /><div><small>Studio</small><strong>{game.developer}</strong></div></div>}<div className="credit-item"><CalendarDays size={14} /><div><small>Released</small><strong>{dateLabel(game.releaseTs)}</strong></div></div></div></div></div><div className="detail-stat"><span>IGDB score</span><strong>{game.rating != null ? `${(game.rating / 10).toFixed(1)}/10` : "—"}</strong><small>{game.ratingCount ? `${game.ratingCount.toLocaleString()} ratings` : "Not rated"}</small></div></div>;
}

function draftFromIgdb(game: IgdbGame): Game {
  return {
    id: crypto.randomUUID(), title: game.name, platform: game.platforms[0] ?? "", genre: game.genres.join(", "),
    tags: [], status: "Backlog", notes: "", favorite: false, cover: game.cover, backgroundCover: game.background,
    totalSeconds: 0, createdAt: new Date().toISOString(), developer: game.developer, releaseDate: game.releaseTs ? new Date(game.releaseTs * 1000).toISOString().slice(0, 10) : undefined,
    description: game.description, genres: game.genres, platforms: game.platforms, igdbId: game.id, igdbRating: game.rating,
    igdbRatingCount: game.ratingCount, timeAvgSeconds: game.timeAvg, timeMainSeconds: game.timeMain, timeFullSeconds: game.timeFull,
    screenshots: game.screenshots, videos: game.videos.map((video) => ({ id: video.videoId, name: video.name })),
    gameType: game.gameType, gameStatus: game.gameStatus, franchises: game.franchises,
  };
}
