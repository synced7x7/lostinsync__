import React, { StrictMode, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, lazy, Suspense, memo } from "react";
import { librarySession, libraryDefaults, prefsToSettings, type LibraryPrefs } from "./domain/library-session";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Filter,
  Gamepad2,
  Grid2X2,
  Heart,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Monitor,
  PenLine,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Trophy,
  Trash2,
  Notebook,
  ArrowDown,
  ArrowUp,
  Building2,
  CalendarDays,
  Star,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createAppRepository } from "./data/repository";
import {
  defaultData,
  formatCount,
  formatHours,
  formatPlaytime,
  STATUSES,
  type SortDirection,
  type AppData,
  type AppSettings,
  type Game,
  type GridSize,
  type LibrarySort,
  type Status,
  type View,
} from "./domain/game";
import "./style.css";
import { Empty, formatDate, TrophyToggle, StarRating } from "./components/shared";
import { AppLayout } from "./components/layout";
import { Dashboard } from "./features/dashboard";
import { AddGame } from "./features/library-components";
import { MediaSection } from "./features/media";
import { SeriesButton } from "./features/series";
import { JourneyView } from "./features/journey";
import { CollectionActions, ProfileSection } from "./features/overview";
import { SettingsView } from "./features/settings";
import { TrophiesView } from "./features/trophies";
import { DiscoverView } from "./features/discover";
import { DiscoverGameDetails } from "./features/discover";
import { igdbDetailsCached, type IgdbGame } from "./data/igdb";
import { useLayoutEffect } from "react";
import { GAME_TYPES, UNSET_TYPE, matchesGameType } from "./domain/gametype";
import { BundleContents, isBundle } from "./features/bundle";

const repo = createAppRepository();

const GAME_OF_THE_YEAR_WINNERS = [
  "Clair Obscur: Expedition 33", "Astro Bot", "Baldur's Gate 3", "Elden Ring",
  "It Takes Two", "The Last of Us Part II", "Sekiro: Shadows Die Twice",
  "God of War", "The Legend of Zelda: Breath of the Wild", "Overwatch",
  "The Witcher 3: Wild Hunt", "Dragon Age: Inquisition", "Grand Theft Auto V",
  "The Walking Dead", "The Elder Scrolls V: Skyrim", "Red Dead Redemption",
  "Uncharted 2: Among Thieves", "Grand Theft Auto IV", "BioShock",
  "The Elder Scrolls IV: Oblivion", "Resident Evil 4", "Grand Theft Auto: San Andreas",
  "Madden NFL 2004",
] as const;

function App() {
  const [data, setData] = useState<AppData>(defaultData);
  const location = useLocation();
  const navigate = useNavigate();
  const view = (location.pathname.slice(1) || "dashboard") as View;
  const setView = (next: View) =>
    navigate(next === "dashboard" ? "/" : `/${next}`);
  const routeGameId = new URLSearchParams(location.search).get("game") ?? undefined;
  const routeDiscoverId = Number(new URLSearchParams(location.search).get("igdb")) || undefined;
  const [selectedId, setSelectedId] = useState<string | undefined>(routeGameId);
  const [libraryFocusId, setLibraryFocusId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [discoverGame, setDiscoverGame] = useState<IgdbGame>();
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [error, setError] = useState("");
  const dataRef = useRef(data);

  dataRef.current = data;
  useEffect(() => {
    const root = document.documentElement;
    const enter = () => {
      if (!document.fullscreenElement && root.requestFullscreen) {
        void root.requestFullscreen().catch(() => undefined);
      }
    };
    const toggle = (event: KeyboardEvent) => {
      if (event.key !== "F11") return;
      event.preventDefault();
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      } else {
        enter();
      }
    };
    const onFirstInteraction = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key === "F11") return;
      enter();
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
    };

    window.addEventListener("keydown", toggle);
    window.addEventListener("pointerdown", onFirstInteraction, { once: true });
    window.addEventListener("keydown", onFirstInteraction, { once: true });
    enter();
    return () => {
      window.removeEventListener("keydown", toggle);
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
    };
  }, []);
  useEffect(() => {
    if (location.pathname === "/profile") navigate("/");
  }, [location.pathname, navigate]);
  useEffect(() => {
    if (view === "details" && routeGameId && routeGameId !== selectedId) {
      setSelectedId(routeGameId);
    }
  }, [routeGameId, selectedId, view]);
  useEffect(() => {
    if (view === "details") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [view, selectedId]);
  useEffect(() => {
    if (view !== "details" || !routeDiscoverId) return;
    const creds = { clientId: data.settings.igdbClientId ?? "", clientSecret: data.settings.igdbClientSecret ?? "" };
    setDiscoverLoading(true);
    void igdbDetailsCached(routeDiscoverId, creds)
      .then(setDiscoverGame)
      .catch(() => setDiscoverGame(undefined))
      .finally(() => setDiscoverLoading(false));
  }, [view, routeDiscoverId, data.settings.igdbClientId, data.settings.igdbClientSecret]);
  useEffect(() => {
    repo
      .load()
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load data.")
      )
      .finally(() => setLoading(false));
  }, []);
  

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pendingSave = useRef<AppData | null>(null);

  const flushSave = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = undefined; }
    const next = pendingSave.current;
    if (!next) return;
    pendingSave.current = null;
    void repo.save(next).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "Could not save data.")
    );
  }, []);

  const update = (next: AppData) => {
    setData(next);
    pendingSave.current = next;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 500);
  };

  useEffect(() => {
    const onHide = () => { if (document.hidden) flushSave(); };
    window.addEventListener("pagehide", flushSave);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flushSave);
      document.removeEventListener("visibilitychange", onHide);
      flushSave();
    };
  }, [flushSave]);
  const addGame = (game: Game) =>
    update({
      ...data,
      games: [game, ...data.games],
    });


  const saveGame = (
    game: Game,
  ) => {
    update({
      ...data,
      games: data.games.map((item) => (item.id === game.id ? game : item)),
    });
  };
  const deleteGame = (game: Game) => {
    update({
      ...data,
      games: data.games.filter((item) => item.id !== game.id),
    });
    setSelectedId(undefined);
    setView("library");
  };
  const selected = data.games.find((game) => game.id === selectedId);
  const openGame = (id: string) => {
    setSelectedId(id);
    navigate(`/details?game=${encodeURIComponent(id)}`);
  };
  if (loading)
    return (
      <div className="boot">
        <Sparkles size={30} />
        <span>Preparing your library...</span>
      </div>
    );
  return (
    <AppLayout
      data={data}
      view={view}
      onNavigate={setView}
      error={error}
    >
      {view === "dashboard" && <Dashboard data={data} update={update} openLibrary={() => setView("library")} openGame={openGame} openDiscoverGame={(id) => navigate(`/details?igdb=${id}`)} profile={<ProfileSection data={data} update={update} />} />}{" "}
      {view === "library" && (
        <LibraryView data={data} update={update} addGame={addGame} saveGame={saveGame} deleteGame={deleteGame} openGame={openGame} focusedGameId={libraryFocusId} onFocusedGameChange={setLibraryFocusId} />
      )}{" "}
      {view === "discover" && <DiscoverView data={data} />}{" "}
      {view === "journey" && (
        <JourneyView
          games={data.games}
          openGame={openGame}
        />
      )}{" "}
      {view === "trophies" && <TrophiesView data={data} />}{" "}
      {view === "stats" && <Suspense fallback={null}><StatsView data={data} /></Suspense>}
      {view === "details" && routeDiscoverId && (
        <DiscoverGameDetails
          game={discoverGame}
          loading={discoverLoading}
          close={() => setView("discover")}
          openGame={(id) => navigate(`/details?igdb=${id}`)}
          credentials={{ clientId: data.settings.igdbClientId ?? "", clientSecret: data.settings.igdbClientSecret ?? "" }}
          savedGame={data.games.find((game) => game.igdbId === routeDiscoverId)}
          data={data}
          update={update}
          onAdd={addGame}
          onSave={saveGame}
          onDelete={deleteGame}
          igdbId={routeDiscoverId}
          DetailsView={Details}
        />
      )}{" "}
      {view === "details" && !routeDiscoverId && selected && (
        <Details game={selected} data={data} update={update} saveGame={saveGame} deleteGame={deleteGame} goBack={() => setView("library")} onOpenGame={(id) => navigate(`/details?igdb=${id}`)} igdb={{ clientId: data.settings.igdbClientId ?? "", clientSecret: data.settings.igdbClientSecret ?? "" }} />
      )}{" "}
      {view === "settings" && <SettingsView data={data} update={update} />}{" "}
    </AppLayout>
  );
}

const StatsView = lazy(() => import("./features/stats").then((m) => ({ default: m.StatsView })));

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const tsCache = new Map<string, number>();
const dp = (s?: string) => {
  if (!s) return 0;
  let v = tsCache.get(s);
  if (v === undefined) { v = Date.parse(s) || 0; tsCache.set(s, v); }
  return v;
};

function compareGames(a: Game, b: Game, sort: LibrarySort, direction: SortDirection): number {
  const m = direction === "asc" ? 1 : -1;
  switch (sort) {
    case "title": return m * collator.compare(a.title, b.title);
    case "recent": return m * (dp(a.createdAt) - dp(b.createdAt));
    case "completion": return m * (dp(a.finishedAt) - dp(b.finishedAt));
    case "playtime": return m * (a.totalSeconds - b.totalSeconds);
    case "rating": return m * ((a.rating ?? 0) - (b.rating ?? 0));
    case "igdbRating": return m * ((a.igdbRating ?? 0) - (b.igdbRating ?? 0));
    case "releaseDate": return m * (dp(a.releaseDate) - dp(b.releaseDate));
    case "avgTime": return m * ((a.timeAvgSeconds ?? 0) - (b.timeAvgSeconds ?? 0));
    case "mainTime": return m * ((a.timeMainSeconds ?? 0) - (b.timeMainSeconds ?? 0));
    case "fullTime": return m * ((a.timeFullSeconds ?? 0) - (b.timeFullSeconds ?? 0));
  }
}

const formatSpan = (from: string, to: string) => {
  const a = new Date(from), b = new Date(to);
  let y = b.getFullYear() - a.getFullYear();
  let m = b.getMonth() - a.getMonth();
  let d = b.getDate() - a.getDate() + 1; // inclusive, same as before
  if (d > new Date(b.getFullYear(), b.getMonth() + 1, 0).getDate()) { d = 1; m += 1; }
  if (d <= 0) {
    m -= 1;
    d += new Date(b.getFullYear(), b.getMonth(), 0).getDate();
  }
  if (m < 0) { y -= 1; m += 12; }
  const parts = [
    y > 0 && `${y} ${y === 1 ? "year" : "years"}`,
    m > 0 && `${m} ${m === 1 ? "month" : "months"}`,
    d > 0 && `${d} ${d === 1 ? "day" : "days"}`,
  ].filter(Boolean);
  return parts.join("  ") || "1 day";
};

function LibraryView({
  data, update, addGame, saveGame, openGame, focusedGameId, onFocusedGameChange,
}: {
  data: AppData;
  update: (data: AppData) => void;
  addGame: (game: Game) => void;
  saveGame: (game: Game) => void;
  deleteGame: (game: Game) => void;
  openGame: (id: string) => void;
  focusedGameId?: string;
  onFocusedGameChange: (id: string) => void;
}) {
  const [query, setQueryState] = useState(librarySession.query);
  const setQuery = (value: string) => { librarySession.query = value; setQueryState(value); };
  const [showAdd, setShowAdd] = useState(false);
  const [showFullscreenFilters, setShowFullscreenFilters] = useState(false);
  const [prefs, setPrefs] = useState<LibraryPrefs>(() => (librarySession.prefs ??= libraryDefaults(data.settings)));
  const { filter, gameType: typeFilter, favoritesOnly, sort, direction: sortDirection, layout, fullscreen, gridSize } = prefs;
  const deferredQuery = useDeferredValue(query);

  // Same name/call sites as before, but now session-only: no save, no app-wide re-render
  const updateSettings = (partial: Partial<AppSettings>) => {
    const next = libraryDefaults({ ...prefsToSettings(prefs), ...partial });
    librarySession.prefs = next;
    setPrefs(next);
  };

  const games = useMemo(() => {
    const q = deferredQuery.toLowerCase();
    return data.games
      .filter((g) => (filter === "All" || g.status === filter) && matchesGameType(g.gameType, typeFilter) && (!favoritesOnly || g.favorite) && g.title.toLowerCase().includes(q))
      .sort((a, b) => compareGames(a, b, sort, sortDirection));
  }, [data.games, filter, typeFilter, favoritesOnly, deferredQuery, sort, sortDirection]);
  const sortOptions: { value: LibrarySort; label: string }[] = [
    { value: "recent", label: "When added" },
    { value: "completion", label: "Last played (Completion Time)" },
    { value: "playtime", label: "Time played" },
    { value: "rating", label: "User rating" },
    { value: "igdbRating", label: "IGDB rating" },
    { value: "title", label: "Title" },
    { value: "releaseDate", label: "Release date" },
    { value: "avgTime", label: "Avg time to complete" },
    { value: "mainTime", label: "Main story completion time" },
    { value: "fullTime", label: "100% completion time" },
  ];
  const toggleSortDirection = () => updateSettings({ librarySortDirection: sortDirection === "asc" ? "desc" : "asc" });
  const sortControl = (
    <>
      <select value={sort} onChange={(e) => updateSettings({ librarySort: e.target.value as LibrarySort })}>
        {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <button className="icon-btn" onClick={toggleSortDirection} title={sortDirection === "asc" ? "Ascending" : "Descending"} aria-label={`Sort ${sortDirection === "asc" ? "ascending" : "descending"}`}>
        {sortDirection === "asc" ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
      </button>
    </>
  );

  const typeControl = (
    <select value={typeFilter} onChange={(e) => updateSettings({ libraryGameType: e.target.value })} title="Filter by game type" aria-label="Filter by game type">
      <option value="All">All types</option>
      {GAME_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
      <option value={UNSET_TYPE}>Type not set</option>
    </select>
  );

  const fullscreenActions = fullscreen && (
    <div className="ps4-fullscreen-actions">
      <button className="icon-btn glass" onClick={() => setShowFullscreenFilters((open) => !open)} title="Show library filters">
        <SlidersHorizontal size={17} />
      </button>
      <button className="icon-btn glass" onClick={() => updateSettings({ libraryFullscreen: false })} title="Exit fullscreen shelf view">
        <Minimize2 size={17} />
      </button>
      {showFullscreenFilters && (
        <div className="ps4-fullscreen-filter-panel glass">
          <div className="search-field">
            <Search size={17} />
            <input placeholder="Search your collection..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select value={filter} onChange={(e) => updateSettings({ libraryFilter: e.target.value as Status | "All" })}>
            <option value="All">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          {typeControl}
          {sortControl}
          <button className={favoritesOnly ? "icon-btn active" : "icon-btn"} onClick={() => updateSettings({ libraryFavoritesOnly: !favoritesOnly })} title="Favorite games only" aria-label="Favorite games only">
            <Heart size={16} fill={favoritesOnly ? "currentColor" : "none"} />
          </button>
          <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Add game</button>
        </div>
      )}
    </div>
  );
  const featured = games.find((g) => g.id === focusedGameId) ?? games[0];
  const openLibraryGame = (id: string) => {
    openGame(id);
  };
  return (
    <>
      {!fullscreen && <div className="library-heading">
        <div><p className="eyebrow">YOUR COLLECTION · {data.games.length} GAMES</p><h1>Library</h1></div>
        <button className="button primary" onClick={() => setShowAdd(true)}><Plus size={17} /> Add game</button>
      </div>}
      {!fullscreen && <div className="toolbar library-toolbar glass">
        <div className="search-field">
          <Search size={17} />
          <input placeholder="Search your collection..." value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="toolbar-actions">
          <select value={filter} onChange={(e) => updateSettings({ libraryFilter: e.target.value as Status | "All" })}>
            <option value="All">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          {typeControl}
          {sortControl}
          <button className={favoritesOnly ? "icon-btn active" : "icon-btn"} onClick={() => updateSettings({ libraryFavoritesOnly: !favoritesOnly })} title="Favorite games only" aria-label="Favorite games only">
            <Heart size={16} fill={favoritesOnly ? "currentColor" : "none"} />
          </button>
          <button className={fullscreen ? "icon-btn active" : "icon-btn"} onClick={() => { updateSettings({ libraryLayout: "ps4", libraryFullscreen: true }); setShowFullscreenFilters(false); }} title="Fullscreen shelf view">
            <Maximize2 size={17} />
          </button>
          <button className={layout === "ps4" ? "icon-btn active" : "icon-btn"} onClick={() => updateSettings({ libraryLayout: "ps4" })} title="PS4 shelf view">
            <Monitor size={17} />
          </button>
          <button className={layout === "catalog" ? "icon-btn active" : "icon-btn"} onClick={() => updateSettings({ libraryLayout: "catalog", libraryFullscreen: false })} title="Catalog grid view">
            <LayoutGrid size={17} />
          </button>
        </div>
      </div>}
      {fullscreenActions}
      {games.length === 0
        ? <Empty icon={<Filter />} title="Nothing here yet" text="Try another search or add your first game." action={() => setShowAdd(true)} />
        : layout === "ps4"
          ? <div className={fullscreen ? "ps4-fullscreen-shell" : undefined}>
            <PS4ShelfView fullscreen={fullscreen} games={games} featured={featured} focusedGameId={focusedGameId} onFocusedGameChange={onFocusedGameChange} openGame={openLibraryGame} saveGame={saveGame} keyboardEnabled={!showAdd} />
          </div>
          : <GridLibraryView games={games} openGame={openLibraryGame} saveGame={saveGame} gridSize={gridSize} setGridSize={(size) => updateSettings({ gridSize: size })} />
      }
      {showAdd && <AddGame igdb={{ clientId: data.settings.igdbClientId ?? "", clientSecret: data.settings.igdbClientSecret ?? "" }} onClose={() => setShowAdd(false)} onAdd={(game) => { addGame(game); setShowAdd(false); }} />}
    </>
  );
}

// Adjust these values to change the size falloff around the focused PS4 card.
const PS4_CARD_SCALES: Record<number, number> = {
  0: 1.4,
  1: 1.2,
  2: 1.1,
};

const PS4_CARD_LIFTS: Record<number, number> = {
  0: 12,
  1: 6,
  2: 3,
};

const PS4_NEIGHBOR_HOVER_BOOST = 0.08;

const PS4_BUFFER = 8; // cards kept mounted beyond each screen edge
const PS4_STEP = 6;   // the window moves in steps of this many cards
const PS4_CAP = Math.max(Object.keys(PS4_CARD_SCALES).length, Object.keys(PS4_CARD_LIFTS).length) + 1;

const PS4Card = memo(function PS4Card({
  game, idx, distance, onClick,
}: { game: Game; idx: number; distance: number; onClick: (game: Game, idx: number) => void }) {
  const isFocused = distance === 0;
  return (
    <motion.button
      className={`ps4-card${isFocused ? " ps4-card--focused" : ""}`}
      onClick={() => onClick(game, idx)}
      animate={{
        scale: PS4_CARD_SCALES[distance] ?? 1,
        zIndex: distance === 0 ? 20 : distance === 1 ? 10 : distance === 2 ? 5 : 1,
        y: -(PS4_CARD_LIFTS[distance] ?? 0),
      }}
      transition={{ type: "spring", stiffness: 360, damping: 28 }}
      whileHover={!isFocused
        ? {
          scale: distance <= 2
            ? (PS4_CARD_SCALES[distance] ?? 1) + PS4_NEIGHBOR_HOVER_BOOST
            : 1.08,
          y: distance <= 2 ? -(PS4_CARD_LIFTS[distance] ?? 0) - 4 : -4,
        }
        : {}}
    >
      <div className="ps4-card-art" style={game.cover ? { backgroundImage: `url(${game.cover})` } : undefined}>
        {!game.cover && <div className="grid-card-fallback"><Gamepad2 size={28} style={{ marginTop: 8 }} />  <span style={{ fontSize: "12px" }}>{game.title}</span></div>}
      </div>
      {isFocused && <div className="ps4-card-focus-ring" />}
    </motion.button>
  );
});

function PS4ShelfView({
  games, featured, focusedGameId, onFocusedGameChange, openGame, saveGame, fullscreen, keyboardEnabled = true,
}: {
  games: Game[];
  featured: Game | undefined;
  focusedGameId?: string;
  onFocusedGameChange: (id: string) => void;
  openGame: (id: string) => void;
  saveGame: (g: Game) => void;
  fullscreen?: boolean;
  keyboardEnabled?: boolean;
}) {
  const [focusedIdx, setFocusedIdx] = useState(() => {
    const index = games.findIndex((game) => game.id === focusedGameId);
    return index >= 0 ? index : 0;
  });
  const [win, setWin] = useState(() => ({ a: Math.max(0, focusedIdx - 20), b: focusedIdx + 20 }));
  const [m, setM] = useState({ pitch: 124, gap: 12, w: 112, padL: 36 });
  const mref = useRef(m);
  mref.current = m;
  const total = games.length;

  const shelfRef = useRef<HTMLDivElement>(null);
  const scrollTargetRef = useRef(0);
  const scrollRafRef = useRef(0);
  const lastClickRef = useRef<{ index: number; time: number }>({ index: -1, time: 0 });
  const lastPitch = useRef(0);
  const openRef = useRef(openGame);
  const focusCbRef = useRef(onFocusedGameChange);
  openRef.current = openGame;
  focusCbRef.current = onFocusedGameChange;

  const startScrollAnimation = useCallback(() => {
    if (scrollRafRef.current) return;
    const tick = () => {
      const shelf = shelfRef.current;
      if (!shelf) {
        scrollRafRef.current = 0;
        return;
      }
      const diff = scrollTargetRef.current - shelf.scrollLeft;
      if (Math.abs(diff) < 0.5) {
        shelf.scrollLeft = scrollTargetRef.current;
        scrollRafRef.current = 0;
        return;
      }
      shelf.scrollLeft += diff * 0.22;
      scrollRafRef.current = requestAnimationFrame(tick);
    };
    scrollRafRef.current = requestAnimationFrame(tick);
  }, []);

  // which cards are on screen (+ buffer); only changes in coarse steps
  const updateWin = useCallback(() => {
    const shelf = shelfRef.current;
    if (!shelf) return;
    const { pitch, padL } = mref.current;
    const first = Math.floor((shelf.scrollLeft - padL) / pitch);
    const last = Math.ceil((shelf.scrollLeft + shelf.clientWidth - padL) / pitch);
    const a = Math.max(0, Math.floor((first - PS4_BUFFER) / PS4_STEP) * PS4_STEP);
    const b = Math.min(total, Math.ceil((last + PS4_BUFFER) / PS4_STEP) * PS4_STEP);
    setWin((w) => (w.a === a && w.b === b ? w : { a, b }));
  }, [total]);

  // measure the real card pitch (width + margins + gap) from CSS, so it works in fullscreen too
  useLayoutEffect(() => {
    const shelf = shelfRef.current;
    if (!shelf) return;
    const measure = () => {
      const card = shelf.querySelector<HTMLElement>(".ps4-card");
      if (!card) return;
      const cs = getComputedStyle(card);
      const rs = getComputedStyle(shelf);
      const w = parseFloat(cs.width) || card.offsetWidth;
      const gap = (parseFloat(rs.columnGap) || 0) + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
      const padL = parseFloat(rs.paddingLeft) || 0;
      setM((o) => (o.w === w && o.gap === gap && o.padL === padL ? o : { w, gap, padL, pitch: w + gap }));
    };
    measure();
    const ro = new ResizeObserver(() => { measure(); updateWin(); });
    ro.observe(shelf);
    return () => ro.disconnect();
  }, [fullscreen, total > 0, updateWin]);

  useLayoutEffect(() => { updateWin(); }, [updateWin]);

  const focusedGame = games[focusedIdx] ?? games[0];
  useEffect(() => {
    if (focusedGame) onFocusedGameChange(focusedGame.id);
  }, [focusedGame?.id, onFocusedGameChange]);

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setFocusedIdx((p) => Math.min(p + 1, games.length - 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setFocusedIdx((p) => Math.max(p - 1, 0));
    }
  }, [games.length]);

  const handleCardClick = useCallback((game: Game, idx: number) => {
    const now = performance.now();
    const previous = lastClickRef.current;
    const isDoubleClick = previous.index === idx && now - previous.time < 400;
    lastClickRef.current = { index: idx, time: now };
    setFocusedIdx(idx);
    focusCbRef.current(game.id);
    if (isDoubleClick) openRef.current(game.id);
  }, []);

  useEffect(() => {
    if (!keyboardEnabled) return;
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey, keyboardEnabled]);

  useEffect(() => {
    const shelf = shelfRef.current;
    if (!shelf) return;
    shelf.style.scrollBehavior = "auto";
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * 3;
      const max = shelf.scrollWidth - shelf.clientWidth;
      scrollTargetRef.current = Math.max(0, Math.min(max, scrollTargetRef.current + delta));
      startScrollAnimation();
    };
    const onScroll = () => {
      if (!scrollRafRef.current) scrollTargetRef.current = shelf.scrollLeft;
      updateWin();
    };
    shelf.addEventListener("wheel", onWheel, { passive: false });
    shelf.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      shelf.removeEventListener("wheel", onWheel);
      shelf.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(scrollRafRef.current);
      scrollRafRef.current = 0;
    };
  }, [startScrollAnimation, updateWin]);

  // centre the focused card by index (the card may not be mounted); jump instantly on first placement
  useLayoutEffect(() => {
    const shelf = shelfRef.current;
    if (!shelf || !total) return;
    const { pitch, w, padL } = m;
    const max = Math.max(0, shelf.scrollWidth - shelf.clientWidth);
    const target = Math.max(0, Math.min(max, padL + focusedIdx * pitch + w / 2 - shelf.clientWidth / 2));
    scrollTargetRef.current = target;
    if (lastPitch.current !== pitch) {
      lastPitch.current = pitch;
      shelf.scrollLeft = target;
      updateWin();
    } else {
      startScrollAnimation();
    }
  }, [focusedIdx, m.pitch, total, startScrollAnimation, updateWin]);

  const shown = games.slice(win.a, win.b);
  const end = Math.min(win.b, total);
  const lead = win.a > 0 ? win.a * m.pitch - m.gap : 0;
  const trail = end < total ? (total - end) * m.pitch - m.gap : 0;

  return (
    <>
      <div className={`ps4-library${fullscreen ? " ps4-library--fullscreen" : ""}`}>
        <AnimatePresence mode="wait">
          {featured && (
            <motion.div
              key={featured.id}
              className="ps4-bg"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              style={featured.backgroundCover ? { backgroundImage: `url(${featured.backgroundCover})` } : undefined}
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
              <h2
                className={`ps4-title${featured.title.length > 30 ? " ps4-title--long" : ""}`}
                title={featured.title}
              >
                {featured.title}
              </h2>
              <p className="ps4-meta">{featured.platform}<span> · </span>{featured.genre || "Uncategorized"}<span> · </span>{formatDate(featured.releaseDate)}</p>
              <div className="ps4-actions">
                {featured.rating && <span className="ps4-rating">{featured.rating}<small>/10</small></span>}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="ps4-shelves">
          <div className="ps4-shelf-row" ref={shelfRef}>
            {lead > 0 && <div className="ps4-spacer" style={{ width: lead }} />}
            {shown.map((game, k) => {
              const idx = win.a + k;
              return (
                <PS4Card
                  key={game.id}
                  game={game}
                  idx={idx}
                  distance={Math.min(Math.abs(focusedIdx - idx), PS4_CAP)}
                  onClick={handleCardClick}
                />
              );
            })}
            {trail > 0 && <div className="ps4-spacer" style={{ width: trail }} />}
          </div>
        </div>
      </div>
      <div className="ps4-nav-hint">
        <ChevronLeft size={13} /><ChevronRight size={13} /><span>Scroll / Arrow keys to explore · Double-click to open</span>
      </div>
    </>
  );
}

// Session-only memory of the catalog grid. Lives in memory, never saved, gone when the app closes.
const gridSession = { scrollY: 0, visible: 40 };
// Session-only memory of the library search box. Never saved, gone when the app closes.


function GridLibraryView({
  games, openGame, saveGame, gridSize, setGridSize,
}: {
  games: Game[];
  openGame: (id: string) => void;
  saveGame: (g: Game) => void;
  gridSize: GridSize;
  setGridSize: (size: GridSize) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(() => Math.max(40, gridSession.visible));
  useLayoutEffect(() => {
    const y = gridSession.scrollY;
    if (!y) return;
    gridSession.scrollY = 0; // use it once
    let tries = 0, raf = 0;
    const restore = () => {
      window.scrollTo({ top: y, left: 0, behavior: "auto" });
      if (Math.abs(window.scrollY - y) > 2 && tries++ < 20) raf = requestAnimationFrame(restore); // wait for covers/layout to settle
    };
    restore();
    return () => cancelAnimationFrame(raf);
  }, []);
  const visibleRef = useRef(visibleCount); visibleRef.current = visibleCount;
  const openRef = useRef(openGame); openRef.current = openGame;
  const open = useCallback((id: string) => {
    gridSession.scrollY = window.scrollY;
    gridSession.visible = visibleRef.current;
    openRef.current(id);
  }, []);
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
          <GridCard key={game.id} game={game} gridSize={gridSize} onOpen={open} />
        ))}
      </div>
      <div ref={sentinelRef} style={{ height: 1 }} />
      {visibleCount < games.length && (
        <div className="grid-lib-loading"><Sparkles size={15} /><span>Loading more...</span></div>
      )}
    </div>
  );
}

const GridCard = memo(function GridCard({
  game, gridSize, onOpen, onSave,
}: {
  game: Game;
  gridSize: GridSize;
  onOpen: (id: string) => void;
  onSave?: (g: Game) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div data-game-id={game.id} className="grid-card"
      onHoverStart={() => setHovered(true)} onHoverEnd={() => setHovered(false)}
      animate={hovered ? { scale: 1.07, zIndex: 20 } : { scale: 1, zIndex: 1 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      onClick={() => onOpen(game.id)}
    >
      <div className="grid-card-art" style={game.cover ? { backgroundImage: `url(${game.cover})` } : undefined}>
        {!game.cover && (
          <div className="grid-card-fallback">
            <Gamepad2 size={gridSize === "lg" ? 66 : gridSize === "md" ? 46 : 28} />
            <span>{game.title}</span>
          </div>
        )}
        <AnimatePresence>
          {hovered && (
            <motion.div className="grid-card-hover-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} />
          )}
        </AnimatePresence>
      </div>
      <motion.div className="grid-card-glow-border" animate={hovered ? { opacity: 1 } : { opacity: 0 }} transition={{ duration: 0.18 }} />
    </motion.div>
  );
});


function Details({
  game, data, update, saveGame, deleteGame, goBack, onOpenGame, igdb, backLabel, extra,
}: {
  game: Game;
  data: AppData;
  update: (data: AppData) => void;
  saveGame: (game: Game) => void;
  deleteGame: (game: Game) => void;
  goBack: () => void;
  onOpenGame: (id: number) => void;
  igdb: { clientId: string; clientSecret: string };
  backLabel?: string;
  extra?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);
  const [canExpand, setCanExpand] = useState(false);
  useEffect(() => {
    const el = descRef.current;
    if (!el || expanded) return;
    const check = () => setCanExpand(el.scrollHeight > el.clientHeight + 1);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [game.description, expanded]);
  const played = game.totalSeconds;
  const span = game.startedAt && game.finishedAt ? formatSpan(game.startedAt, game.finishedAt) : undefined;
  const ringColor = (game.igdbRating ?? 0) >= 75 ? "var(--success)" : (game.igdbRating ?? 0) >= 50 ? "#f4c679" : "var(--rose)";
  const tiles = [
    { label: "Average to complete", sec: game.timeAvgSeconds, icon: Timer, cls: "avg" },
    { label: "Main story", sec: game.timeMainSeconds, icon: BookOpen, cls: "main" },
    { label: "100% completion", sec: game.timeFullSeconds, icon: Trophy, cls: "full" },
  ];
  const genreList = game.genres?.length ? game.genres : game.genre ? game.genre.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const playedOn = game.playedPlatforms ?? (game.platform ? [game.platform] : []);
  const emulated = game.emulatedOn ?? [];
  const normalizedGameType = game.gameType?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const isGameOfTheYearWinner = normalizedGameType === "main_game"
    && GAME_OF_THE_YEAR_WINNERS.includes(game.title as typeof GAME_OF_THE_YEAR_WINNERS[number]);
  return (
    <>
      <button className="back-button" onClick={goBack}>← {backLabel ?? "Back to library"}</button>      <div className="detail-hero glass" style={game.backgroundCover ? { backgroundImage: `linear-gradient(90deg, rgba(10,9,22,.95) 0%, rgba(12,13,27,.82) 48%, rgba(10,13,23,.68) 100%), url(${game.backgroundCover})` } : undefined}>
        {game.igdbId && <SeriesButton igdbId={game.igdbId} creds={igdb} onOpenGame={onOpenGame} />}
        <div className="hero-tab">
          <button title="Edit game" onClick={() => setEditing(true)}><PenLine size={16} /><span>Edit</span></button>
          <button title={game.favorite ? "Unfavorite" : "Favorite"} className={game.favorite ? "fav on" : "fav"} onClick={() => saveGame({ ...game, favorite: !game.favorite })}>
            <Heart size={16} fill={game.favorite ? "currentColor" : "none"} /><span>Favorite</span>
          </button>
          <button title="Delete game" className="del" onClick={() => deleteGame(game)}><Trash2 size={16} /><span>Delete</span></button>
          <CollectionActions data={data} update={update} game={game} igdbId={game.igdbId} cover={game.cover} />        </div>
        <div className="detail-art" style={game.cover ? { backgroundImage: `linear-gradient(145deg, rgba(68,51,113,.35), rgba(38,113,123,.35)), url(${game.cover})` } : undefined}>
          {!game.cover && <Gamepad2 size={60} />}
        </div>
        <div className="detail-copy">
          <div className="hero-tags">
            {game.gameType && <span className="status">{game.gameType}</span>}
            {game.gameType && game.gameStatus && <i>·</i>}
            {game.gameStatus && <span className={`status igdb-status ${game.gameStatus.toLowerCase().replace(/\s+/g, "-")}`}>{game.gameStatus}</span>}
            {!game.gameType && !game.gameStatus && <span className="status">{game.status}</span>}
          </div>
          <h1>{game.title}</h1>

          {(game.developer || game.releaseDate) && (
            <div className="hero-meta">
              <div className="hero-credit">
                {game.developer && (
                  <div className="credit-item">
                    <Building2 size={14} />
                    <div><small>Studio</small><strong>{game.developer}</strong></div>
                  </div>
                )}
                {game.developer && game.releaseDate && <span className="credit-sep" />}
                {game.releaseDate && (
                  <div className="credit-item">
                    <CalendarDays size={14} />
                    <div><small>Released</small><strong>{formatDate(game.releaseDate)}</strong></div>
                  </div>
                )}
              </div>
            </div>
          )}
          {isGameOfTheYearWinner && (
            <div className="goty-badge"><Star size={15} fill="currentColor" /><span>Game of the Year</span></div>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <section className="glass detail-panel">
          <div className="about-head">
            <div className="about-main">
              <p className="eyebrow">ABOUT</p>

              {game.description
                ? <>
                  <p ref={descRef} className={`about-desc${expanded ? " open" : ""}`}>{game.description}</p>
                  {canExpand && (
                    <button className="text-button" style={{ marginTop: 6 }} onClick={() => setExpanded(!expanded)}>
                      {expanded ? "Read less" : "Read more"}
                    </button>
                  )}
                </>
                : <p className="muted" style={{ marginTop: 10 }}>No description yet. Tap Edit game to add one.</p>}
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

          <div className="plat-block">
            {genreList.length > 0 && (
              <div><span className="plat-label">Genres</span><div className="igdb-chips">{genreList.map((x) => <span className="pill" key={x}>{x}</span>)}</div></div>
            )}
            {(game.themes?.length ?? 0) > 0 && (
              <div><span className="plat-label">Themes</span><div className="igdb-chips">{game.themes!.map((x) => <span className="pill" key={x}>{x}</span>)}</div></div>
            )}
            {(game.playerPerspectives?.length ?? 0) > 0 && (
              <div><span className="plat-label">Perspectives</span><div className="igdb-chips">{game.playerPerspectives!.map((x) => <span className="pill" key={x}>{x}</span>)}</div></div>
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
                      <div className="ttb-top">
                        <span className="ttb-icon"><Icon size={16} /></span>
                        <strong>{v}{t.sec ? <small>hrs</small> : null}</strong>
                      </div>
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
            {span && <div className="journey-grid-ttf"><div><span>Time to finish</span><strong>{span}</strong></div><TrophyToggle value={game.platinumed} readOnly /></div>}
          </div>
          <StarRating value={game.rating} readOnly size={16} />
        </section>
      </div>

      {isBundle(game.gameType) && game.igdbId && (
        <section className="glass detail-panel">
          <BundleContents
            igdbId={game.igdbId}
            creds={igdb}
            stored={game.bundleGames}
            canStore={data.games.some((g) => g.id === game.id)}
            onStore={(list) => saveGame({ ...game, bundleGames: list })}
            onOpen={onOpenGame}
          />

        </section>
      )}

      <MediaSection game={game} save={saveGame} igdbMedia={{ images: game.igdbImages ?? [], videos: game.igdbVideos ?? [] }} series={game.igdbId ? { igdbId: game.igdbId, creds: igdb } : undefined} onOpenGame={onOpenGame} />

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
          onAdd={(g) => { saveGame(g); setEditing(false); }}
        />
      )}
      {extra}
    </>
  );
}

class GlobalErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("GlobalErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position: "fixed", inset: 0, background: "#0b0c16", color: "#ff6b6b", zIndex: 999999, padding: 32, overflow: "auto", fontFamily: "monospace" }}>
          <h2>Application Crash Caught by ErrorBoundary:</h2>
          <pre style={{ whiteSpace: "pre-wrap", color: "#f8f9fa", background: "#1a1b26", padding: 16, borderRadius: 8 }}>{this.state.error.stack || this.state.error.message}</pre>
          <button style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }} onClick={() => window.location.href = "/"}>Reload to Dashboard</button>
        </div>
      );
    }
    return this.props.children;
  }
}

if (typeof window !== "undefined") {
  const showBanner = (title: string, msg: string) => {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;top:0;left:0;right:0;background:#991b1b;color:#fef2f2;z-index:9999999;padding:12px 20px;font-family:monospace;font-size:12px;box-shadow:0 4px 12px rgba(0,0,0,0.5);";
    el.innerHTML = `<strong>${title}:</strong> ${msg} <button style="margin-left:12px;cursor:pointer;background:#ef4444;border:none;color:white;padding:2px 8px;border-radius:4px;" onclick="this.parentElement.remove()">Dismiss</button>`;
    document.body.appendChild(el);
  };
  window.addEventListener("error", (e) => {
    console.error("Window Error:", e.error || e.message);
    showBanner("Global Error", String(e.error?.stack || e.error?.message || e.message));
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.error("Unhandled Rejection:", e.reason);
    showBanner("Unhandled Promise Rejection", String(e.reason?.stack || e.reason?.message || e.reason));
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GlobalErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </GlobalErrorBoundary>
  </StrictMode>
);
