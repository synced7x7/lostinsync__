import { useState } from "react";
import { ChevronRight, Gamepad2, Heart, Play, Plus, StopCircle, X } from "lucide-react";
import { durationSeconds, formatPlaytime, STATUSES, validateGame, type Game, type Status } from "../domain/game";
import type { SaveGame } from "../components/shared";

const now = () => new Date().toISOString();

export function GameCard({ game, layout, open, save }: { game: Game; layout: "grid" | "list"; open: () => void; save: SaveGame }) {
  const active = Boolean(game.activeSince);
  const stop = () => {
    const end = now();
    const seconds = durationSeconds(game.activeSince!, end);
    save({ ...game, activeSince: undefined, totalSeconds: game.totalSeconds + seconds }, { type: "session", detail: `Session · ${formatPlaytime(seconds)}` });
  };
  return <article className={layout === "grid" ? "game-card glass" : "game-row glass"} onClick={open}>
    <div className="game-art"><Gamepad2 size={layout === "grid" ? 34 : 24} /><span>{game.platform}</span></div>
    <div className="game-info"><div className="game-top"><span className="status">{game.status}</span><button className="heart" onClick={(e) => { e.stopPropagation(); save({ ...game, favorite: !game.favorite }); }}><Heart size={16} fill={game.favorite ? "currentColor" : "none"} /></button></div><h3>{game.title}</h3><p>{game.genre || "Uncategorized"} · {formatPlaytime(game.totalSeconds)} played</p>{layout === "grid" && <div className="card-bottom"><button className={active ? "button stop" : "button soft"} onClick={(e) => { e.stopPropagation(); active ? stop() : save({ ...game, activeSince: now(), status: "Playing" }, { type: "session", detail: "Session started" }); }}>{active ? <><StopCircle size={14} /> Stop session</> : <><Play size={14} /> Start session</>}</button><ChevronRight size={16} /></div>}</div>
  </article>;
}

export function AddGame({ onClose, onAdd }: { onClose: () => void; onAdd: (game: Game) => void }) {
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("PC");
  const [genre, setGenre] = useState("");
  const [status, setStatus] = useState<Status>("Backlog");
  const [error, setError] = useState("");
  const submit = () => {
    const issue = validateGame(title, platform);
    if (issue) { setError(issue); return; }
    onAdd({ id: crypto.randomUUID(), title: title.trim(), platform: platform.trim(), genre: genre.trim(), tags: [], status, notes: "", favorite: false, totalSeconds: 0, createdAt: now() });
  };
  return <div className="modal-backdrop" onClick={onClose}><div className="modal glass" onClick={(e) => e.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">NEW ENTRY</p><h2>Add a game</h2></div><button className="icon-btn" onClick={onClose}><X size={18} /></button></div><label>Title<input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What are you playing?" /></label><div className="form-grid"><label>Platform<input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="PC, Switch…" /></label><label>Genre<input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="RPG, strategy…" /></label></div><label>Status<select value={status} onChange={(e) => setStatus(e.target.value as Status)}>{STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>{error && <p className="error">{error}</p>}<button className="button primary full" onClick={submit}><Plus size={17} /> Add to collection</button></div></div>;
}
