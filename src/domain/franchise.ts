import type { Game } from "./game";
import type { SeriesData } from "../data/igdb";
import { matchesGameType } from "./gametype";

export type SeriesGame = SeriesData["games"][number];

/** true = count every game type (no filtering). Set back to false to count only main/standalone/remake/remaster. */
export const ALL_TYPES = true;
/** IGDB game_type ids we count: 0 main_game, 4 standalone_expansion, 8 remake, 9 remaster. Everything else is ignored. */
export const WANTED_TYPES = [0, 4, 8, 9];
export const wantedType = (t?: number | null) => ALL_TYPES || t == null || WANTED_TYPES.includes(t);
const WANTED_NAMES = ["main_game", "standalone_expansion", "remake", "remaster"];
export const libWanted = (t?: string) => ALL_TYPES || !t || WANTED_NAMES.some((n) => matchesGameType(t, n));

export type FranchiseGroup = { key: string; name: string; games: Game[] };
export type FranchiseSlot = {
  key: string; title: string; releaseTs?: number; cover?: string; game?: Game; done: boolean;
};
export type FranchiseRow = {
  key: string; name: string; slots: FranchiseSlot[]; done: number; total: number; pct: number;
  seconds: number; fromSeries: boolean; sig: string;
};

export const norm = (s?: string) =>
  (s ?? "").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();

const EDITION = /\b(remake|remastered|remaster|hd|definitive edition|complete edition|game of the year edition|goty edition|anniversary edition|deluxe edition|enhanced edition|special edition|directors cut|collection)\b/g;
/** Same game, different release (remake / remaster / edition) -> same slot. */
export const baseTitle = (s?: string) => norm((s ?? "").replace(/\([^)]*\)|\[[^\]]*\]/g, " ")).replace(EDITION, " ").replace(/\s+/g, " ").trim();

const ts = (s?: string) => { const t = Date.parse(s ?? ""); return Number.isNaN(t) ? undefined : Math.floor(t / 1000); };

/** List each game under every franchise it belongs to, keeping only franchises with a completed game. */
export function groupByFranchise(games: Game[]): FranchiseGroup[] {
  const groups = new Map<string, FranchiseGroup>();
  for (const g of games) {
    const seen = new Set<string>();
    for (const n of g.franchises ?? []) {
      const k = norm(n);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const grp = groups.get(k) ?? { key: k, name: n, games: [] };
      grp.games.push(g);
      groups.set(k, grp);
    }
  }
  return [...groups.values()].filter((grp) => grp.games.some((g) => g.status === "Completed"));
}

export function buildFranchise(group: FranchiseGroup, series: SeriesGame[] = []): FranchiseRow {
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

  const byName = new Map<string, string>();
  for (const g of series) {
    if (!wantedType(g.gameType)) continue;
    touch(`g${g.id}`, g.name, g.releaseTs, g.cover, g.id); // one slot per IGDB game id - nothing is merged or hidden
    if (!byName.has(norm(g.name))) byName.set(norm(g.name), `g${g.id}`);
  }

  for (const g of group.games) {
    if (!libWanted(g.gameType)) continue;
    const key = (g.igdbId && byId.get(g.igdbId)) || byName.get(norm(g.title)) || `l${g.id}`;
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
    fromSeries: series.some((g) => wantedType(g.gameType)),
    sig: `${group.name}|${list.map((s) => `${s.key}:${s.done ? 1 : 0}:${s.game?.id ?? ""}:${s.cover ?? ""}`).join(",")}`,
  };
}