/** IGDB external_games category/source IDs, most useful storefronts first. */
const ORDER = [1, 26, 36, 31, 5, 11, 13, 15, 30, 14, 10, 22, 23, 20, 28, 29, 32, 37, 54, 55];
const rank = (source: number) => {
  const i = ORDER.indexOf(source);
  return i < 0 ? ORDER.length : i;
};

const NAMES: Record<number, string> = {
  1: "Steam", 5: "GOG", 10: "YouTube", 11: "Microsoft", 13: "Apple", 14: "Twitch",
  15: "Google Play", 20: "Amazon", 22: "Amazon Luna", 23: "Amazon", 26: "Epic Games",
  28: "Meta", 29: "Utomik", 30: "itch.io", 31: "Xbox", 32: "Kartridge",
  36: "PlayStation", 37: "Focus", 54: "Xbox Cloud", 55: "GameJolt",
};
export const storeLabel = (source: number) => NAMES[source] ?? "GiantBomb";

export type StoreLinkRef = { source: number; url: string };

/** De-duplicate exact IGDB store entries by source and drop rows without a usable URL. */
export function storeLinksFromExternal(games: { source: number; url?: string | null }[]): StoreLinkRef[] {
  const out: StoreLinkRef[] = [];
  for (const g of games) {
    if (typeof g.url !== "string" || !/^https?:\/\//.test(g.url)) continue;
    if (!out.some((s) => s.source === g.source)) out.push({ source: g.source, url: g.url });
  }
  return out.sort((a, b) => rank(a.source) - rank(b.source));
}
