import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Info, Link2, RefreshCw, X } from "lucide-react";
import type { AppData, StoreId } from "../domain/game";
import type { IgdbCreds } from "../data/igdb";
import {
  isDesktop, storesAuthUrl, storesCompleteAuth, storesStatus,
  type StoreStatus,
} from "../data/stores/ipc";
import { fetchStoreRecords, importFromStore } from "../data/stores/import";
import {
  STORES, storeById, storeReportSections, storeReportToText,
  type StoreImportProgress, type StoreImportReport, type StoreRecord,
} from "../data/stores/types";

type Notice = { kind: "success" | "error" | "info"; text: string };
type Props = { data: AppData; update: (data: AppData) => void };
type Phase =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "ready"; records: StoreRecord[] }
  | { kind: "running"; progress: StoreImportProgress }
  | { kind: "done"; report: StoreImportReport };

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

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function openExternal(url: string) {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
    return;
  } catch {
    // Tauri opener is unavailable in web dev; fall back to the browser.
  }
  if (!window.open(url, "_blank", "noopener,noreferrer")) {
    throw new Error("Could not open your browser. Allow pop-ups for this app and try again.");
  }
}

export function StoresSection({ data, update }: Props) {
  const [store, setStore] = useState<StoreId>("steam");
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [notice, setNotice] = useState<Notice>();
  const abort = useRef<AbortController | null>(null);
  const latest = useRef(data);
  latest.current = data;

  const connector = storeById(store)!;
  const creds: IgdbCreds = { clientId: data.settings.igdbClientId ?? "", clientSecret: data.settings.igdbClientSecret ?? "" };
  const canMatch = !!creds.clientId && !!creds.clientSecret;
  const steam = { apiKey: data.settings.steamApiKey ?? "", steamId: data.settings.steamId ?? "" };
  const hasSteam = !!steam.apiKey && !!steam.steamId;

  const updateSettings = (partial: Partial<AppData["settings"]>) =>
    update({ ...data, settings: { ...data.settings, ...partial } });

  const refreshStatus = async () => {
    if (!isDesktop) return; // web shares this module but must never call store IPC
    try { setStatus(await storesStatus(hasSteam)); }
    catch { setStatus({ steam: hasSteam, epic: false }); }
  };

  useEffect(() => {
    void refreshStatus();
  }, [hasSteam]);

  const changeStore = (id: StoreId) => {
    setStore(id); setCode(""); setPhase({ kind: "idle" }); setNotice(undefined);
    void refreshStatus();
  };

  const openAuth = async () => {
    try {
      const url = await storesAuthUrl(store);
      await openExternal(url);
      setNotice({ kind: "info", text: "Sign in in the browser window, then paste the code from the page you land on into the box below." });
    } catch (e) { setNotice({ kind: "error", text: errText(e) }); }
  };

  const completeAuth = async () => {
    try {
      setNotice(undefined);
      setStatus(await storesCompleteAuth(store, code.trim(), hasSteam));
      setCode("");
      setNotice({ kind: "success", text: `${connector.name} signed in. Tokens are stored only on this device.` });
    } catch (e) { setNotice({ kind: "error", text: `Sign-in failed: ${errText(e)}` }); }
  };

  const scan = async () => {
    setNotice(undefined);
    setPhase({ kind: "fetching" });
    try {
      const records = await fetchStoreRecords(store, store === "steam" ? steam : undefined);
      if (!records.length) {
        setPhase({ kind: "idle" });
        setNotice({ kind: "info", text: `No games were returned by ${connector.name}.` });
        return;
      }
      setPhase({ kind: "ready", records });
    } catch (e) {
      void refreshStatus(); // the stored token may have been removed elsewhere
      setPhase({ kind: "idle" });
      setNotice({ kind: "error", text: `${connector.name} could not be read: ${errText(e)}` });
    }
  };

  const run = async () => {
    if (phase.kind !== "ready") return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase({ kind: "running", progress: { phase: "matching", done: 0, total: phase.records.length } });
    try {
      const { games, patches, report } = await importFromStore({
        store, records: phase.records, data: latest.current, creds, steam,
        onProgress: (progress) => setPhase({ kind: "running", progress }), signal: ctrl.signal,
      });
      const cur = latest.current;
      const merged = cur.games.map((g) => { const p = patches.get(g.id); return p ? { ...g, ...p } : g; });
      update({
        ...cur,
        games: [...merged, ...games],
        settings: report.cancelled ? cur.settings : { ...cur.settings, lastStoreSyncAt: new Date().toISOString(), storeSyncSource: store },
      });
      setPhase({ kind: "done", report });
      setNotice({
        kind: report.failures.length || report.needsReview.length ? "info" : "success",
        text: `${report.cancelled ? "Import cancelled. " : "Import finished. "}${report.imported} added, ${report.linked} linked, ${report.updated} refreshed. See the report below.`,
      });
    } catch (e) {
      setPhase({ kind: "idle" });
      setNotice({ kind: "error", text: `Import failed: ${errText(e)}` });
    }
  };

  const pct = phase.kind === "running" && phase.progress.total
    ? Math.round((phase.progress.done / phase.progress.total) * 100) : 0;
  const progressLabel = phase.kind !== "running" ? "" : ({
    achievements: "Fetching achievements", matching: "Matching games to IGDB",
    details: "Fetching IGDB details", fetching: "Reading store", done: "Finishing",
  } as Record<StoreImportProgress["phase"], string>)[phase.progress.phase];

  // Web build shares this file but has no Tauri IPC — never render store connections there.
  if (!isDesktop) return null;

  return (
    <section className="glass settings-panel settings-panel--full">
      <p className="eyebrow">DESKTOP ONLY · ONE-WAY IMPORT</p><h2>Import from game stores</h2>
      <p className="muted">Steam maps everything it knows into your library: Wishlist → Wishlist, unplayed → Backlog, recently played → Playing (with a start date and no completion date), and played-but-not-recent → Completed (with last played as completion date). Full achievement sets set Mastery. Epic imports ownership only — no playtime, dates or achievements — so its games start as Backlog. Status is only set on first import; later syncs refresh store-owned fields but leave your own status edits alone.</p>
      <div className="notice info" role="note">
        <Info size={15} />
        <span>
          Steam uses its official Web API and public wishlist. Epic uses unofficial endpoints that can break. Steam keys are saved with your app settings like the IGDB keys and excluded from backups; Epic tokens stay on this device.
        </span>
      </div>

      <div className="detail-actions">
        {STORES.map((s) => (
          <button key={s.id} type="button" className={`button ${store === s.id ? "primary" : "soft"}`} onClick={() => changeStore(s.id)}>{s.name}</button>
        ))}
      </div>

      <div className="settings-credentials">
        <p className="muted"><strong>{connector.name}</strong> — {connector.blurb}</p>
        <p className="hint">
          Status: {status ? (status[store] ? "Connected" : "Not connected") : "Checking…"}
          {data.settings.lastStoreSyncAt && data.settings.storeSyncSource === store
            ? ` Last sync: ${new Date(data.settings.lastStoreSyncAt).toLocaleString()}.` : ""}
        </p>
      </div>

      {store === "steam" && (
        <div className="settings-credentials">
          <label>Steam Web API key
            <input type="password" value={steam.apiKey} placeholder="32 hex characters"
              onChange={(e) => updateSettings({ steamApiKey: e.target.value })} />
          </label>
          <label>SteamID64
            <input value={steam.steamId} placeholder="17-digit id"
              onChange={(e) => updateSettings({ steamId: e.target.value })} />
          </label>
          <p className="hint">Saved automatically with your settings, like the IGDB key, and stripped from JSON backups. Set Game details to Public in Steam; keep your wishlist public to import Wishlist titles. Achievements are always imported.</p>
        </div>
      )}

      {connector.capabilities.usesOAuth && status && !status[store] && (
        <div className="settings-credentials">
          <div className="detail-actions">
            <button type="button" className="button soft" disabled={!isDesktop} onClick={() => void openAuth()}>Open sign-in page</button>
          </div>
          <label>Authorization code
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Paste the code from the redirect page" />
          </label>
          <div className="detail-actions"><button type="button" className="button soft" disabled={!isDesktop || !code.trim()} onClick={() => void completeAuth()}>Complete sign-in</button></div>
        </div>
      )}

      {!canMatch && <p className="hint">Add IGDB credentials in Settings to enrich imported games with covers and metadata. Without them games are imported locally and listed as needing review.</p>}

      {phase.kind === "idle" && (
        <div className="detail-actions">
          <button type="button" className="button soft" disabled={!isDesktop || (store === "steam" ? !hasSteam : (connector.capabilities.needsSignIn && !status?.[store]))}
            onClick={() => void scan()}><RefreshCw size={15} /> Fetch library</button>
        </div>
      )}

      {phase.kind === "fetching" && <p className="muted">Reading {connector.name}…</p>}

      {phase.kind === "ready" && (
        <div className="confirm-box info">
          <p><strong>{phase.records.length}</strong> games found on {connector.name}. Import them now?</p>
          <div className="confirm-actions">
            <button type="button" className="button primary" onClick={() => void run()}>Start import</button>
            <button type="button" className="button soft" onClick={() => setPhase({ kind: "idle" })}>Cancel</button>
          </div>
        </div>
      )}

      {phase.kind === "running" && (
        <div className="import-progress">
          <span className="muted">{progressLabel}… {Math.min(phase.progress.done, phase.progress.total)} / {phase.progress.total}</span>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
          <div className="confirm-actions"><button type="button" className="button soft" onClick={() => abort.current?.abort()}>Cancel</button></div>
        </div>
      )}

      {phase.kind === "done" && (
        <div className="import-report">
          <div className="report-chips">
            <span className="pill success"><Check size={13} /> {phase.report.imported} imported</span>
            <span className="pill"><Link2 size={13} /> {phase.report.linked} linked</span>
            {phase.report.updated > 0 && <span className="pill">{phase.report.updated} refreshed</span>}
            {phase.report.needsReview.length > 0 && <span className="pill">{phase.report.needsReview.length} need review</span>}
            {phase.report.duplicates > 0 && <span className="pill">{phase.report.duplicates} duplicates</span>}
            {phase.report.failures.length > 0 && <span className="pill">{phase.report.failures.length} failed</span>}
          </div>
          {storeReportSections(phase.report).map((s) => (
            <details key={s.title}>
              <summary>{s.title} ({s.items.length})</summary>
              <ul>{s.items.map((i, k) => <li key={k}>{i}</li>)}</ul>
            </details>
          ))}
          <div className="detail-actions">
            <button type="button" className="button soft" onClick={() => {
              void navigator.clipboard.writeText(storeReportToText(phase.report))
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
