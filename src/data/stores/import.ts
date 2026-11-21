import type { AppData, Game, StoreId } from "../../domain/game";
import { emulatedOn } from "../platform";
import { withRetry } from "../backloggd";
import { igdbImportBatch, igdbPlatforms, type IgdbCreds, type IgdbGame, type IgdbImport } from "../igdb";
import { storesFetch, storesFetchAchievements, type SteamCreds } from "./ipc";
import { matchRecord } from "./match";
import {
  emptyStoreReport, minutesToSeconds, norm, storeKey, unixToDate,
  type StoreImportProgress, type StoreImportReport, type StoreRecord,
} from "./types";

const CHUNK = 100;

const cleanRecord = (r: StoreRecord): StoreRecord => ({
  ...r,
  playtimeMinutes: r.playtimeMinutes ?? undefined,
  lastPlayedUnix: r.lastPlayedUnix ?? undefined,
  achievements: r.achievements ?? undefined,
  installed: r.installed ?? undefined,
  recentlyPlayed: r.recentlyPlayed ?? undefined,
  wishlist: r.wishlist ?? undefined,
});

/** Fetch a store's library through the single Rust record path. */
export async function fetchStoreRecords(store: StoreId, steam?: SteamCreds): Promise<StoreRecord[]> {
  return (await storesFetch(store, steam)).map(cleanRecord);
}

const minDate = (a?: string, b?: string) => (a && b ? (a <= b ? a : b) : a ?? b);

/**
 * Steam's mapping rules, in one pure helper used by both new games and refreshes.
 * - wishlist / no playtime: no dates, not mastered.
 * - recently played: Playing, started from the earliest achievement unlock (or a safe fallback), no completion date.
 * - played but not recent: Completed, completion date = last played.
 * Mastery is only true when the game actually has achievements and all of them are unlocked.
 */
export function steamMapping(r: StoreRecord, existing?: Game): Partial<Game> {
  if (r.store !== "steam") return {};
  // A Steam game counts as played only when it has both playtime and a real last-played date.
  // Bought-but-never-opened games have no `rtime_last_played`; they must land in Backlog even if
  // Steam reports a stray non-zero playtime or a recently-played flag.
  const played = (r.playtimeMinutes ?? 0) > 0 && !!r.lastPlayedUnix;
  const achievements = r.achievements;
  const mastered = !!achievements && achievements.total > 0 && achievements.achieved >= achievements.total;
  const lastPlayed = unixToDate(r.lastPlayedUnix);
  const mapped: Partial<Game> = { platinumed: mastered, lastPlayedAt: lastPlayed };

  if (r.wishlist && !played) mapped.status = "Wishlist";
  else if (!played) mapped.status = "Backlog";
  else if (r.recentlyPlayed) mapped.status = "Playing";
  else {
    mapped.status = "Completed";
    if (lastPlayed) mapped.finishedAt = lastPlayed;
  }

  if (!played) {
    mapped.startedAt = undefined;
    mapped.finishedAt = undefined;
  } else {
    // Earliest unlock wins, even if Steam returns achievements in reverse order. When there are
    // no unlocked achievements, fall back to the earlier of when the game was added and last
    // played — never to an existing startedAt, which could itself be a stale/incorrect value.
    const earliestUnlock = achievements && achievements.achieved > 0 ? unixToDate(achievements.firstUnlockUnix) : undefined;
    const firstSync = existing?.createdAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
    mapped.startedAt = earliestUnlock ?? minDate(firstSync, lastPlayed);
    // Final guardrail: a start date can never land after the completion date.
    if (mapped.startedAt && mapped.finishedAt && mapped.startedAt > mapped.finishedAt) {
      mapped.startedAt = mapped.finishedAt;
    }
  }
  return mapped;
}

/**
 * Store-owned refresh: identity, playtime and Steam-derived dates/mastery. IGDB metadata and
 * user-owned fields are never touched — in particular a status changed after the first import
 * is left alone.
 */
export function storePatch(g: Game, r: StoreRecord): Partial<Game> {
  const patch: Partial<Game> = {};
  const links = [...(g.storeLinks ?? [])];
  if (!links.some((l) => l.store === r.store && l.id === r.storeId)) {
    links.push({ store: r.store, id: r.storeId });
    patch.storeLinks = links;
  }
  if (r.store === "steam" && typeof r.playtimeMinutes === "number") {
    const seconds = minutesToSeconds(r.playtimeMinutes);
    patch.steamPlaytimeSeconds = seconds;
    // Replace the visible playtime only when it is still the value Steam gave us (or untouched).
    if (g.totalSeconds === g.steamPlaytimeSeconds || (!g.steamPlaytimeSeconds && !g.totalSeconds)) patch.totalSeconds = seconds;
  }
  if (r.store !== "steam") {
    const last = unixToDate(r.lastPlayedUnix);
    if (last) patch.lastPlayedAt = last;
  }
  if (r.achievements) patch.storeAchievements = r.achievements;
  const mapped = steamMapping(r, g);
  delete mapped.status; // status is only set when the game is first imported
  Object.assign(patch, mapped);
  return patch;
}

/** Build a new game from a store record, using remote IGDB URLs only — never store art. */
export function buildStoreGame(
  r: StoreRecord,
  hit: IgdbImport | undefined,
  platformNames: Map<number, string>,
): Game {
  const ig: IgdbGame | undefined = hit?.game;
  const played = ig?.platforms ?? [];
  const seconds = minutesToSeconds(r.playtimeMinutes);
  const mapped = steamMapping(r);
  return {
    id: crypto.randomUUID(),
    title: ig?.name ?? r.title,
    platform: played[0] ?? "",
    playedPlatforms: played,
    emulatedOn: emulatedOn(played, ig?.platforms ?? []),
    genre: (ig?.genres ?? []).join(", "),
    tags: [],
    status: "Backlog",
    notes: "",
    favorite: false,
    cover: ig?.cover,
    backgroundCover: ig?.background,
    totalSeconds: seconds,
    createdAt: new Date().toISOString(),
    developer: ig?.developer,
    releaseDate: ig?.releaseTs ? new Date(ig.releaseTs * 1000).toISOString().slice(0, 10) : undefined,
    description: ig?.description,
    genres: ig?.genres,
    platforms: ig?.platforms,
    igdbId: ig?.id,
    igdbRating: ig?.rating,
    igdbRatingCount: ig?.ratingCount,
    timeAvgSeconds: ig?.timeAvg,
    timeMainSeconds: ig?.timeMain,
    timeFullSeconds: ig?.timeFull,
    igdbImages: hit?.images,
    igdbVideos: ig?.videos.slice(0, 3).map((v) => ({ id: v.videoId, name: v.name })),
    gameType: ig?.gameType,
    gameStatus: ig?.gameStatus,
    franchises: ig?.franchises,
    themes: ig?.themes,
    playerPerspectives: ig?.playerPerspectives,
    igdbUpdatedAt: ig?.updatedAt,
    ...mapped,
    storeLinks: [{ store: r.store, id: r.storeId }],
    steamPlaytimeSeconds: r.store === "steam" ? seconds : undefined,
    storeAchievements: r.achievements,
  };
}

/** Fill IGDB metadata on a store game imported before a match was available. Never touches user-owned fields. */
export function igdbEnrichmentPatch(g: Game, igdbId: number, hit: IgdbImport | undefined): Partial<Game> {
  const ig = hit?.game;
  if (!ig) return {};
  const played = ig.platforms ?? [];
  return {
    igdbId,
    title: ig.name,
    platform: played[0] ?? g.platform,
    playedPlatforms: played,
    emulatedOn: emulatedOn(played, ig.platforms ?? []),
    genre: (ig.genres ?? []).join(", "),
    cover: ig.cover,
    backgroundCover: ig.background,
    developer: ig.developer,
    releaseDate: ig.releaseTs ? new Date(ig.releaseTs * 1000).toISOString().slice(0, 10) : undefined,
    description: ig.description,
    genres: ig.genres,
    platforms: ig.platforms,
    igdbRating: ig.rating,
    igdbRatingCount: ig.ratingCount,
    timeAvgSeconds: ig.timeAvg,
    timeMainSeconds: ig.timeMain,
    timeFullSeconds: ig.timeFull,
    igdbImages: hit.images,
    igdbVideos: ig.videos.slice(0, 3).map((v) => ({ id: v.videoId, name: v.name })),
    gameType: ig.gameType,
    gameStatus: ig.gameStatus,
    franchises: ig.franchises,
    themes: ig.themes,
    playerPerspectives: ig.playerPerspectives,
    igdbUpdatedAt: ig.updatedAt,
  };
}

export type StoreImportOptions = {
  store: StoreId;
  records: StoreRecord[];
  data: AppData;
  creds: IgdbCreds;
  steam?: SteamCreds;
  onProgress?: (p: StoreImportProgress) => void;
  signal?: AbortSignal;
};
export type StoreImportResult = { games: Game[]; patches: Map<string, Partial<Game>>; report: StoreImportReport };

/** One-way import: fetch -> dedupe -> match -> enrich -> build/refresh, with a report for everything skipped. */
export async function importFromStore(opts: StoreImportOptions): Promise<StoreImportResult> {
  const { store, records, data, creds, steam, signal } = opts;
  const report = emptyStoreReport(store, records.length);
  const games: Game[] = [];
  const patches = new Map<string, Partial<Game>>();
  const progress = (phase: StoreImportProgress["phase"], done: number, total: number) =>
    opts.onProgress?.({ phase, done, total });

  if (store === "steam" && !records.some((r) => r.wishlist)) {
    report.warnings.push("No wishlist games were returned. Check that your Steam wishlist is public, contains games, and that the SteamID64 is correct.");
  }

  const byStore = new Map<string, Game>();
  const byIgdb = new Map<number, Game>();
  const byTitle = new Map<string, Game>();
  for (const g of data.games) {
    for (const link of g.storeLinks ?? []) byStore.set(`${link.store}:${link.id}`, g);
    if (typeof g.igdbId === "number") byIgdb.set(g.igdbId, g);
    byTitle.set(norm(g.title), g);
  }

  const seen = new Map<string, number>();
  const todo: StoreRecord[] = [];
  for (const raw of records) {
    const r = cleanRecord(raw);
    if (!r.storeId || !r.title.trim()) { report.failures.push({ title: r.title || "(untitled)", error: "Missing store id or title" }); continue; }
    const key = storeKey(r);
    const previous = seen.get(key);
    if (previous !== undefined) {
      report.duplicates++;
      // An owned game appearing on the wishlist too is still owned — ownership wins.
      if (!r.wishlist && todo[previous].wishlist) todo[previous] = { ...r, store };
      continue;
    }
    seen.set(key, todo.length);
    todo.push({ ...r, store });
  }
  if (!todo.length) { progress("done", 0, 0); return { games, patches, report }; }

  // Achievements are always fetched for Steam (one request per owned game); a missing achievement
  // schema is handled in Rust as { achieved: 0, total: 0 } rather than an error.
  if (store === "steam") {
    progress("achievements", 0, todo.length);
    for (let i = 0; i < todo.length; i++) {
      if (signal?.aborted) { report.cancelled = true; break; }
      if (!todo[i].wishlist) {
        try { todo[i].achievements = await storesFetchAchievements("steam", todo[i].storeId, steam); }
        catch { /* achievements are a nice-to-have, not a reason to fail the import */ }
      }
      progress("achievements", i + 1, todo.length);
    }
  }

  // Match and dedupe in priority order: (store, storeId) -> igdbId -> normalized title.
  const matched = new Map<StoreRecord, Awaited<ReturnType<typeof matchRecord>>>();
  const linked = new Set<StoreRecord>();
  const enrichments: { game: Game; igdbId: number }[] = [];
  progress("matching", 0, todo.length);
  for (let i = 0; i < todo.length; i++) {
    if (signal?.aborted) { report.cancelled = true; break; }
    const r = todo[i];
    const m = await matchRecord(r, creds);
    matched.set(r, m);
    const existing = byStore.get(storeKey(r))
      ?? (m.igdbId !== undefined ? byIgdb.get(m.igdbId) : undefined)
      ?? byTitle.get(norm(r.title));
    if (existing) {
      const patch = storePatch(existing, r);
      if (Object.keys(patch).length) patches.set(existing.id, patch);
      else report.duplicates++;
      if (!byStore.has(storeKey(r))) report.linked++;
      byStore.set(storeKey(r), existing);
      if (m.igdbId !== undefined) byIgdb.set(m.igdbId, existing);
      // A game imported before an IGDB match existed gains its metadata on the next sync.
      if (!existing.igdbId && m.igdbId !== undefined) enrichments.push({ game: existing, igdbId: m.igdbId });
      linked.add(r);
    }
    progress("matching", i + 1, todo.length);
  }

  const pending = todo.filter((r) => !linked.has(r));
  const ids = [...new Set([
    ...pending.map((r) => matched.get(r)?.igdbId),
    ...enrichments.map((e) => e.igdbId),
  ].filter((id): id is number => typeof id === "number" && id > 0))];
  const imports = new Map<number, IgdbImport>();
  let platformNames = new Map<number, string>();
  if (ids.length && creds.clientId && creds.clientSecret) {
    progress("details", 0, ids.length);
    try { platformNames = await withRetry(() => igdbPlatforms(creds)); } catch { /* details still work without platform names */ }
    for (let i = 0; i < ids.length; i += CHUNK) {
      if (signal?.aborted) { report.cancelled = true; break; }
      const chunk = ids.slice(i, i + CHUNK);
      try {
        const rows = await withRetry(() => igdbImportBatch(chunk, creds));
        for (const row of rows) imports.set(row.game.id, row);
      } catch (error) {
        chunk.forEach((id) => report.failures.push({ title: `IGDB ${id}`, error: String(error) }));
      }
      progress("details", Math.min(i + chunk.length, ids.length), ids.length);
    }
  }

  for (const { game: existing, igdbId } of enrichments) {
    const patch = igdbEnrichmentPatch(existing, igdbId, imports.get(igdbId));
    if (!Object.keys(patch).length) continue;
    patches.set(existing.id, { ...patches.get(existing.id), ...patch });
    report.updated++;
  }

  const ownByIgdb = new Map<number, Game>();
  for (const r of pending) {
    if (signal?.aborted) { report.cancelled = true; break; }
    const m = matched.get(r);
    if (!m?.igdbId) {
      report.needsReview.push({ title: r.title, storeId: r.storeId, reason: m?.reason ?? "No IGDB match." });
    }
    if (m?.igdbId && ownByIgdb.has(m.igdbId)) {
      const target = ownByIgdb.get(m.igdbId)!;
      target.storeLinks = [...(target.storeLinks ?? []), { store: r.store, id: r.storeId }];
      report.duplicates++;
      continue;
    }
    const game = buildStoreGame(r, m?.igdbId ? imports.get(m.igdbId) : undefined, platformNames);
    if (m?.igdbId) ownByIgdb.set(m.igdbId, game);
    games.push(game);
  }

  report.imported = games.length;
  progress("done", todo.length, todo.length);
  return { games, patches, report };
}
