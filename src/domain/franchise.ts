import type { Game } from "./game";
import type { SeriesData } from "../data/igdb";
import { matchesGameType } from "./gametype";

type SeriesGame = SeriesData["games"][number];

export type FranchiseGroup = { key: string; name: string; games: Game[] };
export type FranchiseSlot = {
  key: string; title: string; releaseTs?: number; cover?: string; game?: Game; done: boolean;
};
export type FranchiseRow = {
  key: string; name: string; slots: FranchiseSlot[]; done: number; total: number; pct: number;
  seconds: number; fromSeries: boolean; sig: string;
};

export const FRANCHISE_MIN_SLOTS = 2;

/** Types that count as a mainline entry. Unknown type counts (older saves have none). */
const COUNTED = ["main_game", "standalone_expansion", "expanded_game", "remake", "remaster"];
export const countsAsEntry = (gameType?: string) => !gameType || COUNTED.some((t) => matchesGameType(gameType, t));

export const norm = (s?: string) =>
  (s ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

const EDITION = /\b(remake|remastered|remaster|hd|definitive edition|complete edition|game of the year edition|goty edition|anniversary edition|deluxe edition|enhanced edition|special edition|directors cut|collection)\b/g;
/** Same game, different release (remake / remaster / edition) -> same slot. */
export const baseTitle = (s?: string) => norm((s ?? "").replace(/\([^)]*\)|\[[^\]]*\]/g, " ")).replace(EDITION, " ").replace(/\s+/g, " ").trim();

const ts = (s?: string) => { const t = Date.parse(s ?? ""); return Number.isNaN(t) ? undefined : Math.floor(t / 1000); };

/** Each game goes to exactly one franchise: its most common franchise name in the library. */
export function groupByFranchise(games: Game[]): FranchiseGroup[] {
  const count = new Map<string, number>();
  const label = new Map<string, string>();
  for (const g of games) for (const n of g.franchises ?? []) {
    const k = norm(n);
    if (!k) continue;
    count.set(k, (count.get(k) ?? 0) + 1);
    if (!label.has(k)) label.set(k, n);
  }
  const groups = new Map<string, FranchiseGroup>();
  for (const g of games) {
    const names = (g.franchises ?? []).map(norm).filter(Boolean);
    if (!names.length) continue;
    const best = names.reduce((a, b) => ((count.get(b) ?? 0) > (count.get(a) ?? 0) || ((count.get(b) ?? 0) === (count.get(a) ?? 0) && b < a) ? b : a));
    const grp = groups.get(best) ?? { key: best, name: label.get(best) ?? best, games: [] };
    grp.games.push(g);
    groups.set(best, grp);
  }
  return [...groups.values()];
}

/** Direct games of the series collection matching this franchise (spin-off sub-series are not mixed in). */
export function seriesGamesFor(group: FranchiseGroup, data?: SeriesData): SeriesGame[] {
  if (!data?.collections.length) return [];
  const ids = new Set(group.games.flatMap((g) => (g.igdbId ? [g.igdbId] : [])));
  const named = data.collections.find((c) => norm(c.name) === group.key)
    ?? data.collections.find((c) => norm(c.name).includes(group.key) || group.key.includes(norm(c.name)));
  const col = named ?? [...data.collections].sort(
    (a, b) => (b.games ?? []).filter((x) => ids.has(x)).length - (a.games ?? []).filter((x) => ids.has(x)).length,
  )[0];
  if (!col || (!named && !(col.games ?? []).some((x) => ids.has(x)))) return [];
  const byId = new Map(data.games.map((g) => [g.id, g]));
  return (col.games ?? []).flatMap((id) => { const g = byId.get(id); return g && countsAsEntry(g.gameType) ? [g] : []; });
}

export function buildFranchise(group: FranchiseGroup, data?: SeriesData): FranchiseRow {
  type Acc = FranchiseSlot & { ids: Set<number> };
  const slots = new Map<string, Acc>();
  const byId = new Map<number, string>();
  const touch = (key: string, title: string, t?: number, cover?: string, id?: number) => {
    let s = slots.get(key);
    if (!s) { s = { key, title, releaseTs: t, cover, done: false, ids: new Set() }; slots.set(key, s); }
    else if (t !== undefined && (s.releaseTs === undefined || t < s.releaseTs)) { s.releaseTs = t; s.title = title; }
    if (!s.cover && cover) s.cover = cover;
    if (id) { s.ids.add(id); byId.set(id, key); }
    return s;
  };

  const series = seriesGamesFor(group, data);
  for (const g of series) touch(baseTitle(g.name) || String(g.id), g.name, g.releaseTs, g.cover, g.id);

  for (const g of group.games) {
    if (!countsAsEntry(g.gameType)) continue;
    const key = (g.igdbId && byId.get(g.igdbId)) || baseTitle(g.title);
    const s = touch(key, g.title, ts(g.releaseDate), g.cover, g.igdbId);
    if (!s.game || (g.status === "Completed" && !s.done)) s.game = g;
    if (g.status === "Completed") s.done = true;
  }

  const list = [...slots.values()].sort(
    (a, b) => (a.releaseTs ?? Infinity) - (b.releaseTs ?? Infinity) || a.title.localeCompare(b.title),
  ).map(({ ids: _ids, ...s }) => s);
  const done = list.filter((s) => s.done).length;
  return {
    key: group.key, name: group.name, slots: list, done, total: list.length,
    pct: list.length ? Math.round((done / list.length) * 100) : 0,
    seconds: group.games.reduce((n, g) => n + (g.totalSeconds > 0 ? g.totalSeconds : 0), 0),
    fromSeries: series.length > 0,
    sig: `${group.name}|${list.map((s) => `${s.key}:${s.done ? 1 : 0}:${s.game?.id ?? ""}:${s.cover ?? ""}`).join(",")}`,
  };
}