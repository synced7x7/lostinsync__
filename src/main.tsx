import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Clock3, Gamepad2, Library, Plus, Square, Play } from "lucide-react";
import { createGameRepository } from "./data/repository";
import { durationSeconds, STATUSES, validateGame, type Game, type Status } from "./domain/game";
import "./style.css";

const repo = createGameRepository();
function App() {
  const [games, setGames] = useState<Game[]>([]);
  const [title, setTitle] = useState(""); const [platform, setPlatform] = useState("PC");
  const [status, setStatus] = useState<Status>("Backlog"); const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async (game: Game) => { try { await repo.save(game); setGames(await repo.list()); setSelected(game.id); setError(""); } catch (reason) { setError(reason instanceof Error ? reason.message : "The library could not be saved."); } };
  useEffect(() => { repo.list().then(setGames).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "The library could not be loaded.")).finally(() => setLoading(false)); }, []);
  const add = () => { const issue = validateGame(title, platform); if (issue) { setError(issue); return; }
    const game: Game = { id: crypto.randomUUID(), title: title.trim(), platform: platform.trim(), status, notes: "", totalSeconds: 0, createdAt: new Date().toISOString() };
    void refresh(game); setTitle(""); };
  const active = games.find((game) => game.id === selected) ?? games[0];
  const hours = useMemo(() => Math.floor((active?.totalSeconds ?? 0) / 3600), [active]);
  return <main><aside><div className="brand"><Gamepad2 /> LOST IN SYNC</div><nav><button className="active"><Library size={18}/> Library</button><button><Clock3 size={18}/> Activity</button></nav><small>OFFLINE MODE · LOCAL DATA</small></aside>
    <section className="content"><header><div><p className="eyebrow">YOUR COLLECTION</p><h1>Game library</h1></div><button className="primary" onClick={() => document.getElementById("title")?.focus()}><Plus size={18}/> Add game</button></header>
      <div className="panel add"><input id="title" placeholder="Game title" value={title} onChange={(e) => setTitle(e.target.value)}/><input placeholder="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)}/><select value={status} onChange={(e) => setStatus(e.target.value as Status)}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select><button className="primary" onClick={add}>Save</button></div>{error && <p className="error">{error}</p>}
      {loading ? <div className="empty"><p>Loading your local library…</p></div> : games.length === 0 ? <div className="empty"><Gamepad2 size={42}/><h2>Your library is quiet</h2><p>Add your first game to begin tracking your time.</p></div> : <div className="grid">{games.map((game) => <article className={game.id === active?.id ? "card selected" : "card"} key={game.id} onClick={() => setSelected(game.id)}><div className="cover"><Gamepad2 size={34}/></div><div className="cardbody"><span className="badge">{game.status}</span><h2>{game.title}</h2><p>{game.platform} · {Math.floor(game.totalSeconds / 3600)}h recorded</p><div className="actions">{game.activeSince ? <button onClick={(e) => { e.stopPropagation(); const stopped = {...game, activeSince: undefined, totalSeconds: game.totalSeconds + durationSeconds(game.activeSince!, new Date().toISOString())}; void refresh(stopped); }}><Square size={14}/> Stop</button> : <button onClick={(e) => { e.stopPropagation(); void refresh({...game, activeSince: new Date().toISOString(), status: "Playing"}); }}><Play size={14}/> Start session</button>}<select value={game.status} onChange={(e) => void refresh({...game, status: e.target.value as Status})}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></div></div></article>)}</div>}
      {active && <div className="detail panel"><div><p className="eyebrow">SELECTED GAME</p><h2>{active.title}</h2><p>{active.platform} · {hours} hours of verified playtime</p></div><span className="badge">{active.activeSince ? "SESSION ACTIVE" : active.status}</span></div>}
    </section></main>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
