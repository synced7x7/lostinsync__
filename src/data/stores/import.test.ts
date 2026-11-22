import { describe, expect, it } from "vitest";
import type { AppData, Game } from "../../domain/game";
import type { IgdbImport } from "../igdb";
import { buildStoreGame, igdbEnrichmentPatch, steamMapping, storePatch } from "./import";
import { emptyStoreReport, storeReportToText, stripStoreCredentials } from "./types";

const game = (patch: Partial<Game> = {}): Game => ({
  id: "g1", title: "Hades", platform: "PC", genre: "Action", tags: [], status: "Playing",
  notes: "my notes", favorite: true, rating: 9, totalSeconds: 3720, createdAt: "2025-01-01T00:00:00.000Z",
  ...patch,
});

const hit: IgdbImport = {
  game: {
    id: 42, name: "Hades", genres: ["Action"], platforms: ["PC"], videos: [], screenshots: [], themes: [], playerPerspectives: [], similarGames: [],
    cover: "https://images.igdb.com/igdb/image/upload/t_cover_big_2x/co1.jpg",
    background: "https://images.igdb.com/igdb/image/upload/t_1080p/bg1.jpg",
  },
  images: [],
};

describe("steamMapping", () => {
  it("maps a wishlist game to Wishlist with no dates or mastery", () => {
    const mapped = steamMapping({ store: "steam", storeId: "10", title: "X", wishlist: true, playtimeMinutes: 0 });
    expect(mapped).toMatchObject({ status: "Wishlist", startedAt: undefined, finishedAt: undefined, platinumed: false });
  });

  it("maps unplayed games to Backlog", () => {
    expect(steamMapping({ store: "steam", storeId: "10", title: "X", playtimeMinutes: 0 }))
      .toMatchObject({ status: "Backlog", startedAt: undefined, finishedAt: undefined });
  });

  it("maps bought-but-never-opened games (no last played) to Backlog", () => {
    const mapped = steamMapping({
      store: "steam", storeId: "10", title: "Game of Thrones Kingsroad",
      playtimeMinutes: 0, lastPlayedUnix: undefined, recentlyPlayed: false,
    });
    expect(mapped.status).toBe("Backlog");
    expect(mapped.startedAt).toBeUndefined();
    expect(mapped.finishedAt).toBeUndefined();
  });

  it("treats stray playtime without a last-played date as never played", () => {
    const mapped = steamMapping({
      store: "steam", storeId: "10", title: "X", playtimeMinutes: 42,
      lastPlayedUnix: undefined, recentlyPlayed: true,
    });
    expect(mapped.status).toBe("Backlog");
    expect(mapped.startedAt).toBeUndefined();
    expect(mapped.finishedAt).toBeUndefined();
  });

  it("maps recently played games to Playing with an achievement-based start and no completion date", () => {
    const mapped = steamMapping({
      store: "steam", storeId: "10", title: "X", playtimeMinutes: 120, recentlyPlayed: true,
      lastPlayedUnix: 1_700_000_000,
      achievements: { achieved: 3, total: 3, firstUnlockUnix: 1_600_000_000 },
    });
    expect(mapped.status).toBe("Playing");
    expect(mapped.startedAt).toBe("2020-09-13");
    expect(mapped.finishedAt).toBeUndefined();
    expect(mapped.platinumed).toBe(true);
    expect(mapped.lastPlayedAt).toBe("2023-11-14");
  });

  it("maps played-but-not-recent games to Completed, using last played as completion", () => {
    const mapped = steamMapping({
      store: "steam", storeId: "10", title: "X", playtimeMinutes: 120,
      lastPlayedUnix: 1_700_000_000,
      achievements: { achieved: 2, total: 3, firstUnlockUnix: 1_600_000_000 },
    });
    expect(mapped.status).toBe("Completed");
    expect(mapped.startedAt).toBe("2020-09-13");
    expect(mapped.finishedAt).toBe("2023-11-14");
    expect(mapped.platinumed).toBe(false);
  });

  it("falls back to the earlier of first sync and last played when there are no unlocked achievements", () => {
    const mapped = steamMapping({
      store: "steam", storeId: "10", title: "X", playtimeMinutes: 120,
      lastPlayedUnix: 1_500_000_000,
      achievements: { achieved: 0, total: 0 },
    });
    // rtime_last_played is older than today, so the start never lands after completion.
    expect(mapped.startedAt).toBe("2017-07-14");
    expect(mapped.finishedAt).toBe("2017-07-14");
    expect(mapped.platinumed).toBe(false);
  });

  it("never reuses a stale startedAt as the no-achievement fallback", () => {
    const mapped = steamMapping({
      store: "steam", storeId: "10", title: "X", playtimeMinutes: 120,
      lastPlayedUnix: 1_500_000_000,
      achievements: { achieved: 0, total: 0 },
    }, game({ startedAt: "2024-05-05", createdAt: "2025-01-01T00:00:00.000Z" }));
    expect(mapped.startedAt).toBe("2017-07-14");
  });

  it("uses last played for completion and never an achievement unlock date", () => {
    const mapped = steamMapping({
      store: "steam", storeId: "10", title: "X", playtimeMinutes: 120,
      lastPlayedUnix: 1_700_000_000,
      achievements: { achieved: 40, total: 40, firstUnlockUnix: 1_600_000_000 },
    });
    expect(mapped.finishedAt).toBe("2023-11-14");
    expect(mapped.startedAt).toBe("2020-09-13");
  });

  it("clamps a start date that would otherwise be after completion", () => {
    const mapped = steamMapping({
      store: "steam", storeId: "10", title: "X", playtimeMinutes: 120,
      lastPlayedUnix: 1_500_000_000,
      achievements: { achieved: 1, total: 1, firstUnlockUnix: 1_700_000_000 },
    });
    expect(mapped.startedAt).toBe("2017-07-14");
    expect(mapped.finishedAt).toBe("2017-07-14");
  });

  it("never marks a game with zero achievements as mastered", () => {
    expect(steamMapping({ store: "steam", storeId: "1", title: "X", playtimeMinutes: 1,
      achievements: { achieved: 0, total: 0 } }).platinumed).toBe(false);
  });

  it("leaves non-Steam stores untouched", () => {
    expect(steamMapping({ store: "epic", storeId: "5", title: "X", playtimeMinutes: 10 })).toEqual({});
  });
});

describe("storePatch", () => {
  it("adds store identity without touching user-owned fields or status on refresh", () => {
    const patch = storePatch(game(), { store: "steam", storeId: "123", title: "Hades" });
    expect(patch.storeLinks).toEqual([{ store: "steam", id: "123" }]);
    expect(patch.status).toBeUndefined();
    expect(patch.notes).toBeUndefined();
    expect(patch.rating).toBeUndefined();
    expect(patch.favorite).toBeUndefined();
  });

  it("refreshes playtime only while the visible value is still store-sourced", () => {
    const synced = game({ steamPlaytimeSeconds: 3720 });
    expect(storePatch(synced, { store: "steam", storeId: "123", title: "Hades", playtimeMinutes: 500 }))
      .toMatchObject({ steamPlaytimeSeconds: 30_000, totalSeconds: 30_000 });

    const edited = game({ steamPlaytimeSeconds: 3720, totalSeconds: 9999 });
    const patch = storePatch(edited, { store: "steam", storeId: "123", title: "Hades", playtimeMinutes: 500 });
    expect(patch.steamPlaytimeSeconds).toBe(30_000);
    expect(patch.totalSeconds).toBeUndefined();
  });

  it("carries last played and achievements but never status or notes", () => {
    const patch = storePatch(game(), {
      store: "steam", storeId: "123", title: "Hades",
      lastPlayedUnix: 1_700_000_000, achievements: { achieved: 30, total: 40 },
    });
    expect(patch.lastPlayedAt).toBe("2023-11-14");
    expect(patch.storeAchievements).toEqual({ achieved: 30, total: 40 });
    expect(patch.status).toBeUndefined();
    expect(patch.notes).toBeUndefined();
  });

  it("refreshes dates and mastery but keeps a manually changed status", () => {
    const patch = storePatch(game({ status: "Shelved" }), {
      store: "steam", storeId: "123", title: "Hades", playtimeMinutes: 60, recentlyPlayed: false,
      lastPlayedUnix: 1_700_000_000, achievements: { achieved: 40, total: 40, firstUnlockUnix: 1_600_000_000 },
    });
    expect(patch.status).toBeUndefined();
    expect(patch.finishedAt).toBe("2023-11-14");
    expect(patch.platinumed).toBe(true);
  });
});

describe("buildStoreGame", () => {
  it("uses IGDB metadata and remote image URLs only", () => {
    const built = buildStoreGame(
      { store: "steam", storeId: "123", title: "Hades", playtimeMinutes: 62, lastPlayedUnix: 1_700_000_000 },
      hit,
    );
    expect(built.title).toBe("Hades");
    expect(built.igdbId).toBe(42);
    expect(built.cover).toBe(hit.game.cover);
    expect(built.totalSeconds).toBe(3720);
    expect(built.status).toBe("Completed");
    expect(built.storeLinks).toEqual([{ store: "steam", id: "123" }]);
  });

  it("creates a local-only game when no IGDB match was found", () => {
    const built = buildStoreGame({ store: "epic", storeId: "abc", title: "Unknown indie game" }, undefined);
    expect(built.igdbId).toBeUndefined();
    expect(built.title).toBe("Unknown indie game");
    expect(built.cover).toBeUndefined();
    expect(built.status).toBe("Backlog");
  });
});

describe("igdbEnrichmentPatch", () => {
  it("adds IGDB metadata to a game imported before a match existed", () => {
    const unlinked = game({ igdbId: undefined, title: "Rocket League®", cover: undefined });
    const patch = igdbEnrichmentPatch(unlinked, 42, hit);
    expect(patch).toMatchObject({ igdbId: 42, title: "Hades", cover: hit.game.cover });
    expect(patch.status).toBeUndefined();
    expect(patch.notes).toBeUndefined();
    expect(patch.rating).toBeUndefined();
  });
});

describe("backup safety", () => {
  it("keeps store ids across a JSON round trip and strips any credential keys", () => {
    const data = { games: [buildStoreGame({ store: "epic", storeId: "5", title: "X" }, undefined)], profile: {}, settings: {} } as unknown as AppData;
    const parsed = JSON.parse(JSON.stringify(data)) as AppData;
    expect(parsed.games[0].storeLinks).toEqual([{ store: "epic", id: "5" }]);

    const settings = { ...data.settings, steamApiKey: "secret", igdbClientId: "public" } as AppData["settings"];
    const cleaned = stripStoreCredentials(settings);
    expect(cleaned).not.toHaveProperty("steamApiKey");
    expect(cleaned.igdbClientId).toBe("public");
  });

  it("writes a readable report", () => {
    const report = emptyStoreReport("steam", 2);
    report.imported = 1;
    report.needsReview.push({ title: "Odd game", storeId: "99", reason: "Ambiguous title" });
    expect(storeReportToText(report)).toContain("Odd game (steam id 99): Ambiguous title");
  });
});
