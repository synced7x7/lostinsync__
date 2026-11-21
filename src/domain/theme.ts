export const THEME_IDS = ["aurora", "moonlight", "rose", "solarized", "graphite", "merlot"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export type ThemeMeta = {
  id: ThemeId;
  label: string;
  description: string;
  color: string;
};

export const THEMES: ThemeMeta[] = [
  { id: "aurora", label: "Aurora", description: "Purple glass with cyan accents", color: "#a495ff" },
  { id: "moonlight", label: "Moonlight", description: "Cool midnight with silver blue", color: "#8ec5ff" },
  { id: "rose", label: "Rose", description: "Pinkish dark with magenta glow", color: "#ff7eb8" },
  { id: "solarized", label: "Solarized", description: "Solarized dark with teal accents", color: "#2aa198" },
  { id: "graphite", label: "Graphite", description: "Charcoal with silver accents", color: "#c0cad4" },
  { id: "merlot", label: "Merlot", description: "Dark burgundy with muted pink", color: "#D97791" },
];

export const DEFAULT_THEME: ThemeId = "aurora";

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && (THEME_IDS as readonly string[]).includes(value);
}

export function normalizeTheme(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME;
}

export function applyTheme(theme: unknown) {
  document.documentElement.dataset.theme = normalizeTheme(theme);
}
