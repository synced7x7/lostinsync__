import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Filter,
  Gamepad2,
  Grid2X2,
  Heart,
  List,
  PenLine,
  Play,
  Plus,
  Search,
  Settings,
  Sparkles,
  StopCircle,
} from "lucide-react";
import { createAppRepository } from "./data/repository";
import {
  defaultData,
  durationSeconds,
  formatPlaytime,
  STATUSES,
  validateGame,
  type AppData,
  type Game,
  type Status,
  type View,
} from "./domain/game";
import "./style.css";
import { Empty, GameMini, Header, Stat } from "./components/shared";
import { AppLayout } from "./components/layout";
import { Dashboard } from "./features/dashboard";
import { ActivityView } from "./features/activity";
import { AddGame, GameCard } from "./features/library-components";
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
        {
          id: crypto.randomUUID(),
          type: "added",
          title: "Added to library",
          detail: game.title,
          occurredAt: now(),
        },
        ...data.activities,
      ],
    });
  const saveGame = (
    game: Game,
    activity?: { type: "status" | "session" | "completed"; detail: string }
  ) =>
    update({
      ...data,
      games: data.games.map((item) => (item.id === game.id ? game : item)),
      activities: activity
        ? [
            {
              id: crypto.randomUUID(),
              type: activity.type,
              title:
                activity.type === "session"
                  ? "Play session recorded"
                  : "Library updated",
              detail: `${game.title} · ${activity.detail}`,
              occurredAt: now(),
            },
            ...data.activities,
          ]
        : data.activities,
    });
  const selected = data.games.find((game) => game.id === selectedId);
  if (loading)
    return (
      <div className="boot">
        <Sparkles size={30} />
        <span>Preparing your library…</span>
      </div>
    );
  return (
    <AppLayout data={data} view={view} onNavigate={setView} error={error}>
          {view === "dashboard" && (
            <Dashboard
              data={data}
              openLibrary={() => setView("library")}
              openGame={(id) => {
                setSelectedId(id);
                setView("details");
              }}
            />
          )}{" "}
          {view === "library" && (
            <LibraryView
              data={data}
              addGame={addGame}
              saveGame={saveGame}
              openGame={(id) => {
                setSelectedId(id);
                setView("details");
              }}
            />
          )}{" "}
          {view === "details" && selected && (
            <Details
              game={selected}
              saveGame={saveGame}
              goBack={() => setView("library")}
            />
          )}{" "}
          {view === "activity" && <ActivityView data={data} />}{" "}
          {view === "profile" && (
            <ProfileView
              data={data}
              update={update}
              openGame={(id) => {
                setSelectedId(id);
                setView("details");
              }}
            />
          )}{" "}
          {view === "journal" && <JournalView data={data} update={update} />}{" "}
          {view === "settings" && <SettingsView data={data} update={update} />}{" "}
    </AppLayout>
  );
}
function LibraryView({
  data,
  addGame,
  saveGame,
  openGame,
}: {
  data: AppData;
  addGame: (game: Game) => void;
  saveGame: (
    game: Game,
    activity?: { type: "status" | "session" | "completed"; detail: string }
  ) => void;
  openGame: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Status | "All">("All");
  const [genre, setGenre] = useState("All");
  const [sort, setSort] = useState("recent");
  const [layout, setLayout] = useState<"grid" | "list">(
    data.settings.defaultView
  );
  const [showAdd, setShowAdd] = useState(false);
  const genres = [
    ...new Set(data.games.map((game) => game.genre).filter(Boolean)),
  ];
  const games = useMemo(
    () =>
      data.games
        .filter(
          (game) =>
            (filter === "All" || game.status === filter) &&
            (genre === "All" || game.genre === genre) &&
            game.title.toLowerCase().includes(query.toLowerCase())
        )
        .sort((a, b) =>
          sort === "title"
            ? a.title.localeCompare(b.title)
            : sort === "playtime"
            ? b.totalSeconds - a.totalSeconds
            : b.createdAt.localeCompare(a.createdAt)
        ),
    [data.games, filter, genre, query, sort]
  );
  return (
    <>
      <Header
        eyebrow={`YOUR COLLECTION · ${data.games.length} GAMES`}
        title="Library"
        action={
          <button className="button primary" onClick={() => setShowAdd(true)}>
            <Plus size={17} /> Add game
          </button>
        }
      />
      <div className="toolbar glass">
        <div className="search-field">
          <Search size={17} />
          <input
            placeholder="Search your collection…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="toolbar-actions">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as Status | "All")}
          >
            <option value="All">All statuses</option>
            {STATUSES.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <select value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="All">All genres</option>
            {genres.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">Recently added</option>
            <option value="title">Title</option>
            <option value="playtime">Playtime</option>
          </select>
          <button
            className={layout === "grid" ? "icon-btn active" : "icon-btn"}
            onClick={() => setLayout("grid")}
          >
            <Grid2X2 size={17} />
          </button>
          <button
            className={layout === "list" ? "icon-btn active" : "icon-btn"}
            onClick={() => setLayout("list")}
          >
            <List size={17} />
          </button>
        </div>
      </div>
      {games.length === 0 ? (
        <Empty
          icon={<Filter />}
          title="Nothing here yet"
          text="Try another search or add your first game."
          action={() => setShowAdd(true)}
        />
      ) : (
        <div className={layout === "grid" ? "library-grid" : "library-list"}>
          {games.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              layout={layout}
              open={() => openGame(game.id)}
              save={(next, activity) => saveGame(next, activity)}
            />
          ))}
        </div>
      )}
      {showAdd && (
        <AddGame
          onClose={() => setShowAdd(false)}
          onAdd={(game) => {
            addGame(game);
            setShowAdd(false);
          }}
        />
      )}
    </>
  );
}
function Details({
  game,
  saveGame,
  goBack,
}: {
  game: Game;
  saveGame: (
    game: Game,
    activity?: { type: "status" | "session" | "completed"; detail: string }
  ) => void;
  goBack: () => void;
}) {
  const [notes, setNotes] = useState(game.notes);
  const active = Boolean(game.activeSince);
  const stop = () => {
    const seconds = durationSeconds(game.activeSince!, now());
    saveGame(
      {
        ...game,
        activeSince: undefined,
        totalSeconds: game.totalSeconds + seconds,
      },
      { type: "session", detail: `Session · ${formatPlaytime(seconds)}` }
    );
  };
  return (
    <>
      <button className="back-button" onClick={goBack}>
        ← Back to library
      </button>
      <div className="detail-hero glass">
        <div className="detail-art">
          <Gamepad2 size={60} />
        </div>
        <div className="detail-copy">
          <span className="status">{game.status}</span>
          <h1>{game.title}</h1>
          <p>
            {game.platform} · {game.genre || "Uncategorized"}
          </p>
          <div className="detail-actions">
            {active ? (
              <button className="button stop" onClick={stop}>
                <StopCircle size={16} /> Stop session
              </button>
            ) : (
              <button
                className="button primary"
                onClick={() =>
                  saveGame(
                    { ...game, activeSince: now(), status: "Playing" },
                    { type: "session", detail: "Session started" }
                  )
                }
              >
                <Play size={16} /> Start session
              </button>
            )}
            <button
              className="button soft"
              onClick={() => saveGame({ ...game, favorite: !game.favorite })}
            >
              <Heart size={16} fill={game.favorite ? "currentColor" : "none"} />{" "}
              {game.favorite ? "Favorited" : "Favorite"}
            </button>
          </div>
        </div>
        <div className="detail-stat">
          <span>Verified time</span>
          <strong>{formatPlaytime(game.totalSeconds)}</strong>
          <small>
            {game.rating ? `${game.rating}/10 rating` : "Not rated yet"}
          </small>
        </div>
      </div>
      <div className="detail-grid">
        <section className="glass detail-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">PERSONAL NOTES</p>
              <h2>Your thoughts</h2>
            </div>
            <button
              className="text-button"
              onClick={() => saveGame({ ...game, notes })}
            >
              <Check size={14} /> Save
            </button>
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Write something you want to remember…"
          />
        </section>
        <section className="glass detail-panel">
          <p className="eyebrow">PROGRESS</p>
          <h2>Personal assessment</h2>
          <label>
            Rating{" "}
            <input
              type="range"
              min="0"
              max="10"
              value={game.rating ?? 0}
              onChange={(e) =>
                saveGame({ ...game, rating: Number(e.target.value) })
              }
            />
            <span className="range-value">{game.rating ?? "—"}</span>
          </label>
          <label>
            Mastery{" "}
            <input
              type="range"
              min="0"
              max="100"
              value={game.mastery ?? 0}
              onChange={(e) =>
                saveGame({ ...game, mastery: Number(e.target.value) })
              }
            />
            <span className="range-value">{game.mastery ?? 0}%</span>
          </label>
          <label>
            Status
            <select
              value={game.status}
              onChange={(e) =>
                saveGame(
                  { ...game, status: e.target.value as Status },
                  { type: "status", detail: e.target.value }
                )
              }
            >
              {STATUSES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
        </section>
      </div>
    </>
  );
}
function ProfileView({
  data,
  update,
  openGame,
}: {
  data: AppData;
  update: (data: AppData) => void;
  openGame: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const completed = data.games.filter((game) => game.status === "Completed");
  return (
    <>
      <Header
        eyebrow="YOUR PERSONAL SPACE"
        title="Profile"
        action={
          <button className="button soft" onClick={() => setEditing(!editing)}>
            <PenLine size={16} /> {editing ? "Done" : "Customize"}
          </button>
        }
      />
      <section className="profile-banner glass">
        <div className="profile-avatar">
          {data.profile.displayName.slice(0, 1)}
        </div>
        <div className="profile-copy">
          {editing ? (
            <input
              value={data.profile.displayName}
              onChange={(e) =>
                update({
                  ...data,
                  profile: { ...data.profile, displayName: e.target.value },
                })
              }
            />
          ) : (
            <h2>{data.profile.displayName}</h2>
          )}
          {editing ? (
            <textarea
              value={data.profile.bio}
              onChange={(e) =>
                update({
                  ...data,
                  profile: { ...data.profile, bio: e.target.value },
                })
              }
            />
          ) : (
            <p>{data.profile.bio}</p>
          )}
          <span className="pill">
            <Sparkles size={13} /> Local collector
          </span>
        </div>
        <div className="profile-count">
          <strong>{data.games.length}</strong>
          <span>games collected</span>
        </div>
      </section>
      <div className="stats-row">
        <Stat
          label="Total games"
          value={String(data.games.length)}
          hint="in collection"
          icon={<LibraryIcon />}
        />
        <Stat
          label="Completed"
          value={String(completed.length)}
          hint="adventures finished"
          icon={<Check />}
        />
        <Stat
          label="Playtime"
          value={formatPlaytime(
            data.games.reduce((sum, game) => sum + game.totalSeconds, 0)
          )}
          hint="across all games"
          icon={<Clock3 />}
        />
      </div>
      <section className="section">
        <div className="section-title">
          <div>
            <p className="eyebrow">HIGHLIGHTS</p>
            <h2>Recently completed</h2>
          </div>
        </div>
        {completed.length ? (
          <div className="mini-grid">
            {completed.slice(0, 4).map((game) => (
              <GameMini
                key={game.id}
                game={game}
                onClick={() => openGame(game.id)}
              />
            ))}
          </div>
        ) : (
          <Empty
            icon={<Check />}
            title="Your first finish is waiting"
            text="Completed games will be featured here."
          />
        )}
      </section>
    </>
  );
}
function LibraryIcon() {
  return <Gamepad2 />;
}
function JournalView({
  data,
  update,
}: {
  data: AppData;
  update: (data: AppData) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const add = () => {
    if (!title.trim() || !body.trim()) return;
    update({
      ...data,
      journal: [
        {
          id: crypto.randomUUID(),
          title: title.trim(),
          body: body.trim(),
          mood: "reflective",
          createdAt: now(),
        },
        ...data.journal,
      ],
    });
    setTitle("");
    setBody("");
  };
  return (
    <>
      <Header
        eyebrow="PRIVATE THOUGHTS"
        title="Journal"
        action={
          <button className="button primary" onClick={add}>
            <PenLine size={16} /> Save entry
          </button>
        }
      />
      <div className="journal-compose glass">
        <input
          placeholder="Entry title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          placeholder="What is on your mind?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <div className="journal-list">
        {data.journal.map((entry) => (
          <article className="journal-entry glass" key={entry.id}>
            <span className="eyebrow">
              {new Date(entry.createdAt).toLocaleDateString()}
            </span>
            <h2>{entry.title}</h2>
            <p>{entry.body}</p>
          </article>
        ))}
        {!data.journal.length && (
          <Empty
            icon={<BookOpen />}
            title="Your journal is blank"
            text="Capture a thought after your next session."
          />
        )}
      </div>
    </>
  );
}
function SettingsView({
  data,
  update,
}: {
  data: AppData;
  update: (data: AppData) => void;
}) {
  return (
    <>
      <Header eyebrow="WORKSPACE CONTROL" title="Settings" />
      <div className="settings-grid">
        <section className="glass settings-panel">
          <p className="eyebrow">APPEARANCE</p>
          <h2>Make it yours</h2>
          <div className="setting-row">
            <div>
              <strong>Active theme</strong>
              <span>Aurora glass · more themes are ready to be added</span>
            </div>
            <span className="pill">
              <Sparkles size={13} /> Aurora
            </span>
          </div>
          <div className="setting-row">
            <div>
              <strong>Default library view</strong>
              <span>Choose how your collection opens</span>
            </div>
            <select
              value={data.settings.defaultView}
              onChange={(e) =>
                update({
                  ...data,
                  settings: {
                    ...data.settings,
                    defaultView: e.target.value as "grid" | "list",
                  },
                })
              }
            >
              <option value="grid">Cover grid</option>
              <option value="list">Compact list</option>
            </select>
          </div>
        </section>
        <section className="glass settings-panel">
          <p className="eyebrow">TRACKING</p>
          <h2>Session preferences</h2>
          <Toggle
            label="Timer sound"
            text="A subtle cue when a session changes"
            value={data.settings.timerSound}
            onChange={(value) =>
              update({
                ...data,
                settings: { ...data.settings, timerSound: value },
              })
            }
          />
          <Toggle
            label="Automatic tracking"
            text="Windows process detection is opt-in and not active yet"
            value={data.settings.automaticTracking}
            onChange={(value) =>
              update({
                ...data,
                settings: { ...data.settings, automaticTracking: value },
              })
            }
            disabled
          />
        </section>
        <section className="glass settings-panel">
          <p className="eyebrow">LOCAL DATA</p>
          <h2>Your data stays yours</h2>
          <p className="muted">
            SQLite database: <strong>lost-in-sync.sqlite</strong>
          </p>
          <p className="muted">
            Export a portable JSON backup or restore one without an account.
          </p>
          <div className="detail-actions">
            <button
              className="button soft"
              onClick={() => {
                const blob = new Blob([JSON.stringify(data, null, 2)], {
                  type: "application/json",
                });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.download = `lost-in-sync-backup-${new Date()
                  .toISOString()
                  .slice(0, 10)}.json`;
                link.click();
                URL.revokeObjectURL(link.href);
              }}
            >
              <BookOpen size={15} /> Export backup
            </button>
            <label className="button soft">
              Import backup
              <input
                type="file"
                accept="application/json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void file.text().then((text) => {
                    try {
                      update(JSON.parse(text) as AppData);
                    } catch {
                      window.alert(
                        "That backup file is not valid Lost in Sync data."
                      );
                    }
                  });
                }}
              />
            </label>
          </div>
          <span className="pill success">
            <Check size={13} /> Database connected
          </span>
        </section>
      </div>
    </>
  );
}
function Toggle({
  label,
  text,
  value,
  onChange,
  disabled,
}: {
  label: string;
  text: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`setting-row ${disabled ? "disabled" : ""}`}>
      <div>
        <strong>{label}</strong>
        <span>{text}</span>
      </div>
      <button
        className={value ? "toggle on" : "toggle"}
        onClick={() => !disabled && onChange(!value)}
        aria-label={label}
      >
        <span></span>
      </button>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
