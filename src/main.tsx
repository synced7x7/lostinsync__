import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  Gamepad2,
  Grid2X2,
  Heart,
  LayoutGrid,
  Monitor,
  PenLine,
  Plus,
  Search,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
  Notebook,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createAppRepository } from "./data/repository";
import {
  defaultData,
  formatCount,
  formatHours,
  formatPlaytime,
  STATUSES,
  type AppData,
  type AppSettings,
  type Game,
  type GridSize,
  type LibraryLayout,
  type LibrarySort,
  type Status,
  type View,
} from "./domain/game";
import "./style.css";
import { DateField, Empty, formatDate, GameMini, Header, MasteryProgress, StarRating, Stat } from "./components/shared";
import { AppLayout } from "./components/layout";
import { Dashboard } from "./features/dashboard";
import { ActivityView } from "./features/activity";
import { AddGame } from "./features/library-components";
import { MediaSection } from "./features/media";


const repo = createAppRepository();
const now = () => new Date().toISOString();

function App() {
  const [data, setData] = useState<AppData>(defaultData);
  const location = useLocation();
  const navigate = useNavigate();
  const view = (location.pathname.slice(1) || "dashboard") as View;
  const setView = (next: View) =>
    navigate(next === "dashboard" ? "/" : `/${next}`);
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    repo
      .load()
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load data.")
      )
      .finally(() => setLoading(false));
  }, []);
  const update = (next: AppData) => {
    setData(next);
    void repo
      .save(next)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not save data.")
      );
  };
  const addGame = (game: Game) =>
    update({
      ...data,
      games: [game, ...data.games],
      activities: [
        ...(game.finishedAt ? [{ id: crypto.randomUUID(), type: "completed" as const, title: "Game completed", detail: `${game.title} · ${game.finishedAt}`, occurredAt: now() }] : []),
        ...(game.startedAt ? [{ id: crypto.randomUUID(), type: "started" as const, title: "Game started", detail: `${game.title} · ${game.startedAt}`, occurredAt: now() }] : []),
        { id: crypto.randomUUID(), type: "added", title: "Added to library", detail: game.title, occurredAt: now() },
        ...data.activities,
      ],
    });


  const saveGame = (
    game: Game,
    activity?: { type: "status" | "completed" | "started"; detail: string }
  ) => {
    const previous = data.games.find((item) => item.id === game.id);
    const events = [
      ...(game.startedAt !== previous?.startedAt && game.startedAt ? [{ id: crypto.randomUUID(), type: "started" as const, title: "Game started", detail: `${game.title} · ${game.startedAt}`, occurredAt: now() }] : []),
      ...(game.finishedAt !== previous?.finishedAt && game.finishedAt ? [{ id: crypto.randomUUID(), type: "completed" as const, title: "Game completed", detail: `${game.title} · ${game.finishedAt}`, occurredAt: now() }] : []),
      ...(activity ? [{ id: crypto.randomUUID(), type: activity.type, title: activity.type === "completed" ? "Game completed" : activity.type === "started" ? "Game started" : "Library updated", detail: `${game.title} · ${activity.detail}`, occurredAt: now() }] : []),
    ];
    update({
      ...data,
      games: data.games.map((item) => (item.id === game.id ? game : item)),
      activities: [...events, ...data.activities],
    });
  };
  const deleteGame = (game: Game) => {
    if (!window.confirm(`Delete "${game.title}" from your library?`)) return;
    update({
      ...data,
      games: data.games.filter((item) => item.id !== game.id),
      activities: [{ id: crypto.randomUUID(), type: "deleted", title: "Removed from library", detail: game.title, occurredAt: now() }, ...data.activities],
    });
    setSelectedId(undefined);
    setView("library");
  };
  const selected = data.games.find((game) => game.id === selectedId);
  if (loading)
    return (
      <div className="boot">
        <Sparkles size={30} />
        <span>Preparing your library...</span>
      </div>
    );
  return (
    <AppLayout data={data} view={view} onNavigate={setView} error={error}>
      {view === "dashboard" && (
        <Dashboard data={data} openLibrary={() => setView("library")} openGame={(id) => { setSelectedId(id); setView("details"); }} />
      )}{" "}
      {view === "library" && (
        <LibraryView data={data} update={update} addGame={addGame} saveGame={saveGame} deleteGame={deleteGame} openGame={(id) => { setSelectedId(id); setView("details"); }} />
      )}{" "}
      {view === "details" && selected && (
        <Details game={selected} saveGame={saveGame} deleteGame={deleteGame} goBack={() => setView("library")} igdb={{ clientId: data.settings.igdbClientId ?? "", clientSecret: data.settings.igdbClientSecret ?? "" }} />
      )}{" "}
      {view === "activity" && <ActivityView data={data} />}{" "}
      {view === "profile" && (
        <ProfileView data={data} update={update} openGame={(id) => { setSelectedId(id); setView("details"); }} />
      )}{" "}
      {view === "journal" && <JournalView data={data} update={update} />}{" "}
      {view === "settings" && <SettingsView data={data} update={update} />}{" "}
    </AppLayout>
  );
}

function LibraryView({
  data, update, addGame, saveGame, openGame,
}: {
  data: AppData;
  update: (data: AppData) => void;
  addGame: (game: Game) => void;
  saveGame: (game: Game, activity?: { type: "status" | "completed" | "started"; detail: string }) => void;
  deleteGame: (game: Game) => void;
  openGame: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [featuredId, setFeaturedId] = useState<string>();
  const [showAdd, setShowAdd] = useState(false);

  const layout = data.settings.libraryLayout ?? "ps4";
  const filter = data.settings.libraryFilter ?? "All";
  const genre = data.settings.libraryGenre ?? "All";
  const sort = data.settings.librarySort ?? "recent";

  const updateSettings = (partial: Partial<AppSettings>) => {
    update({
      ...data,
      settings: { ...data.settings, ...partial },
    });
  };

  const genres = [...new Set(data.games.map((g) => g.genre).filter(Boolean))];
  const games = useMemo(
    () => data.games
      .filter((g) => (filter === "All" || g.status === filter) && (genre === "All" || g.genre === genre) && g.title.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "playtime" ? b.totalSeconds - a.totalSeconds : b.createdAt.localeCompare(a.createdAt)),
    [data.games, filter, genre, query, sort]
  );
  const featured = games.find((g) => g.id === featuredId) ?? games[0];
  return (
    <>
      <div className="library-heading">
        <div><p className="eyebrow">YOUR COLLECTION · {data.games.length} GAMES</p><h1>Library</h1></div>
        <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={17} /> Add game</button>
      </div>
      <div className="toolbar library-toolbar glass">
        <div className="search-field">
          <Search size={17} />
          <input placeholder="Search your collection..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="toolbar-actions">
          <select value={filter} onChange={(e) => updateSettings({ libraryFilter: e.target.value as Status | "All" })}>
            <option value="All">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={genre} onChange={(e) => updateSettings({ libraryGenre: e.target.value })}>
            <option value="All">All genres</option>
            {genres.map((g) => <option key={g}>{g}</option>)}
          </select>
          <select value={sort} onChange={(e) => updateSettings({ librarySort: e.target.value as LibrarySort })}>
            <option value="recent">Recently added</option>
            <option value="title">Title</option>
            <option value="playtime">Playtime</option>
          </select>
          <button className={layout === "ps4" ? "icon-btn active" : "icon-btn"} onClick={() => updateSettings({ libraryLayout: "ps4" })} title="PS4 shelf view">
            <Monitor size={17} />
          </button>
          <button className={layout === "catalog" ? "icon-btn active" : "icon-btn"} onClick={() => updateSettings({ libraryLayout: "catalog" })} title="Catalog grid view">
            <LayoutGrid size={17} />
          </button>
        </div>
      </div>
      {games.length === 0
        ? <Empty icon={<Filter />} title="Nothing here yet" text="Try another search or add your first game." action={() => setShowAdd(true)} />
        : layout === "ps4"
          ? <PS4ShelfView games={games} featured={featured} setFeaturedId={setFeaturedId} openGame={openGame} saveGame={saveGame} />
          : <GridLibraryView games={games} openGame={openGame} saveGame={saveGame} gridSize={data.settings.gridSize ?? "md"} setGridSize={(size) => updateSettings({ gridSize: size })} />
      }
      {showAdd && <AddGame igdb={{ clientId: data.settings.igdbClientId ?? "", clientSecret: data.settings.igdbClientSecret ?? "" }} onClose={() => setShowAdd(false)} onAdd={(game) => { addGame(game); setShowAdd(false); }} />}
    </>
  );
}

function PS4ShelfView({
  games, featured, setFeaturedId, openGame, saveGame,
}: {
  games: Game[];
  featured: Game | undefined;
  setFeaturedId: (id: string) => void;
  openGame: (id: string) => void;
  saveGame: (g: Game, a?: { type: "status" | "completed" | "started"; detail: string }) => void;
}) {
  const [focusedIdx, setFocusedIdx] = useState(0);
  const shelfRef = useRef<HTMLDivElement>(null);

  const focusedGame = games[focusedIdx] ?? games[0];
  useEffect(() => {
    if (focusedGame) setFeaturedId(focusedGame.id);
  }, [focusedGame, setFeaturedId]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setFocusedIdx((p) => Math.min(p + 1, games.length - 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setFocusedIdx((p) => Math.max(p - 1, 0));
    } else if (e.key === "Enter" && focusedGame) {
      openGame(focusedGame.id);
    }
  }, [games.length, focusedGame, openGame]);

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);

  useEffect(() => {
    const el = shelfRef.current?.children[focusedIdx] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [focusedIdx]);

  useEffect(() => {
    const shelf = shelfRef.current;
    if (!shelf) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 2.8;
      shelf.scrollLeft += delta;
    };
    shelf.addEventListener("wheel", onWheel, { passive: false });
    return () => shelf.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div className="ps4-library">
      <AnimatePresence mode="wait">
        {featured && (
          <motion.div
            key={featured.id}
            className="ps4-bg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={featured.backgroundCover || featured.cover ? { backgroundImage: `url(${featured.backgroundCover ?? featured.cover})` } : undefined}
          />
        )}
      </AnimatePresence>
      <div className="ps4-bg-overlay" />
      <AnimatePresence mode="wait">
        {featured && (
          <motion.div
            key={featured.id + "-info"}
            className="ps4-featured-info"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <span className="status">{featured.status}</span>
            <h2 className="ps4-title">{featured.title}</h2>
            <p className="ps4-meta">{featured.platform}<span> · </span>{featured.genre || "Uncategorized"}<span> · </span>{formatPlaytime(featured.totalSeconds)}</p>
            <div className="ps4-actions">
              <button className="button primary" onClick={() => openGame(featured.id)}><Gamepad2 size={15} /> Open</button>
              <button className="icon-btn featured-heart" onClick={() => saveGame({ ...featured, favorite: !featured.favorite })}>
                <Heart size={16} fill={featured.favorite ? "currentColor" : "none"} />
              </button>
              {featured.rating && <span className="ps4-rating">{featured.rating}<small>/10</small></span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="ps4-nav-hint">
        <ChevronLeft size={13} /><ChevronRight size={13} /><span>Scroll / Arrow keys to explore · Enter / Double-click to open</span>
      </div>
      <div className="ps4-shelves">
        <div className="ps4-shelf-row" ref={shelfRef}>
          {games.map((game, idx) => {
            const isFocused = focusedIdx === idx;
            return (
              <motion.button
                key={game.id}
                layout
                className={`ps4-card${isFocused ? " ps4-card--focused" : ""}`}
                onClick={() => setFocusedIdx(idx)}
                onDoubleClick={() => openGame(game.id)}
                onMouseEnter={() => setFocusedIdx(idx)}
                animate={isFocused ? {
                  scale: 1.25,
                  zIndex: 20,
                  y: -12,
                  marginLeft: idx === 0 ? 8 : 18,
                  marginRight: 18,
                } : {
                  scale: 1,
                  zIndex: 1,
                  y: 0,
                  marginLeft: 0,
                  marginRight: 0,
                }}
                transition={{ type: "spring", stiffness: 360, damping: 28 }}
                whileHover={!isFocused ? { scale: 1.08, y: -4 } : {}}
              >
                <div className="ps4-card-art" style={game.cover ? { backgroundImage: `url(${game.cover})` } : undefined}>
                  {!game.cover && <Gamepad2 size={24} />}
                </div>
                {isFocused && (
                  <motion.span
                    className="ps4-card-label"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 }}
                  >
                    {game.title}
                  </motion.span>
                )}
                {isFocused && <div className="ps4-card-focus-ring" />}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function GridLibraryView({
  games, openGame, saveGame, gridSize, setGridSize,
}: {
  games: Game[];
  openGame: (id: string) => void;
  saveGame: (g: Game, a?: { type: "status" | "completed" | "started"; detail: string }) => void;
  gridSize: GridSize;
  setGridSize: (size: GridSize) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(40);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount((c) => Math.min(c + 40, games.length));
    }, { rootMargin: "300px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [games.length]);
  const visible = games.slice(0, visibleCount);
  const sizeClass: Record<GridSize, string> = { sm: "grid-lib--sm", md: "grid-lib--md", lg: "grid-lib--lg" };
  return (
    <div className="grid-lib-wrapper">
      <div className="grid-lib-controls">
        <span className="muted">{games.length} titles</span>
        <div className="toolbar-actions">
          {(["sm", "md", "lg"] as GridSize[]).map((s) => (
            <button key={s} className={gridSize === s ? "icon-btn active" : "icon-btn"} onClick={() => setGridSize(s)}
              title={s === "sm" ? "Small covers" : s === "md" ? "Medium covers" : "Large covers"}>
              <Grid2X2 size={s === "sm" ? 12 : s === "md" ? 16 : 20} />
            </button>
          ))}
        </div>
      </div>
      <div className={`grid-lib ${sizeClass[gridSize]}`}>
        {visible.map((game) => (
          <GridCard key={game.id} game={game} gridSize={gridSize} onOpen={() => openGame(game.id)} onSave={saveGame} />
        ))}
      </div>
      <div ref={sentinelRef} style={{ height: 1 }} />
      {visibleCount < games.length && (
        <div className="grid-lib-loading"><Sparkles size={15} /><span>Loading more...</span></div>
      )}
    </div>
  );
}

function GridCard({
  game, gridSize, onOpen, onSave,
}: {
  game: Game;
  gridSize: GridSize;
  onOpen: () => void;
  onSave: (g: Game) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div className="grid-card"
      onHoverStart={() => setHovered(true)} onHoverEnd={() => setHovered(false)}
      animate={hovered ? { scale: 1.07, zIndex: 20 } : { scale: 1, zIndex: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      onClick={onOpen}
    >
      <div className="grid-card-art" style={game.cover ? { backgroundImage: `url(${game.cover})` } : undefined}>
        {!game.cover && <Gamepad2 size={gridSize === "lg" ? 36 : gridSize === "md" ? 26 : 18} />}
        <span className="grid-card-platform">{game.platform}</span>
        <AnimatePresence>
          {hovered && (
            <motion.div className="grid-card-hover-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} />
          )}
        </AnimatePresence>
      </div>
      <motion.div className="grid-card-glow-border" animate={hovered ? { opacity: 1 } : { opacity: 0 }} transition={{ duration: 0.18 }} />
      <div className="grid-card-info">
        <span className="grid-card-title">{game.title}</span>
        {gridSize !== "sm" && <span className="grid-card-sub">{game.genre || "Uncategorized"}</span>} {/* · */}
      </div>
    </motion.div>
  );
}


function Details({
  game, saveGame, deleteGame, goBack, igdb,
}: {
  game: Game;
  saveGame: (game: Game, activity?: { type: "status" | "completed" | "started"; detail: string }) => void;
  deleteGame: (game: Game) => void;
  goBack: () => void;
  igdb: { clientId: string; clientSecret: string };
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const played = game.totalSeconds;
  const days = game.startedAt && game.finishedAt
    ? Math.round((Date.parse(game.finishedAt) - Date.parse(game.startedAt)) / 86400000) + 1
    : undefined;
  const ringColor = (game.igdbRating ?? 0) >= 75 ? "var(--success)" : (game.igdbRating ?? 0) >= 50 ? "#f4c679" : "var(--rose)";
  const tiles = [
    { label: "Average to complete", sec: game.timeAvgSeconds, icon: Timer, cls: "avg" },
    { label: "Main story", sec: game.timeMainSeconds, icon: BookOpen, cls: "main" },
    { label: "100% completion", sec: game.timeFullSeconds, icon: Trophy, cls: "full" },
  ];
  const genreList = game.genres?.length ? game.genres : game.genre ? game.genre.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const playedOn = game.playedPlatforms ?? (game.platform ? [game.platform] : []);
  const emulated = game.emulatedOn ?? [];
  const hasAbout = game.description || game.igdbRating != null || game.developer || tiles.some((t) => t.sec);
  return (
    <>
      <button className="back-button" onClick={goBack}>← Back to library</button>
      <div className="detail-hero glass" style={game.backgroundCover ? { backgroundImage: `linear-gradient(90deg, rgba(10,9,22,.95) 0%, rgba(12,13,27,.82) 48%, rgba(10,13,23,.68) 100%), url(${game.backgroundCover})` } : undefined}>
        <div className="detail-art" style={game.cover ? { backgroundImage: `linear-gradient(145deg, rgba(68,51,113,.35), rgba(38,113,123,.35)), url(${game.cover})` } : undefined}>
          {!game.cover && <Gamepad2 size={60} />}
        </div>
        <div className="detail-copy">
          <span className="status">{game.status}</span>
          <h1>{game.title}</h1>
          <p>{game.platform} · {game.genre || "Uncategorized"}</p>
          <div className="detail-actions">
            <button className="button primary" onClick={() => setEditing(true)}><PenLine size={16} /> Edit game</button>
            <button className="button soft" onClick={() => saveGame({ ...game, favorite: !game.favorite })}><Heart size={16} fill={game.favorite ? "currentColor" : "none"} /> {game.favorite ? "Favorited" : "Favorite"}</button>
            <button className="button stop" onClick={() => deleteGame(game)}><Trash2 size={16} /> Delete</button>
          </div>
        </div>
        <div className="detail-stat">
          <span>Verified time</span>
          <strong>{formatPlaytime(game.totalSeconds)}</strong>
          <small>{game.rating ? `${game.rating}/10 rating` : "Not rated yet"}</small>
        </div>
      </div>

      <div className="detail-grid">
        <section className="glass detail-panel">
          <div className="about-head">
            <div>
              <p className="eyebrow">{game.developer ? `BY ${game.developer.toUpperCase()}` : "ABOUT"}{game.releaseDate ? ` · ${formatDate(game.releaseDate)}` : ""}</p>
              <h2>About this game</h2>
            </div>
            {game.igdbRating != null && (
              <div className="score-box">
                <div className="rating-ring" style={{ "--p": game.igdbRating, "--ring": ringColor } as React.CSSProperties}>
                  <strong>{(game.igdbRating / 10).toFixed(1)}</strong>
                </div>
                <span className="score-title">IGDB SCORE</span>
                <small>{game.igdbRatingCount ? `Based on ${formatCount(game.igdbRatingCount)} ratings` : "Community score"}</small>
              </div>
            )}
          </div>

          {game.description
            ? <>
              <p className={`about-desc${expanded ? " open" : ""}`}>{game.description}</p>
              {game.description.length > 260 && <button className="text-button" style={{ marginTop: 6 }} onClick={() => setExpanded(!expanded)}>{expanded ? "Show less" : "Read more"}</button>}
            </>
            : <p className="muted">No description yet. Tap Edit game to add one.</p>}

          <div className="plat-block">
            {genreList.length > 0 && (
              <div><span className="plat-label">Genres</span><div className="igdb-chips">{genreList.map((x) => <span className="pill" key={x}>{x}</span>)}</div></div>
            )}
            {(game.platforms?.length ?? 0) > 0 && (
              <div><span className="plat-label">Released on</span><div className="igdb-chips">{game.platforms!.map((x) => <span className="pill plain" key={x}>{x}</span>)}</div></div>
            )}
            {playedOn.length > 0 && (
              <div><span className="plat-label">Played on</span>
                <div className="igdb-chips">{playedOn.map((x) => <span className={emulated.includes(x) ? "pill emu" : "pill success"} key={x}>{x}{emulated.includes(x) ? " · Emulated" : ""}</span>)}</div>
              </div>
            )}
          </div>

          {tiles.some((t) => t.sec) && (
            <div className="ttb-wrap">
              <p className="eyebrow">TIME TO BEAT</p>
              <div className="ttb-tiles">
                {tiles.map((t) => {
                  const Icon = t.icon;
                  const v = t.sec ? formatHours(t.sec).replace("h", "") : "—";
                  return (
                    <div className={`ttb-tile ${t.cls}`} key={t.label}>
                      <span className="ttb-icon"><Icon size={16} /></span>
                      <strong>{v}{t.sec ? <small>hrs</small> : null}</strong>
                      <span className="ttb-label">{t.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        <section className="glass detail-panel">
          <div className="about-head">
            <div><p className="eyebrow">MY JOURNEY</p><h2>Your progress</h2></div>
            <button className="text-button" onClick={() => setEditing(true)}><PenLine size={14} /> Edit</button>
          </div>
          <div className="journey-grid">
            <div><span>Status</span><strong>{game.status}</strong></div>
            <div><span>Playtime</span><strong>{formatPlaytime(played)}</strong></div>
            <div><span>Started</span><strong>{game.startedAt ? formatDate(game.startedAt) : "—"}</strong></div>
            <div><span>Completed</span><strong>{game.finishedAt ? formatDate(game.finishedAt) : "—"}</strong></div>
            {days != null && <div style={{ gridColumn: "span 2" }}><span>Time to finish</span><strong>{days} {days === 1 ? "day" : "days"}</strong></div>}
          </div>
          <StarRating value={game.rating} readOnly size={16} />
          <div style={{ marginTop: 12 }}><MasteryProgress value={game.mastery} readOnly /></div>
        </section>
      </div>

      <MediaSection game={game} save={saveGame} />

      <section className="glass note-card" onClick={() => setEditing(true)} title="Edit note">
        <Notebook size={15} />
        <div>
          <span className="eyebrow" style={{ margin: 0 }}>PERSONAL NOTE</span>
          <p>{game.notes || "No note yet. Tap to add one."}</p>
        </div>
        <PenLine size={14} />
      </section>

      {editing && (
        <AddGame
          initial={game}
          igdb={igdb}
          onClose={() => setEditing(false)}
          onAdd={(g) => { saveGame(g, g.status !== game.status ? { type: "status", detail: g.status } : undefined); setEditing(false); }}
        />
      )}
    </>
  );
}

function ProfileView({
  data, update, openGame,
}: {
  data: AppData;
  update: (data: AppData) => void;
  openGame: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const completed = data.games.filter((game) => game.status === "Completed");
  return (
    <>
      <Header eyebrow="YOUR PERSONAL SPACE" title="Profile" action={<button className="button soft" onClick={() => setEditing(!editing)}><PenLine size={16} /> {editing ? "Done" : "Customize"}</button>} />
      <section className="profile-banner glass">
        <div className="profile-avatar">{data.profile.displayName.slice(0, 1)}</div>
        <div className="profile-copy">
          {editing ? <input value={data.profile.displayName} onChange={(e) => update({ ...data, profile: { ...data.profile, displayName: e.target.value } })} /> : <h2>{data.profile.displayName}</h2>}
          {editing ? <textarea value={data.profile.bio} onChange={(e) => update({ ...data, profile: { ...data.profile, bio: e.target.value } })} /> : <p>{data.profile.bio}</p>}
          <span className="pill"><Sparkles size={13} /> Local collector</span>
        </div>
        <div className="profile-count"><strong>{data.games.length}</strong><span>games collected</span></div>
      </section>
      <div className="stats-row">
        <Stat label="Total games" value={String(data.games.length)} hint="in collection" icon={<Gamepad2 />} />
        <Stat label="Completed" value={String(completed.length)} hint="adventures finished" icon={<Check />} />
        <Stat label="Playtime" value={formatPlaytime(data.games.reduce((sum, game) => sum + game.totalSeconds, 0))} hint="across all games" icon={<Clock3 />} />
      </div>
      <section className="section">
        <div className="section-title"><div><p className="eyebrow">HIGHLIGHTS</p><h2>Recently completed</h2></div></div>
        {completed.length
          ? <div className="mini-grid">{completed.slice(0, 4).map((game) => <GameMini key={game.id} game={game} onClick={() => openGame(game.id)} />)}</div>
          : <Empty icon={<Check />} title="Your first finish is waiting" text="Completed games will be featured here." />
        }
      </section>
    </>
  );
}
function JournalView({ data, update }: { data: AppData; update: (data: AppData) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const add = () => {
    if (!title.trim() || !body.trim()) return;
    update({ ...data, journal: [{ id: crypto.randomUUID(), title: title.trim(), body: body.trim(), mood: "reflective", createdAt: now() }, ...data.journal] });
    setTitle(""); setBody("");
  };
  return (
    <>
      <Header eyebrow="PRIVATE THOUGHTS" title="Journal" action={<button className="button primary" onClick={add}><PenLine size={16} /> Save entry</button>} />
      <div className="journal-compose glass">
        <input placeholder="Entry title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea placeholder="What is on your mind?" value={body} onChange={(e) => setBody(e.target.value)} />
      </div>
      <div className="journal-list">
        {data.journal.map((entry) => (
          <article className="journal-entry glass" key={entry.id}>
            <span className="eyebrow">{new Date(entry.createdAt).toLocaleDateString()}</span>
            <h2>{entry.title}</h2>
            <p>{entry.body}</p>
          </article>
        ))}
        {!data.journal.length && <Empty icon={<BookOpen />} title="Your journal is blank" text="Capture a thought after your next game." />}
      </div>
    </>
  );
}
function SettingsView({ data, update }: { data: AppData; update: (data: AppData) => void }) {
  const updateSettings = (partial: Partial<AppSettings>) => {
    update({
      ...data,
      settings: { ...data.settings, ...partial },
    });
  };

  return (
    <>
      <Header eyebrow="WORKSPACE CONTROL" title="Settings" />
      <div className="settings-grid">
        <section className="glass settings-panel">
          <p className="eyebrow">PREFERENCES & APPEARANCE</p>
          <h2>Preferences</h2>
          <div className="setting-row">
            <div><strong>Active theme</strong><span>Aurora glass aesthetic</span></div>
            <span className="pill"><Sparkles size={13} /> Aurora</span>
          </div>
          <div className="setting-row">
            <div><strong>Default library style</strong><span>Choose how your collection displays</span></div>
            <select value={data.settings.libraryLayout ?? "ps4"} onChange={(e) => updateSettings({ libraryLayout: e.target.value as LibraryLayout })}>
              <option value="ps4">PS4 Ribbon Carousel</option>
              <option value="catalog">Catalog Cover Grid</option>
            </select>
          </div>
          <div className="setting-row">
            <div><strong>Catalog cover size</strong><span>Default size for grid cards</span></div>
            <select value={data.settings.gridSize ?? "md"} onChange={(e) => updateSettings({ gridSize: e.target.value as GridSize })}>
              <option value="sm">Small (Compact)</option>
              <option value="md">Medium (Balanced)</option>
              <option value="lg">Large (Poster)</option>
            </select>
          </div>
          <div className="setting-row">
            <div><strong>Default sorting</strong><span>Default order for collection</span></div>
            <select value={data.settings.librarySort ?? "recent"} onChange={(e) => updateSettings({ librarySort: e.target.value as LibrarySort })}>
              <option value="recent">Recently added</option>
              <option value="title">Alphabetical (Title)</option>
              <option value="playtime">Playtime</option>
            </select>
          </div>
          <div className="setting-row">
            <div><strong>Startup view</strong><span>Workspace section on launch</span></div>
            <select value={data.settings.defaultView ?? "library"} onChange={(e) => updateSettings({ defaultView: e.target.value as View })}>
              <option value="library">Library</option>
              <option value="dashboard">Overview (Dashboard)</option>
              <option value="activity">Activity log</option>
              <option value="profile">Profile</option>
              <option value="journal">Journal</option>
            </select>
          </div>
          <div className="setting-row">
            <div><strong>Automatic playtime tracking</strong><span>Record active game session duration</span></div>
            <input type="checkbox" checked={data.settings.automaticTracking ?? true} onChange={(e) => updateSettings({ automaticTracking: e.target.checked })} />
          </div>
          <div className="setting-row">
            <div><strong>Timer sound</strong><span>Play subtle chime when session timers finish</span></div>
            <input type="checkbox" checked={data.settings.timerSound ?? true} onChange={(e) => updateSettings({ timerSound: e.target.checked })} />
          </div>
        </section>
        <section className="glass settings-panel">
          <p className="eyebrow">GAME DATABASE</p>
          <h2>IGDB connection</h2>
          <div className="setting-row">
            <div><strong>Client ID</strong><span>From dev.twitch.tv/console</span></div>
            <input style={{ width: 240 }} value={data.settings.igdbClientId ?? ""} onChange={(e) => updateSettings({ igdbClientId: e.target.value.trim() })} />
          </div>
          <div className="setting-row">
            <div><strong>Client Secret</strong><span>Stored locally only</span></div>
            <input style={{ width: 240 }} type="password" value={data.settings.igdbClientSecret ?? ""} onChange={(e) => updateSettings({ igdbClientSecret: e.target.value.trim() })} />
          </div>
        </section>
        <section className="glass settings-panel">
          <p className="eyebrow">LOCAL SQLITE STORAGE</p>
          <h2>Your data stays yours</h2>
          <p className="muted">SQLite database: <strong>lost-in-sync.sqlite</strong></p>
          <p className="muted">All your games, preferences, journal entries, and profile settings are stored locally in the native SQLite backend.</p>
          <div className="detail-actions">
            <button className="button soft" onClick={() => {
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
              const link = document.createElement("a");
              link.href = URL.createObjectURL(blob);
              link.download = `lost-in-sync-backup-${new Date().toISOString().slice(0, 10)}.json`;
              link.click();
              URL.revokeObjectURL(link.href);
            }}><BookOpen size={15} /> Export backup</button>
            <label className="button soft">Import backup
              <input type="file" accept="application/json" hidden onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                void file.text().then((text) => { try { update(JSON.parse(text) as AppData); } catch { window.alert("That backup file is not valid Lost in Sync data."); } });
              }} />
            </label>
          </div>
          <span className="pill success"><Check size={13} /> SQLite connected & synchronized</span>
        </section>
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
