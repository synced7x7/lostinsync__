import { useEffect, useState } from "react";
import { ChevronRight, Gamepad2, Heart, Plus, X } from "lucide-react";
import { formatCount, formatHours, formatPlaytime, STATUSES, validateGame, type Game, type Status } from "../domain/game";
import { DateField, StarRating, type SaveGame } from "../components/shared";
import { hasTauri, igdbDetails, igdbSearch, type IgdbCreds, type IgdbGame, type IgdbHit } from "../data/igdb";
import { createPortal } from "react-dom";

const now = () => new Date().toISOString();

export function GameCard({ game, layout, open, save }: { game: Game; layout: "grid" | "list"; open: () => void; save: SaveGame }) {
  return <article className={layout === "grid" ? "game-card glass" : "game-row glass"} onClick={open}>
    <div className="game-art" style={game.cover ? { backgroundImage: `linear-gradient(135deg, rgba(20,16,45,.25), rgba(13,50,62,.45)), url(${game.cover})` } : undefined}>{!game.cover && <Gamepad2 size={layout === "grid" ? 34 : 24} />}<span>{game.platform}</span></div>
    <div className="game-info"><div className="game-top"><span className="status">{game.status}</span><button className="heart" onClick={(e) => { e.stopPropagation(); save({ ...game, favorite: !game.favorite }); }}><Heart size={16} fill={game.favorite ? "currentColor" : "none"} /></button></div><h3>{game.title}</h3><p>{game.genre || "Uncategorized"} · {formatPlaytime(game.totalSeconds)} played</p>{layout === "grid" && <div className="card-bottom"><span className="muted">Open details</span><ChevronRight size={16} /></div>}</div>
  </article>;
}

export function AddGame({ onClose, onAdd, igdb }: { onClose: () => void; onAdd: (game: Game) => void; igdb: IgdbCreds }) {
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState("PC");
  const [genre, setGenre] = useState("");
  const [status, setStatus] = useState<Status>("Backlog");
  const [rating, setRating] = useState(0);
  const [startedAt, setStartedAt] = useState("");
  const [finishedAt, setFinishedAt] = useState("");
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("0");
  const [cover, setCover] = useState<string>();
  const [backgroundCover, setBackgroundCover] = useState<string>();
  const [error, setError] = useState("");

  const [developer, setDeveloper] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [description, setDescription] = useState("");
  const [hits, setHits] = useState<IgdbHit[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<IgdbGame>();
  const canSearch = hasTauri && !!igdb.clientId && !!igdb.clientSecret;

  useEffect(() => {
    if (!canSearch || !open || title.trim().length < 2) { setHits([]); return; }
    let stale = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try { const r = await igdbSearch(title.trim(), igdb); if (!stale) setHits(r); }
      catch (e) { if (!stale) { setHits([]); setError(String(e)); } }
      finally { if (!stale) setSearching(false); }
    }, 350);
    return () => { stale = true; clearTimeout(t); };
  }, [title, open]);

  const pick = async (hit: IgdbHit) => {
    setOpen(false); setHits([]); setTitle(hit.name); setSearching(true); setError("");
    try {
      const g = await igdbDetails(hit.id, igdb);
      setPicked(g);
      setTitle(g.name);
      setDeveloper(g.developer ?? "");
      setReleaseDate(g.releaseTs ? new Date(g.releaseTs * 1000).toISOString().slice(0, 10) : "");
      setDescription(g.description ?? "");
      setGenre(g.genres.join(", "));
      setPlatform(g.platforms[0] ?? platform);
      setCover(g.cover);
      setBackgroundCover(g.background);
    } catch (e) { setError(String(e)); }
    finally { setSearching(false); }
  };

  const readImage = (file: File, setter: (value: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxDimension = 1600;
        const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        setter(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.onerror = () => setError("The selected image could not be decoded.");
      image.src = String(reader.result);
    };
    reader.onerror = () => setError("The selected image could not be read.");
    reader.readAsDataURL(file);
  };

  const submit = () => {
    const issue = validateGame(title, platform);
    if (issue) { setError(issue); return; }
    if (startedAt && finishedAt && finishedAt < startedAt) { setError("Completion date cannot be before the starting date."); return; }
    const totalSeconds = (Math.max(0, Number(hours) || 0) * 3600) + (Math.min(59, Math.max(0, Number(minutes) || 0)) * 60);
    onAdd({
      id: crypto.randomUUID(),
      title: title.trim(),
      platform: platform.trim(),
      genre: genre.trim(),
      tags: [],
      status,
      notes: "",
      rating: rating || undefined,
      favorite: false,
      cover,
      backgroundCover,
      totalSeconds,
      createdAt: now(),
      startedAt: startedAt || undefined,
      finishedAt: finishedAt || undefined,
      developer: developer.trim() || undefined,
      releaseDate: releaseDate || undefined,
      description: description.trim() || undefined,
      genres: picked?.genres,
      platforms: picked?.platforms,
      igdbId: picked?.id,
      igdbRating: picked?.rating,
      igdbRatingCount: picked?.ratingCount,
      timeAvgSeconds: picked?.timeAvg,
      timeMainSeconds: picked?.timeMain,
      timeFullSeconds: picked?.timeFull,
    });
  };

   return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide glass" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div><p className="eyebrow">NEW ENTRY</p><h2>Add a game</h2></div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="add-layout">
          {/* Column 1: artwork */}
          <div className="add-col">
            <div className="add-cover" style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
              {!cover && <Gamepad2 size={34} />}
            </div>
            <label className="button soft upload-btn">Small cover
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readImage(f, setCover); }} />
            </label>
            <div className="add-bg" style={backgroundCover ? { backgroundImage: `url(${backgroundCover})` } : undefined}>
              {!backgroundCover && <span>Large cover</span>}
            </div>
            <label className="button soft upload-btn">Detail background
              <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) readImage(f, setBackgroundCover); }} />
            </label>
          </div>

          {/* Column 2: game info */}
          <div className="add-col">
            <label style={{ position: "relative" }}>Title
              <input
                autoFocus
                value={title}
                onChange={(e) => { setTitle(e.target.value); setPicked(undefined); setOpen(true); }}
                placeholder={canSearch ? "Search IGDB or type a title…" : "What are you playing?"}
              />
              {searching && <span className="igdb-hint">Searching IGDB…</span>}
              {!canSearch && <span className="igdb-hint">{hasTauri ? "Add IGDB keys in Settings to auto-fill." : "IGDB lookup works in the desktop app only."}</span>}
              {open && hits.length > 0 && (
                <div className="igdb-dropdown glass">
                  {hits.map((h) => (
                    <button type="button" key={h.id} className="igdb-hit" onClick={() => pick(h)}>
                      <div className="igdb-hit-art" style={h.cover ? { backgroundImage: `url(${h.cover})` } : undefined} />
                      <div><strong>{h.name}</strong><span>{[h.developer, h.releaseTs && new Date(h.releaseTs * 1000).getUTCFullYear()].filter(Boolean).join(" · ")}</span></div>
                    </button>
                  ))}
                </div>
              )}
            </label>
            <div className="form-grid">
              <label>Studio<input value={developer} onChange={(e) => setDeveloper(e.target.value)} placeholder="Developer" /></label>
              <DateField label="Release date" value={releaseDate || undefined} onChange={(v) => setReleaseDate(v ?? "")} />
            </div>
            <label>Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="About the game…" /></label>
            <div className="form-grid">
              <label>Platform<input value={platform} onChange={(e) => setPlatform(e.target.value)} placeholder="PC, Switch…" /></label>
              <label>Genre<input value={genre} onChange={(e) => setGenre(e.target.value)} placeholder="RPG, strategy…" /></label>
            </div>
            {picked && <p className="muted add-igdb">IGDB {picked.rating ?? "—"}/100 · {formatCount(picked.ratingCount)} ratings · Avg {formatHours(picked.timeAvg)} · Main {formatHours(picked.timeMain)} · 100% {formatHours(picked.timeFull)}</p>}
          </div>

          {/* Column 3: your tracking */}
          <div className="add-col">
            <DateField label="Starting date" value={startedAt || undefined} max={finishedAt || undefined} onChange={(v) => setStartedAt(v ?? "")} />
            <DateField label="Completion date" value={finishedAt || undefined} min={startedAt || undefined} onChange={(v) => setFinishedAt(v ?? "")} />
            <div className="form-grid">
              <label>Hours played<input type="number" min="0" value={hours} onChange={(e) => setHours(e.target.value)} /></label>
              <label>Minutes played<input type="number" min="0" max="59" value={minutes} onChange={(e) => setMinutes(e.target.value)} /></label>
            </div>
            <label>Status
              <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
                {STATUSES.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <StarRating value={rating || undefined} onChange={(r) => setRating(r ?? 0)} size={16} />
          </div>
        </div>

        <div className="add-footer">
          <p className="error">{error}</p>
          <button className="button primary full" onClick={submit}><Plus size={17} /> Add to collection</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
