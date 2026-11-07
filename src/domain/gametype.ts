const key = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// value = your enum name, id = IGDB enum value, match = how IGDB's stored gameType text is recognised
export const GAME_TYPES: { value: string; id: number; label: string; match: string[] }[] = [
  { value: "main_game", id: 0, label: "Main game", match: ["maingame"] },
  { value: "dlc_addon", id: 1, label: "DLC / Add-on", match: ["dlc", "dlcaddon", "addon"] },
  { value: "expansion", id: 2, label: "Expansion", match: ["expansion"] },
  { value: "bundle", id: 3, label: "Bundle", match: ["bundle"] },
  { value: "standalone_expansion", id: 4, label: "Standalone expansion", match: ["standaloneexpansion"] },
  { value: "mod", id: 5, label: "Mod", match: ["mod"] },
  { value: "episode", id: 6, label: "Episode", match: ["episode"] },
  { value: "season", id: 7, label: "Season", match: ["season"] },
  { value: "remake", id: 8, label: "Remake", match: ["remake"] },
  { value: "remaster", id: 9, label: "Remaster", match: ["remaster"] },
  { value: "expanded_game", id: 10, label: "Expanded game", match: ["expandedgame"] },
  { value: "port", id: 11, label: "Port", match: ["port"] },
  { value: "fork", id: 12, label: "Fork", match: ["fork"] },
  { value: "pack", id: 13, label: "Pack", match: ["pack"] },
  { value: "update", id: 14, label: "Update", match: ["update"] },
];
export const UNSET_TYPE = "unset";

export function matchesGameType(gameType: string | undefined, filter: string) {
  if (!filter || filter === "All") return true;
  if (filter === UNSET_TYPE) return !gameType;
  const t = GAME_TYPES.find((x) => x.value === filter);
  return !!t && !!gameType && t.match.includes(key(gameType));
}