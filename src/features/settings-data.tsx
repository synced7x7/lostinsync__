import { useRef, useState } from "react";
import { AlertTriangle, Check, FileSpreadsheet, Info, Trash2, Upload, Download, X } from "lucide-react";
import { hasTauri, saveTextFile, type IgdbCreds } from "../data/igdb";
import { importBackloggd, reportSections, reportToText, type BlEntry, type ImportProgress, type ImportReport } from "../data/backloggd";
import type { AppData } from "../domain/game";
import { RefreshCw } from "lucide-react";
import { applyPatches, syncReportSections, syncReportToText, syncWithIgdb, type SyncProgress, type SyncReport } from "../data/sync";
import { STATUSES } from "../domain/game";
import type { AppSettings } from "../domain/game";
import { GAME_TYPES, UNSET_TYPE } from "../domain/gametype";
import { SORT_OPTIONS, librarySession, libraryDefaults } from "../domain/library-session";
import { option } from "framer-motion/m";

type Notice = { kind: "success" | "error" | "info"; text: string };
type Props = { data: AppData; update: (data: AppData) => void };

function NoticeBar({ notice, onClose }: { notice?: Notice; onClose: () => void }) {
  if (!notice) return null;
  const Icon = notice.kind === "success" ? Check : notice.kind === "error" ? AlertTriangle : Info;
  return (
    <div className={`notice ${notice.kind}`} role="status">
      <Icon size={15} /><span>{notice.text}</span>
      <button type="button" aria-label="Dismiss" onClick={onClose}><X size={13} /></button>
    </div>
  );
}

const stamp = () => new Date().toISOString().slice(0, 10);
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

function toCsv(data: AppData) {
  const head = ["Title", "Status", "Rating", "Platform", "Genres", "Developer", "Release date", "Started", "Finished", "Total hours", "Favorite"];
  const rows = data.games.map((g) => [
    g.title, g.status, g.rating ?? "", g.playedPlatforms?.length ? g.playedPlatforms.join("; ") : g.platform,
    (g.genres?.length ? g.genres : [g.genre]).filter(Boolean).join("; "), g.developer ?? "", g.releaseDate ?? "",
    g.startedAt ?? "", g.finishedAt ?? "", (g.totalSeconds / 3600).toFixed(1), g.favorite ? "Yes" : "No",
  ]);
  return "\uFEFF" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Desktop: native "Save as" dialog. Browser: normal download. Returns null if the user cancelled. */
async function saveOrDownload(name: string, contents: string, mime: string, ext: string, label: string): Promise<{ where: string } | null> {
  if (hasTauri) {
    const path = await saveTextFile(name, contents, label, ext);
    return path ? { where: path } : null;
  }
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
  return { where: "your browser's downloads folder" };
}

export function DataSection({ data, update }: Props) {
  return (
    <>
      <LibraryDefaultsSection data={data} update={update} />
      <StorageSection data={data} update={update} />
      <DeleteSection data={data} update={update} />
      <SyncSection data={data} update={update} />
      <BackloggdSection data={data} update={update} />
    </>
  );
}

function StorageSection({ data, update }: Props) {
  const [notice, setNotice] = useState<Notice>();
  const err = (what: string, e: unknown) => setNotice({ kind: "error", text: `${what} failed: ${e instanceof Error ? e.message : String(e)}` });

  const exportJson = async () => {
    try {
      const settings = { ...data.settings };
      delete settings.igdbClientId; // never write your IGDB keys into a backup file
      delete settings.igdbClientSecret;
      const res = await saveOrDownload(`lost-in-sync-backup-${stamp()}.json`, JSON.stringify({ ...data, settings }, null, 2), "application/json", "json", "JSON backup");
      setNotice(res
        ? { kind: "success", text: `Backup exported (${data.games.length} games, ${(data.collections ?? []).length} collections). Saved to: ${res.where}` }
        : { kind: "info", text: "Export cancelled. No file was saved." });
    } catch (e) { err("Export", e); }
  };

  const exportCsv = async () => {
    try {
      const res = await saveOrDownload(`lost-in-sync-library-${stamp()}.csv`, toCsv(data), "text/csv", "csv", "CSV spreadsheet");
      setNotice(res
        ? { kind: "success", text: `CSV exported (${data.games.length} games). Saved to: ${res.where}` }
        : { kind: "info", text: "Export cancelled. No file was saved." });
    } catch (e) { err("CSV export", e); }
  };

  const importJson = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || !Array.isArray(parsed.games) || typeof parsed.profile !== "object" || typeof parsed.settings !== "object") throw new Error("shape");
      update({
        ...parsed,
        collections: parsed.collections ?? [],
        profile: { ...data.profile, ...parsed.profile },
        settings: { ...data.settings, ...parsed.settings, igdbClientId: data.settings.igdbClientId, igdbClientSecret: data.settings.igdbClientSecret },
      });
      setNotice({ kind: "success", text: `Backup imported: ${parsed.games.length} games and ${(parsed.collections ?? []).length} collections restored. Your IGDB keys were kept.` });
    } catch {
      setNotice({ kind: "error", text: "That file is not a valid Lost in Sync backup. Nothing was changed." });
    }
  };

  return (
    <section className="glass settings-panel">
      <p className="eyebrow">LOCAL SQLITE STORAGE</p><h2>Your data stays yours</h2>
      <p className="muted">SQLite database: <strong>lost-in-sync.sqlite</strong></p>
      <p className="muted">All your games, preferences, and profile settings are stored locally in the native SQLite backend.</p>
      <div className="detail-actions">
        <button className="button soft" onClick={() => void exportJson()}><Download size={15} /> Export backup</button>
        <button className="button soft" onClick={() => void exportCsv()}><FileSpreadsheet size={15} /> Export CSV</button>
        <label className="button soft"><Upload size={15} /> Import backup
          <input type="file" accept="application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importJson(f); }} />
        </label>
      </div>
      <NoticeBar notice={notice} onClose={() => setNotice(undefined)} />
      <p className="hint">Importing a backup replaces your current library. Backups never include your IGDB keys.</p>
    </section>
  );
}

function DeleteSection({ data, update }: Props) {
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const games = data.games.length, cols = (data.collections ?? []).length;
  const wipe = () => {
    update({ ...data, games: [], collections: [], profile: { ...data.profile, topFive: [] } });
    setAsking(false);
    setNotice({ kind: "success", text: `Library deleted: ${games} games and ${cols} collections removed. Your profile and settings were kept.` });
  };
  return (
    <section className="glass settings-panel danger">
      <p className="eyebrow">DANGER ZONE</p><h2>Delete library</h2>
      <p className="muted">Removes every game and collection (and your Hall of Fame picks). Your profile, settings and IGDB keys are kept. This cannot be undone, so export a backup first.</p>
      {!asking ? (
        <div className="detail-actions">
          <button className="button danger" disabled={!games && !cols} onClick={() => { setNotice(undefined); setAsking(true); }}><Trash2 size={15} /> Delete entire library…</button>
        </div>
      ) : (
        <div className="confirm-box">
          <p><strong>Are you sure?</strong> This permanently deletes {games} games and {cols} collections.</p>
          <div className="confirm-actions">
            <button className="button danger" onClick={wipe}>Yes, delete everything</button>
            <button className="button soft" onClick={() => setAsking(false)}>No, keep my library</button>
          </div>
        </div>
      )}
      <NoticeBar notice={notice} onClose={() => setNotice(undefined)} />
    </section>
  );
}

function LibraryDefaultsSection({ data, update }: Props) {
  const d = libraryDefaults(data.settings);
  const set = (partial: Partial<AppSettings>) => {
    librarySession.prefs = null; // Library re-seeds from these defaults on next visit
    update({ ...data, settings: { ...data.settings, ...partial } });
  };
  const row = (title: string, hint: string, control: React.ReactNode) => (
    <div className="setting-row"><div><strong>{title}</strong><span>{hint}</span></div>{control}</div>
  );
  return (
    <section className="glass settings-panel settings-panel--full">
      <p className="eyebrow">LIBRARY</p><h2>Default filters &amp; view</h2>
      <div className="setting-cols">
        <div className="setting-row">
          Status
          <select value={d.filter} onChange={(e) => set({ libraryFilter: e.target.value as AppSettings["libraryFilter"] })}>
            <option value="All">All statuses</option>
            {STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        
        <div className="setting-row">
          Game type
          <select value={d.gameType} onChange={(e) => set({ libraryGameType: e.target.value })}>
            <option value="All">All types</option>
            {GAME_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            <option value={UNSET_TYPE}>Type not set</option>
          </select>
        </div>



        <div className="setting-row">
          Sort by
          <select value={d.sort} onChange={(e) => set({ librarySort: e.target.value as AppSettings["librarySort"] })}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
    
        <div className="setting-row">
          Direction
          <select value={d.direction} onChange={(e) => set({ librarySortDirection: e.target.value as AppSettings["librarySortDirection"] })}>
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>

        <div className="setting-row">
          View
          <select
            value={d.fullscreen ? "fullscreen" : d.layout}
            onChange={(e) => {
              const v = e.target.value;
              set(v === "fullscreen" ? { libraryLayout: "ps4", libraryFullscreen: true }
                : { libraryLayout: v as AppSettings["libraryLayout"], libraryFullscreen: false });
            }}
          >
            <option value="ps4">PS4 shelf</option>
            <option value="fullscreen">Fullscreen shelf</option>
            <option value="catalog">Grid</option>
          </select>
        </div>

        <div className="setting-row">
          Grid size
          <select value={d.gridSize} onChange={(e) => set({ gridSize: e.target.value as AppSettings["gridSize"] })}>
            <option value="sm">Small</option>
            <option value="md">Medium</option>
            <option value="lg">Large</option>
          </select>
        </div>
      </div>
    </section>
  );
}

type Phase =
  | { kind: "idle" }
  | { kind: "ready"; fileName: string; entries: BlEntry[] }
  | { kind: "running"; progress: ImportProgress }
  | { kind: "done"; report: ImportReport };

function BackloggdSection({ data, update }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [notice, setNotice] = useState<Notice>();
  const abort = useRef<AbortController | null>(null);
  const latest = useRef(data);
  latest.current = data;
  const creds: IgdbCreds = { clientId: data.settings.igdbClientId ?? "", clientSecret: data.settings.igdbClientSecret ?? "" };
  const canRun = hasTauri && !!creds.clientId && !!creds.clientSecret;

  const pickFile = async (file: File) => {
    setNotice(undefined);
    try {
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed)) throw new Error("not an array");
      const entries = (parsed as BlEntry[]).filter((e) => e && e.id != null);
      if (!entries.length) throw new Error("no entries");
      setPhase({ kind: "ready", fileName: file.name, entries });
    } catch {
      setPhase({ kind: "idle" });
      setNotice({ kind: "error", text: "That doesn't look like a Backloggd export (a JSON list of games). Nothing was imported." });
    }
  };

  const run = async () => {
    if (phase.kind !== "ready") return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase({ kind: "running", progress: { phase: "platforms", done: 0, total: phase.entries.length } });
    try {
      const { games, report } = await importBackloggd(phase.entries, latest.current.games, creds, (progress) => setPhase({ kind: "running", progress }), ctrl.signal);
      if (games.length) update({ ...latest.current, games: [...latest.current.games, ...games] });
      setPhase({ kind: "done", report });
      setNotice({
        kind: report.failures.length || report.notFound.length ? "info" : "success",
        text: `${report.cancelled ? "Import cancelled. " : "Import finished. "}${report.imported} games added${report.duplicates.length ? `, ${report.duplicates.length} skipped as duplicates` : ""}. See the report below.`,
      });
    } catch (e) {
      setPhase({ kind: "idle" });
      setNotice({ kind: "error", text: `Import failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const pct = phase.kind === "running" && phase.progress.total ? Math.round((phase.progress.done / phase.progress.total) * 100) : 0;

  return (
    <section className="glass settings-panel">
      <p className="eyebrow">IMPORT</p><h2>Import from Backloggd</h2>
      <p className="muted">Reads a Backloggd JSON export, then fetches every game's details, images and trailers from IGDB. Your ratings, status, dates, time, notes and favorites come from the file.</p>
      <div className="notice info" role="note">
        <Info size={15} />
        <span>
          Games already in your library with the same IGDB id are skipped. Games you added by hand without picking them from IGDB can't be detected, so <strong>delete your library first</strong> to avoid duplicate entries.
        </span>
      </div>
      {!canRun && <p className="hint">{hasTauri ? "Add your IGDB Client ID and Secret above to enable importing." : "Importing works in the desktop app only."}</p>}

      {(phase.kind === "idle" || phase.kind === "done") && (
        <div className="detail-actions">
          <label className={`button soft${canRun ? "" : " disabled"}`}><Upload size={15} /> Choose Backloggd file
            <input type="file" accept="application/json" hidden disabled={!canRun} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pickFile(f); }} />
          </label>
        </div>
      )}

      {phase.kind === "ready" && (
        <div className="confirm-box info">
          <p><strong>{phase.fileName}</strong>: {phase.entries.length} entries found. Start the import?</p>
          <div className="confirm-actions">
            <button className="button primary" onClick={() => void run()}>Start import</button>
            <button className="button soft" onClick={() => setPhase({ kind: "idle" })}>Cancel</button>
          </div>
        </div>
      )}

      {phase.kind === "running" && (
        <div className="import-progress">
          <span className="muted">
            {phase.progress.phase === "platforms" ? "Loading the platform list…" : `Fetching games from IGDB… ${Math.min(phase.progress.done, phase.progress.total)} / ${phase.progress.total}`}
          </span>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
          <div className="confirm-actions"><button className="button soft" onClick={() => abort.current?.abort()}>Cancel after this batch</button></div>
        </div>
      )}

      {phase.kind === "done" && (
        <div className="import-report">
          <div className="report-chips">
            <span className="pill success"><Check size={13} /> {phase.report.imported} imported</span>
            {phase.report.duplicates.length > 0 && <span className="pill">{phase.report.duplicates.length} skipped</span>}
            {phase.report.notFound.length > 0 && <span className="pill">{phase.report.notFound.length} not on IGDB</span>}
            {phase.report.failures.length > 0 && <span className="pill">{phase.report.failures.length} failed</span>}
          </div>
          {reportSections(phase.report).map((s) => (
            <details key={s.title}>
              <summary>{s.title} ({s.items.length})</summary>
              <ul>{s.items.map((i, k) => <li key={k}>{i}</li>)}</ul>
            </details>
          ))}
          <div className="detail-actions">
            <button className="button soft" onClick={() => {
              void navigator.clipboard.writeText(reportToText(phase.report))
                .then(() => setNotice({ kind: "success", text: "Report copied to the clipboard." }))
                .catch(() => setNotice({ kind: "error", text: "Could not copy the report." }));
            }}>Copy report</button>
          </div>
        </div>
      )}
      <NoticeBar notice={notice} onClose={() => setNotice(undefined)} />
    </section>
  );
}


type SyncPhase = { kind: "idle" } | { kind: "running"; progress: SyncProgress } | { kind: "done"; report: SyncReport };

function SyncSection({ data, update }: Props) {
  const [phase, setPhase] = useState<SyncPhase>({ kind: "idle" });
  const [notice, setNotice] = useState<Notice>();
  const abort = useRef<AbortController | null>(null);
  const latest = useRef(data);
  latest.current = data;
  const creds: IgdbCreds = { clientId: data.settings.igdbClientId ?? "", clientSecret: data.settings.igdbClientSecret ?? "" };
  const canRun = hasTauri && !!creds.clientId && !!creds.clientSecret;
  const linked = data.games.filter((g) => typeof g.igdbId === "number").length;
  const last = data.settings.lastIgdbSyncAt;

  const run = async () => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setNotice(undefined);
    setPhase({ kind: "running", progress: { phase: "checking", done: 0, total: linked } });
    try {
      const { patches, report } = await syncWithIgdb(latest.current.games, creds, (progress) => setPhase({ kind: "running", progress }), ctrl.signal);
      const cur = latest.current; // merge into the freshest library, in case it changed while syncing
      update({
        ...cur,
        games: patches.size ? applyPatches(cur.games, patches) : cur.games,
        settings: report.cancelled ? cur.settings : { ...cur.settings, lastIgdbSyncAt: new Date().toISOString() },
      });
      setPhase({ kind: "done", report });
      setNotice({
        kind: report.failures.length ? "info" : "success",
        text: `${report.cancelled ? "Sync cancelled. " : "Sync complete. "}${report.updated.length} updated, ${report.refreshed.length} refreshed with no visible changes, ${report.upToDate} already up to date (skipped). No games were deleted.`,
      });
    } catch (e) {
      setPhase({ kind: "idle" });
      setNotice({ kind: "error", text: `Sync failed: ${e instanceof Error ? e.message : String(e)}. Nothing was changed.` });
    }
  };

  const pct = phase.kind === "running" && phase.progress.total ? Math.round((phase.progress.done / phase.progress.total) * 100) : 0;

  return (
    <section className="glass settings-panel">
      <p className="eyebrow">KEEP DATA FRESH</p><h2>IGDB sync</h2>
      <p className="muted">Compares every game's IGDB id and last-update stamp with IGDB. Games that changed there get their IGDB data refreshed (details, release info, ratings, time to beat, images, trailers). Unchanged games are skipped.</p>
      <div className="notice info" role="note">
        <Info size={15} />
        <span>Your own data is never touched: status, rating, notes, dates, playtime, favorites, tags, played platforms, custom covers and screenshots. No game is ever deleted. Games missing from IGDB are kept and listed in the report.</span>
      </div>
      <p className="hint">{linked} of {data.games.length} games are linked to IGDB. {last ? `Last sync: ${new Date(last).toLocaleString()}.` : "Never synced."}</p>
      {!canRun && <p className="hint">{hasTauri ? "Add your IGDB Client ID and Secret above to enable syncing." : "Syncing works in the desktop app only."}</p>}

      {phase.kind !== "running" && (
        <div className="detail-actions">
          <button className="button soft" disabled={!canRun || !linked} onClick={() => void run()}><RefreshCw size={15} /> Sync with IGDB</button>
        </div>
      )}

      {phase.kind === "running" && (
        <div className="import-progress">
          <span className="muted">
            {phase.progress.phase === "checking" ? "Checking which games changed on IGDB…" : `Updating changed games… ${Math.min(phase.progress.done, phase.progress.total)} / ${phase.progress.total}`}
          </span>
          <div className="bar"><i style={{ width: `${phase.progress.phase === "checking" ? 4 : pct}%` }} /></div>
          <div className="confirm-actions"><button className="button soft" onClick={() => abort.current?.abort()}>Cancel after this batch</button></div>
        </div>
      )}

      {phase.kind === "done" && (
        <div className="import-report">
          <div className="report-chips">
            <span className="pill success"><Check size={13} /> {phase.report.updated.length} updated</span>
            <span className="pill">{phase.report.upToDate} up to date</span>
            {phase.report.refreshed.length > 0 && <span className="pill">{phase.report.refreshed.length} no visible changes</span>}
            {phase.report.notOnIgdb.length > 0 && <span className="pill">{phase.report.notOnIgdb.length} not on IGDB</span>}
            {phase.report.notLinked.length > 0 && <span className="pill">{phase.report.notLinked.length} not linked</span>}
            {phase.report.failures.length > 0 && <span className="pill">{phase.report.failures.length} failed</span>}
          </div>
          {syncReportSections(phase.report).map((s) => (
            <details key={s.title}>
              <summary>{s.title} ({s.items.length})</summary>
              <ul>{s.items.map((i, k) => <li key={k}>{i}</li>)}</ul>
            </details>
          ))}
          <div className="detail-actions">
            <button className="button soft" onClick={() => {
              void navigator.clipboard.writeText(syncReportToText(phase.report))
                .then(() => setNotice({ kind: "success", text: "Report copied to the clipboard." }))
                .catch(() => setNotice({ kind: "error", text: "Could not copy the report." }));
            }}>Copy report</button>
          </div>
        </div>
      )}
      <NoticeBar notice={notice} onClose={() => setNotice(undefined)} />
    </section>
  );
}