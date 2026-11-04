import { BookOpen, Check, Sparkles } from "lucide-react";
import type { AppData } from "../domain/game";
import { Header } from "../components/shared";
import "./settings.css";

export function SettingsView({ data, update }: { data: AppData; update: (data: AppData) => void }) {
  const updateSettings = (partial: Partial<AppData["settings"]>) => {
    update({ ...data, settings: { ...data.settings, ...partial } });
  };

  return (
    <>
      <Header eyebrow="WORKSPACE CONTROL" title="Settings" />
      <div className="settings-grid">
        <section className="glass settings-panel">
          <p className="eyebrow">PREFERENCES & APPEARANCE</p><h2>Preferences</h2>
          <div className="setting-row"><div><strong>Active theme</strong><span>Aurora glass aesthetic</span></div><span className="pill"><Sparkles size={13} /> Aurora</span></div>
        </section>
        <section className="glass settings-panel">
          <p className="eyebrow">GAME DATABASE</p><h2>IGDB connection</h2>
          <div className="setting-row"><div><strong>Client ID</strong><span>From dev.twitch.tv/console</span></div><input style={{ width: 240 }} value={data.settings.igdbClientId ?? ""} onChange={(e) => updateSettings({ igdbClientId: e.target.value.trim() })} /></div>
          <div className="setting-row"><div><strong>Client Secret</strong><span>Stored locally only</span></div><input style={{ width: 240 }} type="password" value={data.settings.igdbClientSecret ?? ""} onChange={(e) => updateSettings({ igdbClientSecret: e.target.value.trim() })} /></div>
        </section>
        <section className="glass settings-panel">
          <p className="eyebrow">LOCAL SQLITE STORAGE</p><h2>Your data stays yours</h2>
          <p className="muted">SQLite database: C:\Users\&lt;Username&gt;\AppData\Roaming\com.lostinsync.desktop\lost-in-sync.sqlite</p><p className="muted">Exported backup is stored in download section</p>
          <div className="detail-actions">
            <button className="button soft" onClick={() => { const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `lost-in-sync-backup-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(link.href); }}><BookOpen size={15} /> Export backup</button>
            <label className="button soft">Import backup<input type="file" accept="application/json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void file.text().then((text) => { try { update(JSON.parse(text) as AppData); } catch { window.alert("That backup file is not valid Lost in Sync data."); } }); }} /></label>
          </div>
          <span className="pill success"><Check size={13} /> SQLite connected & synchronized</span>
        </section>
      </div>
    </>
  );
}
