import { BookOpen, Check, Sparkles } from "lucide-react";
import type { AppData, AppSettings, GridSize, LibraryLayout, LibrarySort, View } from "../domain/game";
import { Header } from "../components/shared";
import "./settings.css";

export function SettingsView({ data, update }: { data: AppData; update: (data: AppData) => void }) {
  const updateSettings = (partial: Partial<AppSettings>) => {
    update({ ...data, settings: { ...data.settings, ...partial } });
  };

  return (
    <>
      <Header eyebrow="WORKSPACE CONTROL" title="Settings" />
      <div className="settings-grid">
        <section className="glass settings-panel">
          <p className="eyebrow">PREFERENCES & APPEARANCE</p><h2>Preferences</h2>
          <div className="setting-row"><div><strong>Active theme</strong><span>Aurora glass aesthetic</span></div><span className="pill"><Sparkles size={13} /> Aurora</span></div>
          <div className="setting-row"><div><strong>Default library style</strong><span>Choose how your collection displays</span></div><select value={data.settings.libraryLayout ?? "ps4"} onChange={(e) => updateSettings({ libraryLayout: e.target.value as LibraryLayout })}><option value="ps4">PS4 Ribbon Carousel</option><option value="catalog">Catalog Cover Grid</option></select></div>
          <div className="setting-row"><div><strong>Catalog cover size</strong><span>Default size for grid cards</span></div><select value={data.settings.gridSize ?? "md"} onChange={(e) => updateSettings({ gridSize: e.target.value as GridSize })}><option value="sm">Small (Compact)</option><option value="md">Medium (Balanced)</option><option value="lg">Large (Poster)</option></select></div>
          <div className="setting-row"><div><strong>Default sorting</strong><span>Default order for collection</span></div><select value={data.settings.librarySort ?? "recent"} onChange={(e) => updateSettings({ librarySort: e.target.value as LibrarySort })}><option value="recent">When added</option><option value="completion">Last played (Completion Time)</option><option value="playtime">Time played</option><option value="rating">User rating</option><option value="igdbRating">IGDB rating</option><option value="title">Title</option><option value="releaseDate">Release date</option><option value="avgTime">Avg time to complete</option><option value="mainTime">Main story completion time</option><option value="fullTime">100% completion time</option></select></div>
          <div className="setting-row"><div><strong>Startup view</strong><span>Workspace section on launch</span></div><select value={data.settings.defaultView ?? "library"} onChange={(e) => updateSettings({ defaultView: e.target.value as View })}><option value="library">Library</option><option value="dashboard">Overview (Dashboard)</option></select></div>
          <div className="setting-row"><div><strong>Automatic playtime tracking</strong><span>Record active game session duration</span></div><input type="checkbox" checked={data.settings.automaticTracking ?? true} onChange={(e) => updateSettings({ automaticTracking: e.target.checked })} /></div>
          <div className="setting-row"><div><strong>Timer sound</strong><span>Play subtle chime when session timers finish</span></div><input type="checkbox" checked={data.settings.timerSound ?? true} onChange={(e) => updateSettings({ timerSound: e.target.checked })} /></div>
        </section>
        <section className="glass settings-panel">
          <p className="eyebrow">GAME DATABASE</p><h2>IGDB connection</h2>
          <div className="setting-row"><div><strong>Client ID</strong><span>From dev.twitch.tv/console</span></div><input style={{ width: 240 }} value={data.settings.igdbClientId ?? ""} onChange={(e) => updateSettings({ igdbClientId: e.target.value.trim() })} /></div>
          <div className="setting-row"><div><strong>Client Secret</strong><span>Stored locally only</span></div><input style={{ width: 240 }} type="password" value={data.settings.igdbClientSecret ?? ""} onChange={(e) => updateSettings({ igdbClientSecret: e.target.value.trim() })} /></div>
        </section>
        <section className="glass settings-panel">
          <p className="eyebrow">LOCAL SQLITE STORAGE</p><h2>Your data stays yours</h2>
          <p className="muted">SQLite database: <strong>lost-in-sync.sqlite</strong></p><p className="muted">All your games, preferences, and profile settings are stored locally in the native SQLite backend.</p>
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
