import type { Game } from "./game";

const HOUR = 3600;

/** Recorded playtime in hours. Missing, invalid, zero and negative values mean "not tracked". */
export function playtimeHours(seconds?: number): number {
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds / HOUR : 0;
}

export type PlaytimeSummary = {
  total: number;
  tracked: number;
  untracked: number;
  average: number;
  median: number;
  longest: number;
  shortest: number;
  completedTotal: number;
};

const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
const median = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Aggregate a set of games by the playtime the user actually logged (not IGDB estimates). */
export function summarizePlaytime(games: readonly Game[]): PlaytimeSummary {
  const hours = games.map((g) => playtimeHours(g.totalSeconds)).filter((h) => h > 0);
  let longest = 0, shortest = Infinity;
  hours.forEach((h) => {
    if (h > longest) longest = h;
    if (h < shortest) shortest = h;
  });
  return {
    total: sum(hours),
    tracked: hours.length,
    untracked: games.length - hours.length,
    average: hours.length ? sum(hours) / hours.length : 0,
    median: median(hours),
    longest: hours.length ? longest : 0,
    shortest: hours.length ? shortest : 0,
    completedTotal: sum(games.filter((g) => g.status === "Completed").map((g) => playtimeHours(g.totalSeconds))),
  };
}

export const PLAYTIME_BUCKETS: readonly (readonly [string, number, number])[] = [
  ["< 5h", 0, 5],
  ["5–10h", 5, 10],
  ["10–20h", 10, 20],
  ["20–40h", 20, 40],
  ["40–80h", 40, 80],
  ["80h+", 80, Infinity],
];

export type PlaytimeBucket = { label: string; min: number; max: number; games: number; hours: number };

/** Count games and sum hours in each playtime band; boundaries belong to the higher band. */
export function playtimeBuckets(hours: readonly number[]): PlaytimeBucket[] {
  return PLAYTIME_BUCKETS.map(([label, min, max]) => {
    const inside = hours.filter((h) => h >= min && h < max);
    return { label, min, max, games: inside.length, hours: sum(inside) };
  });
}
