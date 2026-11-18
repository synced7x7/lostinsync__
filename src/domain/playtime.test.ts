import { describe, expect, it } from "vitest";
import type { Game } from "./game";
import { playtimeBuckets, playtimeHours, summarizePlaytime } from "./playtime";

const game = (patch: Partial<Game> = {}): Game => ({
  id: "g",
  title: "Game",
  platform: "PC",
  genre: "Action",
  tags: [],
  status: "Backlog",
  notes: "",
  favorite: false,
  totalSeconds: 0,
  createdAt: "2025-01-01T00:00:00.000Z",
  ...patch,
});

describe("playtimeHours", () => {
  it("converts seconds to hours", () => {
    expect(playtimeHours(3600)).toBe(1);
    expect(playtimeHours(5400)).toBe(1.5);
  });

  it("treats missing, invalid, zero and negative values as untracked", () => {
    expect(playtimeHours(undefined)).toBe(0);
    expect(playtimeHours(0)).toBe(0);
    expect(playtimeHours(-3600)).toBe(0);
    expect(playtimeHours(Number.NaN)).toBe(0);
    expect(playtimeHours(Infinity)).toBe(0);
  });
});

describe("summarizePlaytime", () => {
  it("returns zeroes for an empty library", () => {
    expect(summarizePlaytime([])).toEqual({
      total: 0, tracked: 0, untracked: 0, average: 0, median: 0, longest: 0, shortest: 0, completedTotal: 0,
    });
  });

  it("summarizes a single tracked game", () => {
    const s = summarizePlaytime([game({ totalSeconds: 7200 })]);
    expect(s).toMatchObject({ total: 2, tracked: 1, untracked: 0, average: 2, median: 2, longest: 2, shortest: 2 });
  });

  it("computes median separately from the mean", () => {
    const s = summarizePlaytime([game({ id: "a", totalSeconds: 3600 }), game({ id: "b", totalSeconds: 7200 }), game({ id: "c", totalSeconds: 36000 })]);
    expect(s.total).toBe(13);
    expect(s.average).toBeCloseTo(13 / 3);
    expect(s.median).toBe(2);
    expect(s.longest).toBe(10);
    expect(s.shortest).toBe(1);
  });

  it("ignores invalid time and only counts completed games for completedTotal", () => {
    const games = [
      game({ id: "a", status: "Completed", totalSeconds: 10800 }),
      game({ id: "b", status: "Playing", totalSeconds: 3600 }),
      game({ id: "c", status: "Completed", totalSeconds: 0 }),
      game({ id: "d", status: "Completed", totalSeconds: Number.NaN }),
      game({ id: "e", status: "Backlog", totalSeconds: -3600 }),
    ];
    const s = summarizePlaytime(games);
    expect(s.tracked).toBe(2);
    expect(s.untracked).toBe(3);
    expect(s.total).toBe(4);
    expect(s.completedTotal).toBe(3);
  });
});

describe("playtimeBuckets", () => {
  it("places boundary values in the higher band and sums hours", () => {
    const buckets = playtimeBuckets([1, 5, 5, 20, 80, 100]);
    expect(buckets.map((b) => b.games)).toEqual([1, 2, 0, 1, 0, 2]);
    expect(buckets.find((b) => b.label === "5–10h")).toMatchObject({ games: 2, hours: 10 });
    expect(buckets.find((b) => b.label === "80h+")?.hours).toBe(180);
  });

  it("handles an empty set", () => {
    expect(playtimeBuckets([]).every((b) => b.games === 0 && b.hours === 0)).toBe(true);
  });
});
