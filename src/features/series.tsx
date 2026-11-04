import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { GitBranch, Layers, X } from "lucide-react";
import { igdbSeries, type IgdbCreds, type SeriesData } from "../data/igdb";

type T = {
    cols: Map<number, SeriesData["collections"][number]>;
    kids: Map<number, number[]>;
    gm: Map<number, SeriesData["games"][number]>;
    roots: number[];
};

function Node({ id, t, current, depth = 0, onOpenGame }: { id: number; t: T; current: number; depth?: number; onOpenGame?: (id: number) => void }) {
    const c = t.cols.get(id);
    if (!c || depth > 5) return null;
    const games = (c.games ?? [])
        .map((g) => t.gm.get(g))
        .filter((g): g is SeriesData["games"][number] => !!g)
        .sort((a, b) => (a.releaseTs ?? 9e12) - (b.releaseTs ?? 9e12));
    return (
        <li>
            <div className="tree-col"><Layers size={14} />{c.name}<small>{games.length} games</small></div>
            <ul>
                {(t.kids.get(id) ?? []).map((s) => <Node key={s} id={s} t={t} current={current} depth={depth + 1} onOpenGame={onOpenGame} />)}
                {games.map((g) => (
                    <li key={g.id}>
                        <div
                            className={`tree-game${g.id === current ? " me" : ""}${g.id !== current ? " navigable" : ""}`}
                            onClick={() => g.id !== current && onOpenGame?.(g.id)}
                            onKeyDown={(event) => {
                                if (g.id !== current && (event.key === "Enter" || event.key === " ")) {
                                    event.preventDefault();
                                    onOpenGame?.(g.id);
                                }
                            }}
                            role={g.id === current ? undefined : "button"}
                            tabIndex={g.id === current ? undefined : 0}
                            title={g.id === current ? "Current game" : "Open this game"}
                        >
                            <i style={g.cover ? { backgroundImage: `url(${g.cover})` } : undefined} />
                            <span>{g.name}</span>
                            <small>{g.releaseTs ? new Date(g.releaseTs * 1000).getUTCFullYear() : "TBA"}</small>
                            {g.id === current && <b>This game</b>}
                        </div>
                    </li>
                ))}
            </ul>
        </li>
    );
}

function SeriesModal({ igdbId, creds, onClose, onOpenGame }: { igdbId: number; creds: IgdbCreds; onClose: () => void; onOpenGame?: (id: number) => void }) {
    const [data, setData] = useState<SeriesData>();
    const [err, setErr] = useState("");
    useEffect(() => {
        igdbSeries(igdbId, creds).then(setData).catch((e) => setErr(String(e)));
    }, [igdbId]);
    const t = useMemo<T | null>(() => {
        if (!data) return null;
        const kids = new Map<number, number[]>();
        const isChild = new Set<number>();
        data.relations.forEach(([p, c]) => { kids.set(p, [...(kids.get(p) ?? []), c]); isChild.add(c); });
        return {
            cols: new Map(data.collections.map((c) => [c.id, c])),
            gm: new Map(data.games.map((g) => [g.id, g])),
            kids,
            roots: data.collections.filter((c) => !isChild.has(c.id)).map((c) => c.id),
        };
    }, [data]);

    return createPortal(
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal modal-wide series-modal glass" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                    <div><p className="eyebrow">FROM IGDB</p><h2>Series tree</h2></div>
                    <button className="icon-btn" onClick={onClose}><X size={18} /></button>
                </div>
                {!data && !err && <p className="muted">Loading series…</p>}
                {err && <p className="error">{err}</p>}
                {t && t.roots.length === 0 && <p className="muted">IGDB has no series for this game.</p>}
                {t && t.roots.length > 0 && (
                    <ul className="tree">{t.roots.map((r) => <Node key={r} id={r} t={t} current={igdbId} onOpenGame={onOpenGame} />)}</ul>
                )}
            </div>
        </div>,
        document.body
    );
}

export function SeriesButton({ igdbId, creds, onOpenGame }: { igdbId: number; creds: IgdbCreds; onOpenGame?: (id: number) => void }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button className="series-marker" onClick={() => setOpen(true)} title="View series">
                <GitBranch size={15} />
                <span>Series</span>
            </button>
            {open && <SeriesModal igdbId={igdbId} creds={creds} onClose={() => setOpen(false)} onOpenGame={(id) => { setOpen(false); onOpenGame?.(id); }} />}
        </>
    );
}