import type { StoreRecord } from "./types";

/** Rows come from a best-effort read of the local Battle.net Agent `product.db`. */
export type BattleNetRow = { code: string; name: string };

const IGNORE = new Set(["agent", "bna"]);
const KNOWN: Record<string, string> = {
  wow: "World of Warcraft", wow_classic: "World of Warcraft Classic", d3: "Diablo III",
  s2: "StarCraft II", sc1: "StarCraft", hs: "Hearthstone", hero: "Heroes of the Storm",
  ow: "Overwatch", pro: "Overwatch 2", wl3: "Warcraft III: Reforged",
};

const humanize = (code: string) =>
  code.replace(/[_-]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim() || code;

export function mapBattleNetRows(rows: BattleNetRow[]): StoreRecord[] {
  const seen = new Set<string>();
  const out: StoreRecord[] = [];
  for (const row of rows) {
    const code = String(row.code ?? "").trim();
    if (!code || IGNORE.has(code.toLowerCase())) continue;
    const raw = String(row.name ?? "").trim();
    // SQLite column names sometimes leak into a generic scan; treat those as missing titles.
    const name = /^[a-z][a-z0-9_]*$/i.test(raw) && raw.length < 32 ? "" : raw;
    const title = name || KNOWN[code.toLowerCase()] || humanize(code);
    const key = code.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ store: "battlenet", storeId: code, title, installed: true });
  }
  return out;
}
