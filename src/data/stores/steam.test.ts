import { describe, expect, it } from "vitest";
import { parseSteamAchievements, parseSteamOwned, parseSteamWishlist } from "./steam";

describe("parseSteamOwned", () => {
  it("keeps minutes as minutes and flags recently played games", () => {
    const records = parseSteamOwned({
      response: {
        games: [
          { appid: 10, name: "Hades", playtime_forever: 372, playtime_2weeks: 45, rtime_last_played: 1_700_000_000 },
          { appid: 20, name: "Celeste", playtime_forever: 0 },
        ],
      },
    });
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      store: "steam", storeId: "10", title: "Hades", playtimeMinutes: 372,
      lastPlayedUnix: 1_700_000_000, recentlyPlayed: true,
    });
    expect(records[1].recentlyPlayed).toBe(false);
    expect(records[1].lastPlayedUnix).toBeUndefined();
  });

  it("keeps an entire library of unplayed games instead of calling it private", () => {
    const games = Array.from({ length: 5 }, (_, i) => ({ appid: i + 1, name: `Game ${i}`, playtime_forever: 0 }));
    expect(parseSteamOwned({ response: { games } })).toHaveLength(5);
  });

  it("skips entries without an app id or title and handles a missing response", () => {
    const records = parseSteamOwned({ response: { games: [
      { name: "No id", playtime_forever: 10 }, { appid: 5, playtime_forever: 10 }, { appid: 6, name: "Valid" },
    ] } });
    expect(records.map((r) => r.storeId)).toEqual(["6"]);
    expect(parseSteamOwned({})).toEqual([]);
  });
});

describe("parseSteamWishlist", () => {
  it("maps the keyless API's app ids to wishlist records with no playtime", () => {
    expect(parseSteamWishlist({
      response: { items: [
        { appid: 10, priority: 1, date_added: 1_500_000_000 },
        { appid: 20 },
        { appid: 0 },
      ] },
    }, { "10": "Counter-Strike", "20": "Portal" })).toEqual([
      { store: "steam", storeId: "10", title: "Counter-Strike", playtimeMinutes: 0, wishlist: true, installed: false },
      { store: "steam", storeId: "20", title: "Portal", playtimeMinutes: 0, wishlist: true, installed: false },
    ]);
  });

  it("keeps an unnamed app so it can be reviewed instead of disappearing", () => {
    expect(parseSteamWishlist({ response: { items: [{ appid: 730 }] } })[0])
      .toMatchObject({ storeId: "730", title: "Steam app 730", wishlist: true });
  });

  it("treats a private or empty wishlist as no games", () => {
    expect(parseSteamWishlist({ response: {} })).toEqual([]);
  });
});

describe("parseSteamAchievements", () => {
  it("counts unlocked achievements and finds the earliest unlock time", () => {
    expect(parseSteamAchievements({ playerstats: { achievements: [
      { achieved: 1, unlocktime: 1_600_000_000 }, { achieved: 0 }, { achieved: 1, unlocktime: 1_500_000_000 },
    ] } })).toEqual({ achieved: 2, total: 3, firstUnlockUnix: 1_500_000_000 });
  });

  it("treats a missing achievement schema as zero, not an error", () => {
    expect(parseSteamAchievements({ playerstats: { success: false } })).toEqual({ achieved: 0, total: 0 });
    expect(parseSteamAchievements({})).toEqual({ achieved: 0, total: 0 });
  });

  it("never invents a start date from locked achievements", () => {
    expect(parseSteamAchievements({ playerstats: { achievements: [{ achieved: 0, unlocktime: 1_400_000_000 }] } }))
      .toEqual({ achieved: 0, total: 1, firstUnlockUnix: undefined });
  });
});
