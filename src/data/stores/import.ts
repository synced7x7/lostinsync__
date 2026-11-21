import { STATUSES, type AppData, type Game, type Status, type StoreId } from "../../domain/game";
import { ALL_PLATFORMS, emulatedOn } from "../platform";
import { withRetry } from "../backloggd";
import { igdbImportBatch, igdbPlatforms, igdbSearch, type IgdbCreds, type IgdbGame, type IgdbImport } from "../igdb";
import { storesFetch, storesFetchAchievements, type SteamCreds } from "./ipc";
import { chooseLoose, chooseStrict, matchRecord } from "./match";
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


/* ───────────── Generic CSV import ───────────── */

export type CsvImportProgress = { phase: "matching" | "details" | "done"; done: number; total: number };
export type CsvImportReport = {
  total: number; imported: number; cancelled: boolean;
  byIgdbId: number; strict: number; loose: number;
  duplicates: string[];
  needsReview: { title: string; reason: string }[];
  warnings: string[];
  failures: { title: string; error: string }[];
};

type CsvEntry = {
  title: string; igdbId?: number; status: Status; seconds: number;
  startedAt?: string; finishedAt?: string; rating?: number;
  mastered: boolean; favorite: boolean; played: string[];
};

/** RFC-4180-ish parser: BOM, quotes, CRLF, and `,` or `;` delimiter (auto-detected from the header line). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const first = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  const endRow = () => { row.push(cell); cell = ""; if (row.some((x) => x.trim())) rows.push(row); row = []; };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && src[i + 1] === "\n") i++; endRow(); }
    else cell += c;
  }
  endRow();
  return rows;
}

const headerKey = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const pick = (r: Record<string, string>, ...keys: string[]) => {
  for (const k of keys) { const v = r[k]?.trim(); if (v) return v; }
  return undefined;
};

/** "12h 30m", "12:30", "1.5h", "90 min" -> seconds. A bare number is treated as minutes (or hours for `bare: "hours"`). */
export function parsePlaytimeSeconds(v?: string, bare: "minutes" | "hours" = "minutes"): number {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return 0;
  const clock = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clock) return +clock[1] * 3600 + +clock[2] * 60 + +(clock[3] ?? 0);
  const num = (x?: RegExpMatchArray | null) => (x ? parseFloat(x[1].replace(",", ".")) : 0);
  const h = s.match(/(\d+(?:[.,]\d+)?)\s*h(?:ours?|rs?)?/);
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*m(?:in(?:ute)?s?)?/);
  if (h || m) return Math.round(num(h) * 3600 + num(m) * 60);
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * (bare === "hours" ? 3600 : 60)) : 0;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const toDate = (v?: string) => {
  const s = v?.trim();
  if (!s) return undefined;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : ymd(new Date(t));
};
const toRating = (v?: string) => {
  const n = parseFloat((v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.min(10, Math.round(n)) : undefined; // app scale: 1–10
};
const toBool = (v?: string) => /^(1|true|yes|y|t)$/i.test((v ?? "").trim());

const STATUS_BY_KEY = new Map<string, Status>(STATUSES.map((s) => [norm(s), s]));
const PLATFORM_BY_KEY = new Map<string, string>(ALL_PLATFORMS.map((p) => [norm(p), p]));
for (const [k, v] of Object.entries({ pc: "PC (Microsoft Windows)", ps5: "PlayStation 5", ps4: "PlayStation 4", switch: "Nintendo Switch", xboxseriesx: "Xbox Series X|S" })) PLATFORM_BY_KEY.set(k, v);
/** `played_on` values are separated by `;` or `,`. Unknown names are kept as typed. */
const toPlatforms = (v?: string) =>
  [...new Set((v ?? "").split(/[;,]/).map((p) => p.trim()).filter(Boolean).map((p) => PLATFORM_BY_KEY.get(norm(p)) ?? p))];

async function resolveTitle(title: string, creds: IgdbCreds): Promise<{ id?: number; how?: "strict" | "loose"; reason?: string }> {
  try {
    const strict = chooseStrict(await withRetry(() => igdbSearch(`/ ${title}`, creds)), title);
    if (strict) return { id: strict.id, how: "strict" };
  } catch { /* fall through to the generic search */ }
  try {
    const c = chooseLoose(await withRetry(() => igdbSearch(title, creds)), title);
    return c.hit ? { id: c.hit.id, how: "loose" } : { reason: c.reason };
  } catch (e) { return { reason: `IGDB search failed: ${e instanceof Error ? e.message : String(e)}` }; }
}

function toCsvGame(e: CsvEntry, hit?: IgdbImport): Game {
  const base = buildStoreGame({ store: "epic", storeId: "csv", title: e.title, playtimeMinutes: e.seconds / 60 }, hit, new Map());
  return {
    ...base,
    platform: e.played[0] ?? "",
    playedPlatforms: e.played,
    emulatedOn: hit ? emulatedOn(e.played, hit.game.platforms ?? []) : [],
    status: e.status, rating: e.rating, platinumed: e.mastered, favorite: e.favorite,
    startedAt: e.startedAt, finishedAt: e.finishedAt, totalSeconds: e.seconds,
    storeLinks: undefined, // not a store import
  };
}

/** Columns: title (required), igdb_id, status, playtime, starting_date, completed_date, rating, mastery|mastered, favorites, played_on. */
export async function importCsv(
  text: string, existing: Game[], creds: IgdbCreds,
  onProgress: (p: CsvImportProgress) => void, signal?: AbortSignal,
): Promise<{ games: Game[]; report: CsvImportReport }> {
  const rows = parseCsv(text);
  const head = (rows[0] ?? []).map(headerKey);
  if (!head.includes("title") && !head.includes("igdb_id")) throw new Error('The CSV needs a "title" or "igdb_id" column.');
  const report: CsvImportReport = {
    total: rows.length - 1, imported: 0, cancelled: false, byIgdbId: 0, strict: 0, loose: 0,
    duplicates: [], needsReview: [], warnings: [], failures: [],
  };
  const games: Game[] = [];

  const haveId = new Set(existing.map((g) => g.igdbId).filter((x): x is number => typeof x === "number"));
  const haveTitle = new Set(existing.map((g) => norm(g.title)));
  const seenId = new Set<number>(), seenTitle = new Set<string>();
  const todo: CsvEntry[] = [];

  rows.slice(1).forEach((cells, i) => {
    const r: Record<string, string> = {};
    head.forEach((h, k) => { if (h && r[h] === undefined) r[h] = cells[k] ?? ""; });
    const title = (r.title ?? "").trim();
    const rawId = Number((r.igdb_id ?? "").trim());
    const igdbId = Number.isInteger(rawId) && rawId > 0 ? rawId : undefined;
    const label = title || `Row ${i + 2}`;
    if (!title && !igdbId) { report.failures.push({ title: label, error: "Missing title" }); return; }

    if (igdbId ? haveId.has(igdbId) || seenId.has(igdbId) : haveTitle.has(norm(title)) || seenTitle.has(norm(title))) {
      report.duplicates.push(label); return;
    }
    if (igdbId) seenId.add(igdbId); else seenTitle.add(norm(title));

    let status: Status = "Backlog";
    const rawStatus = pick(r, "status");
    if (rawStatus) {
      const s = STATUS_BY_KEY.get(norm(rawStatus));
      if (s) status = s; else report.warnings.push(`${label}: unknown status "${rawStatus}", set to Backlog`);
    }
    let startedAt = toDate(pick(r, "starting_date", "start_date", "started"));
    const finishedAt = toDate(pick(r, "completed_date", "completion_date", "finish_date", "finished"));
    if (startedAt && finishedAt && finishedAt < startedAt) { startedAt = undefined; report.warnings.push(`${label}: completed date was before starting date, starting date dropped`); }

    todo.push({
      title, igdbId, status,
      seconds: parsePlaytimeSeconds(pick(r, "playtime", "playtime_minutes")) || parsePlaytimeSeconds(pick(r, "playtime_hours", "total_hours"), "hours"),
      startedAt, finishedAt,
      rating: toRating(pick(r, "rating")),
      mastered: toBool(pick(r, "mastery", "mastered")),
      favorite: toBool(pick(r, "favorites", "favorite")),
      played: toPlatforms(pick(r, "played_on", "platform", "platforms")),
    });
  });
  if (!todo.length) { onProgress({ phase: "done", done: 0, total: 0 }); return { games, report }; }

  const imports = new Map<number, IgdbImport>();
  const fetchIds = async (ids: number[]) => {
    for (let i = 0; i < ids.length; i += CHUNK) {
      if (signal?.aborted) { report.cancelled = true; return; }
      const chunk = ids.slice(i, i + CHUNK);
      try { for (const row of await withRetry(() => igdbImportBatch(chunk, creds))) imports.set(row.game.id, row); }
      catch (error) { chunk.forEach((id) => report.failures.push({ title: `IGDB ${id}`, error: String(error) })); }
      onProgress({ phase: "details", done: Math.min(i + chunk.length, ids.length), total: ids.length });
    }
  };

  // 1) igdb_id column has top priority
  await fetchIds([...new Set(todo.map((e) => e.igdbId).filter((x): x is number => !!x))]);

  // 2) everything not resolved by id: strict title search, then generic search
  const resolved = new Map<CsvEntry, number>(), reasons = new Map<CsvEntry, string>(), processed = new Set<CsvEntry>();
  for (let i = 0; i < todo.length; i++) {
    if (signal?.aborted) { report.cancelled = true; break; }
    const e = todo[i];
    if (e.igdbId && imports.has(e.igdbId)) { resolved.set(e, e.igdbId); report.byIgdbId++; }
    else if (e.title) {
      if (e.igdbId) report.warnings.push(`${e.title}: IGDB id ${e.igdbId} not found, searched by title instead`);
      const m = await resolveTitle(e.title, creds);
      if (m.id) { resolved.set(e, m.id); if (m.how === "strict") report.strict++; else report.loose++; }
      else reasons.set(e, m.reason ?? "No confident IGDB match; imported without online metadata.");
    } else report.failures.push({ title: `IGDB ${e.igdbId}`, error: "IGDB id not found and no title to search with" });
    processed.add(e);
    onProgress({ phase: "matching", done: i + 1, total: todo.length });
  }

  // 3) details for ids found by title
  await fetchIds([...new Set(resolved.values())].filter((id) => !imports.has(id)));

  const own = new Set<number>();
  for (const e of todo) {
    if (!processed.has(e)) continue;
    const id = resolved.get(e);
    if (!id && !e.title) continue; // already reported as a failure
    if (id && (haveId.has(id) || own.has(id))) { report.duplicates.push(e.title || `IGDB ${id}`); continue; }
    const hit = id ? imports.get(id) : undefined;
    if (id && hit) own.add(id);
    if (!hit) report.needsReview.push({ title: e.title, reason: reasons.get(e) ?? "IGDB details could not be fetched; imported without online metadata." });
    games.push(toCsvGame(e, hit));
  }
  report.imported = games.length;
  onProgress({ phase: "done", done: todo.length, total: todo.length });
  return { games, report };
}

export function csvReportSections(r: CsvImportReport): { title: string; items: string[] }[] {
  return [
    { title: "Needs review (imported without online metadata)", items: r.needsReview.map((x) => `${x.title}: ${x.reason}`) },
    { title: "Skipped duplicates", items: r.duplicates },
    { title: "Warnings", items: r.warnings },
    { title: "Failures", items: r.failures.map((x) => `${x.title}: ${x.error}`) },
  ].filter((s) => s.items.length);
}

export function csvReportToText(r: CsvImportReport): string {
  const head = `CSV import: ${r.imported} imported of ${r.total} rows (${r.byIgdbId} by IGDB id, ${r.strict} strict title, ${r.loose} generic title)${r.cancelled ? " (cancelled)" : ""}`;
  return [head, ...csvReportSections(r).map((s) => `\n${s.title} (${s.items.length})\n${s.items.map((i) => `- ${i}`).join("\n")}`)].join("\n");
}