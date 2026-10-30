import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ImagePlus, Link2, Play, Trash2, X } from "lucide-react";
import type { Game } from "../domain/game";

export const ytId = (raw: string) => {
  const s = raw.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  return s.match(/(?:youtu\.be\/|[?&]v=|embed\/|shorts\/)([\w-]{11})/)?.[1];
};
const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const thumb = (id: string) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
const full = (u: string) => u.replace("t_screenshot_big", "t_1080p");

async function openUrl(url: string) {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch { window.open(url, "_blank"); }
}

const toDataUrl = (file: File) =>
  new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * s);
        c.height = Math.round(img.naturalHeight * s);
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => rej(new Error("decode"));
      img.src = String(r.result);
    };
    r.onerror = () => rej(new Error("read"));
    r.readAsDataURL(file);
  });

export function MediaSection({ game, save }: { game: Game; save: (g: Game) => void }) {
  const shots = game.screenshots ?? [];
  const vids = game.videos ?? [];
  const [lb, setLb] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (lb === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLb(null);
      if (e.key === "ArrowRight") setLb((i) => (i === null ? i : (i + 1) % shots.length));
      if (e.key === "ArrowLeft") setLb((i) => (i === null ? i : (i - 1 + shots.length) % shots.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lb, shots.length]);

  const addLink = () => {
    const id = ytId(link);
    if (!id) { setErr("That doesn't look like a YouTube link."); return; }
    if (!vids.some((v) => v.id === id)) save({ ...game, videos: [...vids, { id }] });
    setLink(""); setErr(""); setAdding(false);
  };
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      const urls = await Promise.all([...files].map(toDataUrl));
      save({ ...game, screenshots: [...shots, ...urls] });
      setErr("");
    } catch { setErr("One of the images could not be read."); }
  };
  const [main, ...rest] = vids;

  return (
    <section className="glass detail-panel media-panel">
      <div className="about-head">
        <div><p className="eyebrow">GALLERY</p><h2>Trailer &amp; screenshots</h2></div>
        <div className="media-actions">
          <button className="text-button" onClick={() => setAdding(!adding)}><Link2 size={14} /> Add trailer</button>
          <button className="text-button" onClick={() => fileRef.current?.click()}><ImagePlus size={14} /> Add screenshots</button>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void addFiles(e.target.files); e.target.value = ""; }} />
        </div>
      </div>

      {adding && (
        <div className="media-add">
          <input autoFocus placeholder="Paste a YouTube link…" value={link} onChange={(e) => { setLink(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && addLink()} />
          <button className="button primary" onClick={addLink}>Add</button>
        </div>
      )}
      {err && <p className="error">{err}</p>}

      {main && (
        <div className="media-block">
          <span className="plat-label">Game trailer</span>
          <div className="trailer-row">
            <div className="trailer" onClick={() => openUrl(watchUrl(main.id))} style={{ backgroundImage: `url(${thumb(main.id)})` }}>
              <span className="trailer-play"><Play size={26} fill="currentColor" /></span>
              <span className="trailer-name">{main.name ?? "Watch on YouTube"}</span>
              <button className="media-del" title="Remove" onClick={(e) => { e.stopPropagation(); save({ ...game, videos: vids.filter((v) => v.id !== main.id) }); }}><Trash2 size={13} /></button>
            </div>
            {rest.length > 0 && (
              <div className="trailer-side">
                {rest.map((v) => (
                  <div className="trailer small" key={v.id} onClick={() => openUrl(watchUrl(v.id))} style={{ backgroundImage: `url(${thumb(v.id)})` }}>
                    <span className="trailer-play"><Play size={16} fill="currentColor" /></span>
                    <span className="trailer-name">{v.name ?? "Video"}</span>
                    <button className="media-del" title="Remove" onClick={(e) => { e.stopPropagation(); save({ ...game, videos: vids.filter((x) => x.id !== v.id) }); }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {shots.length > 0 && (
        <div className="media-block">
          <span className="plat-label">Screenshots · {shots.length}</span>
          <div className="shot-grid">
            {shots.map((s, i) => (
              <div className="shot" key={s.slice(-40) + i} onClick={() => setLb(i)} style={{ backgroundImage: `url(${s})` }}>
                <button className="media-del" title="Remove" onClick={(e) => { e.stopPropagation(); save({ ...game, screenshots: shots.filter((_, j) => j !== i) }); }}><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!vids.length && !shots.length && <p className="muted" style={{ marginTop: 14 }}>No trailer or screenshots yet. Add your own, or edit the game and pick it from IGDB.</p>}

      {lb !== null && createPortal(
        <div className="lightbox" onClick={() => setLb(null)}>
          <button className="icon-btn lb-close" onClick={() => setLb(null)}><X size={18} /></button>
          {shots.length > 1 && <button className="icon-btn lb-nav left" onClick={(e) => { e.stopPropagation(); setLb((lb - 1 + shots.length) % shots.length); }}><ChevronLeft size={20} /></button>}
          <img src={full(shots[lb])} onClick={(e) => e.stopPropagation()} />
          {shots.length > 1 && <button className="icon-btn lb-nav right" onClick={(e) => { e.stopPropagation(); setLb((lb + 1) % shots.length); }}><ChevronRight size={20} /></button>}
          <span className="lb-count">{lb + 1} / {shots.length}</span>
        </div>,
        document.body
      )}
    </section>
  );
}