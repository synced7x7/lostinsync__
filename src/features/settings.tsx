import { Sparkles } from "lucide-react";
import type { AppData } from "../domain/game";
import { Header } from "../components/shared";
import { DataSection } from "./settings-data";
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
          <p className="eyebrow">IGDB CONNECTION</p><h2>API credentials</h2>
          <p className="muted">Used for Discover, game details, and Backloggd imports.</p>
          <div className="settings-credentials">
            <label>Client ID<input value={data.settings.igdbClientId ?? ""} onChange={(event) => updateSettings({ igdbClientId: event.target.value })} placeholder="Twitch Client ID" /></label>
            <label>Client Secret<input type="password" value={data.settings.igdbClientSecret ?? ""} onChange={(event) => updateSettings({ igdbClientSecret: event.target.value })} placeholder="Twitch Client Secret" /></label>
          </div>
        </section>
        <DataSection data={data} update={update} />
      </div>
    </>
  );
}
