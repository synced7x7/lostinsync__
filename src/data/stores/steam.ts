import type { StoreRecord } from "./types";

/** Steam Web API response shapes (official endpoints, handled in Rust). */
export type SteamGame = {
  appid?: number; name?: string; playtime_forever?: number;
  /** Only returned when the game was played in the last two weeks. */
  playtime_2weeks?: number;
  rtime_last_played?: number;
};
export type SteamOwnedResponse = { response?: { game_count?: number; games?: SteamGame[] } };
export type SteamAchievementsResponse = {
  playerstats?: { success?: boolean; achievements?: { achieved?: number; unlocktime?: number }[] };
};
/** Steam's keyless `IWishlistService/GetWishlist` response. Only app ids are returned. */
export type SteamWishlistResponse = {
  response?: { items?: { appid?: number; priority?: number; date_added?: number }[] };
};

/**
 * Parse the owned-games response. Zero playtime is normal for newly claimed free games; those
 * records are kept so they can be imported as Backlog. A private profile returns no game list.
 */
export function parseSteamOwned(body: SteamOwnedResponse): StoreRecord[] {
  const games = body.response?.games ?? [];
  const records: StoreRecord[] = [];
  for (const g of games) {
    const appid = Number(g.appid);
    const title = String(g.name ?? "").trim();
    if (!Number.isInteger(appid) || appid <= 0 || !title) continue;
    const minutes = Number(g.playtime_forever);
    const last = Number(g.rtime_last_played);
    records.push({
      store: "steam",
      storeId: String(appid),
      title,
      playtimeMinutes: Number.isFinite(minutes) && minutes >= 0 ? minutes : undefined,
      lastPlayedUnix: Number.isFinite(last) && last > 0 ? last : undefined,
      recentlyPlayed: Number(g.playtime_2weeks) > 0,
      installed: false,
    });
  }
  return records;
}

/**
 * Public wishlist from Steam's supported keyless API. Rust resolves app ids to names; the
 * fallback keeps the record so it can still be reviewed instead of silently disappearing.
 * Ownership still wins when an appid appears in both lists.
 */
export function parseSteamWishlist(body: SteamWishlistResponse, names: Record<string, string> = {}): StoreRecord[] {
  const records: StoreRecord[] = [];
  for (const item of body.response?.items ?? []) {
    const id = Number(item.appid);
    if (!Number.isInteger(id) || id <= 0) continue;
    const title = String(names[String(id)] ?? "").trim() || `Steam app ${id}`;
    records.push({
      store: "steam", storeId: String(id), title,
      playtimeMinutes: 0, wishlist: true, installed: false,
    });
  }
  return records;
}

/** `success: false` ("Requested app has no stats") is normal — it means no achievements, never an error. */
export function parseSteamAchievements(body: SteamAchievementsResponse): {
  achieved: number; total: number; firstUnlockUnix?: number;
} {
  const list = body.playerstats?.success === false ? [] : (body.playerstats?.achievements ?? []);
  let firstUnlockUnix: number | undefined;
  for (const a of list) {
    if (!(Number(a.achieved) > 0)) continue;
    const time = Number(a.unlocktime);
    if (Number.isFinite(time) && time > 0 && (firstUnlockUnix === undefined || time < firstUnlockUnix)) firstUnlockUnix = time;
  }
  return {
    achieved: list.filter((a) => Number(a.achieved) > 0).length,
    total: list.length,
    firstUnlockUnix,
  };
}
