import type { Game } from "./game";

export type Rarity = "common" | "uncommon" | "rare" | "legendary" | "mythic" | "lostinsync";
export const RARITY_RANK: Record<Rarity, number> = { common: 0, uncommon: 1, rare: 2, legendary: 3, mythic: 4, lostinsync: 5 };
export const RARITY_LABEL: Record<Rarity, string> = { common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary", mythic: "Mythic", lostinsync: "lostinsync__" };

/** Your files are numbered with the header row counted as row 1 (e.g. 5.6 One-Man Army). Images are matched by NAME first, then by number using this offset. */
export const ROW_OFFSET = 1;

/** Fill with exact IGDB titles of your "Developer's Favorites". */
export const DEV_FAVORITES: string[] = [
  "The King of Fighters '98",
  "The King of Fighters 2002: Unlimited Match",
  "Garou: Mark of the Wolves",
  "3D Pinball: Space Cadet",
  "Snake",
  "Space Impact",
  "Prince of Persia: The Sands of Time",
  "Quantum Break",
  "Call of Duty: Modern Warfare II",
  "Call of Duty: Modern Warfare",
  "Red Dead Redemption 2",
  "Watch Dogs",
  "Sifu",
  "Hollow Knight",
  "The House of the Dead 2",
  "The Evil Within",
  "The Last of Us Part I",
  "Diamond Rush",
  "Rally 3D",
  "Sekiro: Shadows Die Twice",
  "Lies of P",
  "Ghost of Tsushima: Director's Cut",
  "Red Dead Redemption",
  "Blasphemous",
  "Detroit: Become Human",
  "Alan Wake Remastered",
  "Elden Ring",
  "Uncharted: Legacy of Thieves Collection",
  "A Way Out",
  "Little Nightmares II",
  "Little Nightmares",
  "Far Cry 3",
  "Battlefield 1",
  "Battlefield V",
  "Mafia II",
  "Mafia: Definitive Edition",
  "Contra",
  "Control",
  "Bounce Classic",
  "Life Is Strange 2",
  "Life is Strange: Before the Storm",
  "Life Is Strange",
  "Brothers: A Tale of Two Sons",
  "Pokémon Black Version 2",
  "Assassin's Creed Unity",
  "Assassin's Creed IV Black Flag",
  "Assassin's Creed Revelations",
  "Assassin's Creed Brotherhood",
  "Assassin's Creed II",
  "Call of Duty: Black Ops Cold War",
  "Call of Duty: WWII",
  "Call of Duty: Black Ops II",
  "Call of Duty: Black Ops",
  "Call of Duty: Modern Warfare 3",
  "Call of Duty: Modern Warfare 2",
  "Call of Duty 4: Modern Warfare",
  "Call of Duty 2",
  "Resident Evil Village",
  "Resident Evil 4",
  "Resident Evil 2",
  "Resident Evil",
  "Prince of Persia: Warrior Within",
  "Need for Speed: Carbon",
  "Need for Speed: Most Wanted",
  "Need for Speed: Underground",
  "Hitman World of Assassination",
  "Hitman: Absolution",
  "Grand Theft Auto V",
  "Grand Theft Auto: Vice City",
  "Grand Theft Auto: San Andreas",
  "Commandos: Behind Enemy Lines",
  "Devil May Cry 5",
  "Devil May Cry 3: Dante's Awakening",
  "Max Payne 2: The Fall of Max Payne",
  "Max Payne",
  "FIFA 14",
  "2002 FIFA World Cup",
  "FIFA Soccer 97",
  "Mortal Kombat 4",
  "DX-Ball 2",
  "Disney's Hercules Action Game",
  "Virtua Cop 2",
  "Road Rash",
  "The King of Fighters XI",
  "The King of Fighters 2002",
  "The King of Fighters '97",
  "Cadillacs and Dinosaurs"
];

export const GOTY = [
  "Clair Obscur: Expedition 33", "Astro Bot", "Baldur's Gate 3", "Elden Ring", "It Takes Two",
  "The Last of Us Part II", "Sekiro: Shadows Die Twice", "God of War", "The Legend of Zelda: Breath of the Wild",
  "Overwatch", "The Witcher 3: Wild Hunt", "Dragon Age: Inquisition",
];

export type Tier = { id: string; num: string; name: string; desc: string; rarity: Rarity; at: number; val?: (c: Ctx) => number }; export type Ctx = { all: Game[]; done: Game[] };
export type Trophy = { id: string; title: string; evo: boolean; bottom?: boolean; tiers: Tier[]; value: (c: Ctx) => number };
export type TierState = Tier & { unlocked: boolean };
export type TrophyState = { trophy: Trophy; value: number; tiers: TierState[]; top?: TierState };
export type Override = Record<string, boolean>;

const DAY = 86_400_000, YEAR = 365.25 * DAY;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const ts = (d?: string) => { const n = Date.parse(d ?? ""); return Number.isNaN(n) ? undefined : n; };
const yr = (g: Game) => Number((g.releaseDate ?? "").slice(0, 4)) || undefined;
const T = (sec: number, row: number, name: string, rarity: Rarity, at: number, desc: string): Tier =>
  ({ id: `${sec}.${row}`, num: `${sec}.${row + ROW_OFFSET}`, name, rarity, at, desc });

const annualBest = (c: Ctx) => {
  const m: Record<string, number> = {};
  c.done.forEach((g) => { const y = g.finishedAt?.slice(0, 4); if (y) m[y] = (m[y] ?? 0) + 1; });
  return Math.max(0, ...Object.values(m));
};
const era = (lo: number, hi: number) => (c: Ctx) => c.done.filter((g) => { const y = yr(g); return y !== undefined && y >= lo && y <= hi; }).length;
const genresOf = (g: Game) => (g.genres?.length ? g.genres : (g.genre ?? "").split(","));
const gap = (g: Game) => { const r = ts(g.releaseDate), f = ts(g.finishedAt); return r !== undefined && f !== undefined ? f - r : undefined; };
const favSet = () => new Set(DEV_FAVORITES.map(norm));
const fran = (sec: number, row: number, name: string, at: number, label: string, test: (g: Game) => boolean): Trophy => ({
  id: `${sec}.${row}`, title: name, evo: false,
  value: (c) => c.done.filter(test).length,
  tiers: [T(sec, row, name, "mythic", at, `Complete ${at} games from ${label}`)],
});
const byTitle = (re: RegExp) => (g: Game) => re.test(g.title) || (g.franchises ?? []).some((f) => re.test(f));
const genre = (row: number, name: string, label: string, re: RegExp): Trophy => ({
  id: `5.${row}`, title: name, evo: false,
  value: (c) => c.done.filter((g) => genresOf(g).some((x) => re.test(x))).length,
  tiers: [T(5, row, name, "rare", 100, `Complete 100 ${label} games`)],
});
const solo = (sec: number, row: number, name: string, rarity: Rarity, at: number, desc: string, value: (c: Ctx) => number, bottom = false): Trophy =>
  ({ id: `${sec}.${row}`, title: name, evo: false, bottom, value, tiers: [T(sec, row, name, rarity, at, desc)] });

export const TROPHIES: Trophy[] = [
  {
    id: "annual", title: "Annual Legends", evo: true, value: annualBest, tiers: [
      T(1, 1, "Annual Rookie", "common", 10, "Complete 10 games in one year"),
      T(1, 2, "Yearly Veteran", "uncommon", 25, "Complete 25 games in one year"),
      T(1, 3, "Completion Machine", "rare", 50, "Complete 50 games in one year"),
      T(1, 4, "The 100 Club", "legendary", 100, "Complete 100 games in one year"),
      T(1, 5, "Gaming Phenomenon", "mythic", 150, "Complete 150 games in one year")]
  },
  {
    id: "retro", title: "Time Traveler", evo: true, value: (c) => c.done.filter((g) => (yr(g) ?? 9999) < 2000).length, tiers: [
      T(2, 1, "Retro Initiate", "common", 10, "Complete 10 games released before 2000"),
      T(2, 2, "Retro Enthusiast", "uncommon", 25, "Complete 25 games released before 2000"),
      T(2, 3, "Millennium Veteran", "rare", 50, "Complete 50 games released before 2000"),
      T(2, 4, "Ancient Gamer", "legendary", 100, "Complete 100 games released before 2000"),
      T(2, 5, "Keeper of History", "mythic", 200, "Complete 200 games released before 2000")]
  },
  {
    id: "devfav", title: "Developer's Choice", evo: true, bottom: true,
    value: (c) => { const s = favSet(); return c.done.filter((g) => s.has(norm(g.title))).length; }, tiers: [
      T(3, 1, "Curious Player", "common", 2, "Complete 2 developer favorites"),
      T(3, 2, "Appreciator", "uncommon", 5, "Complete 5 developer favorites"),
      T(3, 3, "Connoisseur", "rare", 10, "Complete 10 developer favorites"),
      T(3, 4, "True Admirer", "legendary", 20, "Complete 20 developer favorites"),
      T(3, 5, "Arceus 7x7", "mythic", 50, "Complete 50 developer favorites"),
      T(3, 6, "Synced X", "lostinsync", Math.max(1, DEV_FAVORITES.length), "Complete all developer favorites")]
  },
  fran(4, 1, "Requiescat in Pace", 12, "Assassin's Creed", byTitle(/assassin'?s creed/i)),
  fran(4, 2, "Leave me alone", 6, "GTA", byTitle(/grand theft auto|\bgta\b/i)),
  fran(4, 3, "Biohazard", 9, "Resident Evil", byTitle(/resident evil|biohazard/i)),
  fran(4, 4, "Symphony of the Night", 15, "Castlevania", byTitle(/castlevania/i)),
  fran(4, 5, "Blacklist #1", 7, "NFS", byTitle(/need for speed/i)),
  fran(4, 6, "The fallen leaves tell a story", 6, "FromSoftware", (g) => /from ?software/i.test(g.developer ?? "")),
  fran(4, 7, "Consider it done", 5, "Commandos", byTitle(/commandos/i)),
  solo(4, 8, "Pantheon of Worlds", "lostinsync", 100, "Complete 100 different franchises",
    (c) => new Set(c.done.flatMap((g) => g.franchises ?? []).map(norm)).size, true),

  genre(1, "Action Specialist", "Action", /action/i),
  genre(2, "RPG Veteran", "RPG", /role|rpg/i),
  genre(3, "Adventure Seeker", "Adventure", /adventure/i),
  genre(4, "Strategy Master", "Strategy", /strategy/i),
  genre(5, "One-Man Army", "Shooter", /shooter/i),
  {
    id: "hours", title: "One Game, One Obsession", evo: true, value: (c) => Math.max(0, ...c.all.map((g) => g.totalSeconds / 3600)), tiers: [
      T(6, 1, "One Game, One Obsession", "rare", 100, "Accumulate 100 hours in one game"),
      T(6, 2, "Dedicated Soul", "legendary", 250, "Accumulate 250 hours in one game")]
  },
  {
    id: "span", title: "Wandering Nomad", evo: true, tiers: [
      T(6, 3, "Wandering Nomad", "rare", 365, "Play the same game across a period of 365 days or more"),
      T(6, 4, "Devoted Pilgrim", "legendary", 730, "Play the same game across a period of 2 years"),
      T(6, 5, "Eternal Bound", "mythic", 1095, "Play the same game across a period of 3 years")],
    value: (c) => Math.max(0, ...c.all.map((g) => {
      const s = ts(g.startedAt), e = ts(g.finishedAt) ?? (g.status === "Playing" ? Date.now() : undefined);
      return s !== undefined && e !== undefined ? Math.floor((e - s) / DAY) : 0;
    }))
  },
  {
    id: "career", title: "Gaming Career", evo: true, bottom: true, tiers: [
      T(6, 6, "Start of a legacy", "uncommon", 10, "Play for a total time period of 10 years or more"),
      T(6, 7, "Generation Gamer", "rare", 20, "Play for a total time period of 20 years or more"),
      T(6, 8, "Time Traveler", "legendary", 30, "Play for a total time period of 30 years or more"),
      T(6, 9, "Father of the Odyssey", "mythic", 40, "Play for a total time period of 40 years or more"),
      T(6, 10, "Immortal", "lostinsync", 50, "Play for a total time period of 50 years or more")],
    value: (c) => {
      const d = c.all.flatMap((g) => [ts(g.startedAt), ts(g.finishedAt)]).filter((x): x is number => x !== undefined);
      return d.length ? (Math.max(...d) - Math.min(...d)) / YEAR : 0;
    }
  },
  {
    id: "complete", title: "Completionist", evo: true, value: (c) => c.done.length, tiers: [
      T(7, 1, "Century Mark", "common", 100, "Complete 100 games"),
      T(7, 2, "Library Architect", "uncommon", 500, "Complete 500 games"),
      T(7, 3, "Grand Completionist", "rare", 1000, "Complete 1000 games"),
      T(7, 4, "Backlog Slayer", "legendary", 2000, "Complete 2000 games"),
      T(7, 5, "Living Archive", "mythic", 3000, "Complete 3000 games")]
  },
  solo(8, 1, "Arcade Roots", "legendary", 15, "Complete 15 games released before 1990", era(0, 1989)),
  solo(8, 2, "Classic Era", "rare", 20, "Complete 20 games released between 1990–1999", era(1990, 1999)),
  solo(8, 3, "2000s Veteran", "uncommon", 20, "Complete 20 games released between 2000–2009", era(2000, 2009)),
  solo(8, 4, "HD Generation", "common", 20, "Complete 20 games released between 2010–2019", era(2010, 2019)),
  solo(8, 5, "Modern Era", "common", 20, "Complete 20 games released between 2020–2029", era(2020, 2029)),
  solo(9, 1, "Relic of the Ancients", "mythic", 1, "Complete a game released at least 45 years before the completion date",
    (c) => c.done.filter((g) => { const r = ts(g.releaseDate), f = ts(g.finishedAt); return r !== undefined && f !== undefined && f - r >= 45 * YEAR; }).length),
  solo(9, 2, "Vanguard Rusher", "rare", 1, "Complete a game within 7 days of its release",
    (c) => c.done.filter((g) => { const d = gap(g); return d !== undefined && d >= 0 && d <= 7 * DAY; }).length),
  solo(9, 3, "Bleeding Edge", "mythic", 1, "Complete a game within a day of its release",
    (c) => c.done.filter((g) => { const d = gap(g); return d !== undefined && d >= 0 && d <= DAY; }).length),
  solo(9, 4, "GOTY Slayer", "lostinsync", GOTY.length, "Play all GOTY games",
    (c) => { const s = new Set(c.all.filter((g) => !["Backlog", "Wishlist"].includes(g.status)).map((g) => norm(g.title))); return GOTY.filter((n) => s.has(norm(n))).length; }, true),
  {
    id: "final", title: "Achievement Hunter", evo: true, bottom: true, value: () => 0, tiers: [
      T(9, 5, "Initiate of Light", "common", 10, "Complete 10% of all achievements"),
      T(9, 6, "Keeper of Seals", "uncommon", 25, "Complete 25% of all achievements"),
      T(9, 7, "Equinox Sovereign", "rare", 50, "Complete 50% of all achievements"),
      T(9, 8, "Crown of Dominion", "legendary", 75, "Complete 75% of all achievements"),
      T(9, 9, "Threshold of the Gods", "mythic", 90, "Complete 90% of all achievements"),
      T(9, 10, "lostinsync__", "lostinsync", 100, "Complete all achievements")]
  },
];

export function evaluate(games: Game[], cheat: Override): TrophyState[] {
  const c: Ctx = { all: games, done: games.filter((g) => ["Completed", "Retired"].includes(g.status)) };
  const calc = (t: Trophy, value: number, tiers = t.tiers): TrophyState => {
    const list = tiers.map((x) => ({ ...x, unlocked: cheat[x.id] ?? (x.val ? x.val(c) : value) >= x.at })); return { trophy: t, value, tiers: list, top: [...list].reverse().find((x) => x.unlocked) };
  };
  const base = TROPHIES.filter((t) => t.id !== "final").map((t) => calc(t, t.value(c)));
  const tiers = base.flatMap((s) => s.tiers);
  const fin = TROPHIES.find((t) => t.id === "final")!;
  const finalState = calc(fin, (tiers.filter((t) => t.unlocked).length / tiers.length) * 100);
  return TROPHIES.map((t) => (t.id === "final" ? finalState : base.find((s) => s.trophy === t)!));
}


