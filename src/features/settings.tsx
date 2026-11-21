import { Check, Sparkles } from "lucide-react";
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

  return (
    <>
      <Header eyebrow="WORKSPACE CONTROL" title="Settings" />
      <div className="settings-grid">
        <section className="glass settings-panel">
          <p className="eyebrow">PREFERENCES & APPEARANCE</p><h2>Preferences</h2>
          <div className="setting-row theme-setting-row">
            <div><strong>Theme</strong><span>Choose the app's visual atmosphere.</span></div>
          </div>
          <div className="theme-picker" role="radiogroup" aria-label="Theme">
            {THEMES.map((theme) => {
              const active = theme.id === activeTheme;
              return (
                <button
                  key={theme.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`theme-option ${active ? "active" : ""}`}
                  data-theme-preview={theme.id}
                  onClick={() => updateSettings({ theme: theme.id as ThemeId })}
                >
                  <span className="theme-swatch" style={{ "--swatch": theme.color } as Record<string, string>} />
                  <span className="theme-copy">
                    <strong>{theme.label}</strong>
                    <span>{theme.description}</span>
                  </span>
                  <span className="theme-state">{active ? <Check size={14} /> : <Sparkles size={14} />}</span>
                </button>
              );
            })}
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
