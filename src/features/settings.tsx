import type { AppData } from "../domain/game";
import { THEMES, normalizeTheme, type ThemeId } from "../domain/theme";
import { Header } from "../components/shared";
import { DataSection } from "./settings-data";
import "./settings.css";

export function SettingsView({ data, update }: { data: AppData; update: (data: AppData) => void }) {
  const updateSettings = (partial: Partial<AppData["settings"]>) => {
    update({ ...data, settings: { ...data.settings, ...partial } });
  };
  const activeTheme = normalizeTheme(data.settings.theme);
  const activeMeta = THEMES.find((t) => t.id === activeTheme) ?? THEMES[0];

  return (
    <>
      <Header eyebrow="WORKSPACE CONTROL" title="Settings" />
      <div className="settings-grid">
        <section className="glass settings-panel">
          <p className="eyebrow">PREFERENCES & APPEARANCE</p><h2>Preferences</h2>
          <div className="setting-row">
            <div><strong>Theme</strong><span>{activeMeta.description}</span></div>
            <div className="theme-select-wrap">
              <span className="theme-swatch" style={{ "--swatch": activeMeta.color } as Record<string, string>} aria-hidden="true" />
              <select
                aria-label="Theme"
                value={activeTheme}
                onChange={(e) => updateSettings({ theme: e.target.value as ThemeId })}
              >
                {THEMES.map((theme) => (
                  <option key={theme.id} value={theme.id}>{theme.label}</option>
                ))}
              </select>
            </div>
          </div>
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
