import { describe, expect, it } from "vitest";
import type { Game } from "./game";
import type { SeriesData } from "../data/igdb";
import { baseTitle, buildFranchise, groupByFranchise, seriesGamesFor } from "./franchise";

const g = (o: Partial<Game> & { id: string; title: string }): Game => ({
  platform: "PC", genre: "", tags: [], status: "Backlog", notes: "", favorite: false, totalSeconds: 0, createdAt: "2020-01-01",
  franchises: ["Resident Evil"], ...o,
});
const series: SeriesData = {
  collections: [{ id: 1, name: "Resident Evil", games: [10, 11, 12, 13, 14] }, { id: 2, name: "Other", games: [99] }],
  relations: [],
  games: [
    { id: 10, name: "Resident Evil", releaseTs: 100, gameType: "Main Game" },
    { id: 11, name: "Resident Evil 2", releaseTs: 200, gameType: "Main Game" },
    { id: 12, name: "Resident Evil 2 (2019)", releaseTs: 900, gameType: "Remake" },
    { id: 13, name: "Resident Evil 2: Extra DLC", releaseTs: 950, gameType: "DLC" },
    { id: 14, name: "Resident Evil 3", releaseTs: 300, gameType: "Main Game" },
  ],
};

describe("franchise completion", () => {
  it("counts every game type", () => {
    const group = { key: "resident evil", name: "Resident Evil", games: [g({ id: "a", title: "Resident Evil 2", igdbId: 11, status: "Completed" })] };
    const row = buildFranchise(group, seriesGamesFor(group, series));
    expect(row.total).toBe(4);
    expect(row.done).toBe(1);
    expect(row.slots.map((s) => s.title)).toEqual(["Resident Evil", "Resident Evil 2", "Resident Evil 3", "Resident Evil 2: Extra DLC"]);
  });
  it("matches by igdbId first and by name second, and a completed copy wins", () => {
    const games = [
      g({ id: "a", title: "RE2 remake copy", igdbId: 12, status: "Backlog" }),
      g({ id: "b", title: "Resident Evil 3", status: "Completed" }),
    ];
    const group = { key: "resident evil", name: "Resident Evil", games };
    const row = buildFranchise(group, seriesGamesFor(group, series));
    expect(row.slots.find((s) => s.key === "resident evil 3")?.done).toBe(true);
    expect(row.slots.find((s) => s.key === "resident evil 2")?.game?.id).toBe("a");
    expect(row.done).toBe(1);
  });
  it("falls back to library-only slots and keeps undated entries last", () => {
    const row = buildFranchise({ key: "resident evil", name: "Resident Evil", games: [g({ id: "x", title: "Zeta" }), g({ id: "y", title: "Alpha", releaseDate: "2001-05-01" })] });
    expect(row.fromSeries).toBe(false);
    expect(row.slots.map((s) => s.title)).toEqual(["Alpha", "Zeta"]);
  });
  it("lists a game under every franchise it belongs to, only for franchises with a completed game", () => {
    const groups = groupByFranchise([
      g({ id: "1", title: "A", franchises: ["Zelda", "Hyrule"], status: "Completed" }),
      g({ id: "2", title: "B", franchises: ["Zelda"] }),
      g({ id: "3", title: "C", franchises: ["Mario"] }),
    ]);
    expect(groups.map((x) => x.key).sort()).toEqual(["hyrule", "zelda"]);
    expect(groups.find((x) => x.key === "zelda")?.games).toHaveLength(2);
    expect(baseTitle("Resident Evil 4 (2023)")).toBe("resident evil 4");
    expect(baseTitle("Final Fantasy X HD Remaster")).toBe("final fantasy x");
  });
});