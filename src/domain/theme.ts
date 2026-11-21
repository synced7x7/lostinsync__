export const THEME_IDS = ["aurora", "ember", "moonlight"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export type ThemeMeta = {
  id: ThemeId;
  label: string;
  description: string;
  color: string;
};

export const THEMES: ThemeMeta[] = [
  { id: "aurora", label: "Aurora", description: "Purple glass with cyan accents", color: "#a495ff" },
  { id: "ember", label: "Ember", description: "Warm charcoal with amber glow", color: "#ffb067" },
  { id: "moonlight", label: "Moonlight", description: "Cool midnight with silver blue", color: "#8ec5ff" },
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
