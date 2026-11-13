import { useEffect, useState } from "react";
import { AlertTriangle, Check, Cloud, Info } from "lucide-react";
import type { AppData } from "../../src/domain/game";
import { driveConfigured } from "./drive";
import { check, connect, disconnect, pull, push, refreshLocal, setIntervalMin, useSyncState, type SyncReport } from "./sync";

type Props = { data: AppData; update: (data: AppData) => void };
type Confirm = "restore" | "overwrite" | "disconnect" | null;

const when = (ms?: number | string) => (ms ? new Date(ms).toLocaleString() : "—");
const size = (n?: number) => (n === undefined ? "—" : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

function ReportRow({ r }: { r: SyncReport }) {
  return (
    <details className={`cloud-report ${r.ok ? "ok" : "bad"}`}>
      <summary>
        {r.ok ? <Check size={13} /> : <AlertTriangle size={13} />}
        <b>{r.kind === "push" ? "Backup" : "Restore"}</b>
        <span>{r.message || (r.ok ? "Done" : "Failed")}</span>
        <small>{when(r.at)}</small>
      </summary>
      <ul>
        <li>Trigger: {r.trigger === "auto" ? "automatic" : "manual"} · took {(r.durationMs / 1000).toFixed(1)} s</li>
        <li>Games: {r.games} · Collections: {r.collections} · Transferred: {size(r.bytes)}</li>
        <li>Images uploaded: {r.imagesUploaded} · downloaded: {r.imagesDownloaded} · removed from Drive: {r.imagesPruned}{r.imagesMissing ? ` · missing: ${r.imagesMissing}` : ""}</li>
      </ul>
    </details>
  );
}

export function CloudSection({ update }: Props) {
  const s = useSyncState();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [storage, setStorage] = useState("");
  const gamesHere = s.local.games;
  const busy = s.busy !== null;

  useEffect(() => {
    void refreshLocal();
    void (async () => {
      const [persisted, est] = await Promise.all([navigator.storage?.persisted?.(), navigator.storage?.estimate?.()]);
      setStorage(`${size(est?.usage)} used · ${persisted ? "protected from automatic cleanup" : "browser may clear it when space is low"}`);
    })();
  }, [s.lastSyncedAt]);

  const restore = async () => {
    setConfirm(null);
    const restored = await pull();
    if (restored) update(restored);
  };

  const note = (kind: "success" | "error" | "info", text: string, key: string) => (
    <div className={`notice ${kind}`} role="status" key={key}>
      {kind === "success" ? <Check size={15} /> : kind === "error" ? <AlertTriangle size={15} /> : <Info size={15} />}
      <span>{text}</span>
    </div>
  );

  return (
    <section className="glass settings-panel settings-panel--full cloud">
      <p className="eyebrow">WEB · GOOGLE DRIVE</p>
      <h2><Cloud size={16} style={{ verticalAlign: "-2px", marginRight: 8 }} />Cloud backup</h2>
      <p className="hint">
        Your library is stored in this browser. A compressed copy is synced to a private, app-only folder in your own Google Drive.
        Your IGDB keys stay on this device and are never uploaded or exported.
      </p>

      {!driveConfigured && note("error", "Google sign-in is not configured for this deployment (VITE_GOOGLE_CLIENT_ID is missing).", "cfg")}
      {s.error && note("error", s.error, "err")}
      {s.connected && s.needsAuth && note("info", "Google needs you to sign in again before the next sync.", "auth")}

      <div className="setting-row">
        <div>
          <strong>{s.connected ? `Connected${s.email ? ` as ${s.email}` : ""}` : "Not connected"}</strong>
          <span>{s.connected ? "Changes are backed up automatically." : "Connect to back up and sync your library."}</span>
        </div>
        {s.connected ? (
          <div className="confirm-actions">
            {s.needsAuth && <button className="button soft" disabled={busy} onClick={() => void connect()}>Reconnect</button>}
            <button className="button soft" disabled={busy} onClick={() => setConfirm("disconnect")}>Disconnect</button>
          </div>
        ) : (
          <button className="button soft" disabled={!driveConfigured || busy} onClick={() => void connect()}>Connect Google Drive</button>
        )}
      </div>

      {confirm === "disconnect" && (
        <div className="confirm-box info">
          <p>Disconnect from Google Drive? Your library stays on this device and the backup stays in your Drive.</p>
          <div className="confirm-actions">
            <button className="button soft" onClick={() => { setConfirm(null); void disconnect(); }}>Disconnect</button>
            <button className="button soft" onClick={() => setConfirm(null)}>Cancel</button>
          </div>
        </div>
      )}

      {s.connected && (
        <>
          {s.conflict && s.remote?.exists && (
            <div className="notice info" role="status">
              <Info size={15} />
              <span>
                {gamesHere === 0
                  ? `This device has no library, but Drive has a backup of ${s.remote.games ?? "?"} games. Restore it below.`
                  : "Drive has a different version than this device last synced (another device or an earlier session). Automatic backups are paused so nothing is overwritten — choose Restore or Overwrite below."}
              </span>
            </div>
          )}

          <div className="cloud-compare">
            <div /><b>This device</b><b>Google Drive</b>
            <span>Games</span><span>{gamesHere}</span><span>{s.remote?.exists ? (s.remote.games ?? "unreadable") : "no backup"}</span>
            <span>Collections</span><span>{s.local.collections}</span><span>{s.remote?.exists ? (s.remote.collections ?? "—") : "—"}</span>
            <span>Images</span><span>{s.local.images}</span><span>{s.remote?.exists ? (s.remote.images ?? "—") : "—"}</span>
            <span>Last change</span><span>{s.dirty ? "unsynced edits" : "in sync"}</span><span>{when(s.remote?.modifiedTime)}</span>
            <span>Backup size</span><span>—</span><span>{size(s.remote?.bytes)}</span>
          </div>
          <p className="hint">Last successful sync: {when(s.lastSyncedAt)}{storage ? ` · Browser storage: ${storage}` : ""}</p>

          <div className="setting-row">
            <div><strong>Automatic backup</strong><span>Uploads only when something changed, at most once per interval.</span></div>
            <select value={s.intervalMin} onChange={(e) => void setIntervalMin(Number(e.target.value))}>
              <option value={1}>Every minute</option>
              <option value={5}>Every 5 minutes</option>
              <option value={15}>Every 15 minutes</option>
              <option value={30}>Every 30 minutes</option>
              <option value={0}>Manual only</option>
            </select>
          </div>

          <div className="confirm-actions" style={{ marginTop: 14 }}>
            <button className="button soft" disabled={busy || s.conflict} onClick={() => void push({ trigger: "manual" })}>Back up now</button>
            <button className="button soft" disabled={busy} onClick={() => void check(true)}>Check Drive</button>
            <button className="button danger" disabled={busy || !s.remote?.exists} onClick={() => setConfirm("restore")}>Restore from Drive…</button>
            {s.conflict && gamesHere > 0 && (
              <button className="button danger" disabled={busy} onClick={() => setConfirm("overwrite")}>Overwrite Drive with this device…</button>
            )}
          </div>

          {s.busy && <p className="hint cloud-progress">{s.busy === "check" ? "Checking" : s.busy === "push" ? "Backing up" : "Restoring"}… {s.progress ?? ""}</p>}

          {confirm === "restore" && (
            <div className="confirm-box">
              <p>
                Replace the library on this device with the Drive backup ({s.remote?.games ?? "?"} games, saved {when(s.remote?.savedAt)})?
                This device currently has {gamesHere} games. Your IGDB keys on this device are kept.
              </p>
              <div className="confirm-actions">
                <button className="button danger" onClick={() => void restore()}>Restore</button>
                <button className="button soft" onClick={() => setConfirm(null)}>Cancel</button>
              </div>
            </div>
          )}
          {confirm === "overwrite" && (
            <div className="confirm-box">
              <p>Replace the Drive backup ({s.remote?.games ?? "?"} games) with this device's library ({gamesHere} games)? The Drive version cannot be recovered afterwards.</p>
              <div className="confirm-actions">
                <button className="button danger" onClick={() => { setConfirm(null); void push({ trigger: "manual", force: true }); }}>Overwrite Drive</button>
                <button className="button soft" onClick={() => setConfirm(null)}>Cancel</button>
              </div>
            </div>
          )}

          {s.history.length > 0 && (
            <div className="cloud-history">
              <h3>Sync reports</h3>
              {s.history.map((r) => <ReportRow key={r.id} r={r} />)}
            </div>
          )}
        </>
      )}
    </section>
  );
}

