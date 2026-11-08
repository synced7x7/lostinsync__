import { useEffect, useRef, useState } from "react";
import { Gamepad2, Package } from "lucide-react";
import { igdbBundleContentsCached, type IgdbCreds } from "../data/igdb";
import type { BundleGame } from "../domain/game";
import { isBundle, sameBundle, slimBundle } from "../domain/gametype";
import { seedGame } from "./discover";
import "./bundle.css";

export { isBundle };

export function BundleContents({ igdbId, creds, stored, canStore, onStore, onOpen }: {
  igdbId: number; creds: IgdbCreds; stored?: BundleGame[]; canStore: boolean;
  onStore: (games: BundleGame[]) => void; onOpen: (id: number) => void;
}) {
  const [games, setGames] = useState<BundleGame[] | undefined>(stored);
  const [err, setErr] = useState("");
  const blockRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ stored, canStore, onStore });
  latest.current = { stored, canStore, onStore };

  // show the saved list instantly, refresh from IGDB once per session, save it if it changed
  useEffect(() => {
    let stale = false;
    setGames(latest.current.stored);
    setErr("");
    igdbBundleContentsCached(igdbId, creds)
      .then((raw) => {
        if (stale) return;
        const fresh = slimBundle(raw);
        setGames(fresh);
        const l = latest.current;
        if (l.canStore && !sameBundle(l.stored, fresh)) l.onStore(fresh);
      })
      .catch((e) => { if (!stale && !latest.current.stored) setErr(e instanceof Error ? e.message : String(e)); });
    return () => { stale = true; };
  }, [igdbId, creds.clientId, creds.clientSecret]);

  // Mouse over the bundle section: the wheel scrolls the row sideways and the page stops scrolling.
  useEffect(() => {
    const block = blockRef.current;
    if (!block) return;
    let target = 0, raf = 0;
    const tick = () => {
      const row = rowRef.current;
      if (!row) { raf = 0; return; }
      const diff = target - row.scrollLeft;
      if (Math.abs(diff) < 0.5) { row.scrollLeft = target; raf = 0; return; }
      row.scrollLeft += diff * 0.22;
      raf = requestAnimationFrame(tick);
    };
    const wheel = (e: WheelEvent) => {
      const row = rowRef.current;
      if (e.ctrlKey || !row || row.scrollWidth <= row.clientWidth + 1) return;
      e.preventDefault();
      if (!raf) target = row.scrollLeft;
      const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      target = Math.max(0, Math.min(row.scrollWidth - row.clientWidth, target + d));
      if (!raf) raf = requestAnimationFrame(tick);
    };
    block.addEventListener("wheel", wheel, { passive: false });
    return () => { block.removeEventListener("wheel", wheel); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div className="bundle-block" ref={blockRef}>
      <span className="plat-label"><Package size={13} /> Games in this bundle{games ? ` · ${games.length}` : ""}</span>
      {err && <p className="error">{err}</p>}
      {!games && !err && (
        <div className="bundle-row" ref={rowRef}>
          {Array.from({ length: 5 }, (_, i) => <div className="bundle-item skeleton" key={i}><div className="bundle-cover" /></div>)}
        </div>
      )}
      {games && games.length === 0 && <p className="muted">IGDB doesn't list the contents of this bundle.</p>}
      {games && games.length > 0 && (
        <div className="bundle-row" ref={rowRef}>
          {games.map((g) => (
            <button type="button" key={g.id} className="bundle-item" title="Open details" onClick={() => { seedGame(g); onOpen(g.id); }}>
              <span className="bundle-cover">
                {g.cover ? <img src={g.cover} alt="" loading="lazy" decoding="async" draggable={false} /> : <Gamepad2 size={22} />}
              </span>
              <strong>{g.name}</strong>
              {g.releaseTs && <small>{new Date(g.releaseTs * 1000).getUTCFullYear()}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}