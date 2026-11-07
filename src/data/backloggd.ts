import type { Game, Status } from "../domain/game";
import { emulatedOn } from "./platform";
import { igdbImportBatch, igdbPlatforms, type IgdbCreds, type IgdbDebugImage, type IgdbGame, type IgdbImport } from "./igdb";

type BlPlayDate = { start_date?: string | null; finish_date?: string | null; tags?: string[] | null };
type BlPlay = {
  created_at?: string; rating?: number | null; review?: string | null; platform?: number | null; played_platform?: number | null;
  hours_played?: number; mins_played?: number; is_master?: boolean; is_replay?: boolean;
  start_date?: string | null; finish_date?: string | null; play_dates?: BlPlayDate[];
};
type BlLog = {
  status?: string | null; rating?: number | null; is_play?: boolean; is_playing?: boolean; is_backlog?: boolean; is_wishlist?: boolean;
  game_liked?: boolean; total_hours?: number; total_minutes?: number; last_edited_at?: number;
};
export type BlEntry = { id: string | number; name: string; game_log?: BlLog; playthroughs?: Record<string, BlPlay> };

export type ImportProgress = { phase: "platforms" | "details" | "done"; done: number; total: number };
export type ImportReport = {
  total: number; imported: number; cancelled: boolean;
  duplicates: { id: number; name: string }[];
  notFound: { id: number; name: string }[];
  nameMismatch: { id: number; backloggd: string; igdb: string }[];
  unknownPlatforms: { name: string; platformId: number }[];
  unknownStatuses: { name: string; status: string }[];
  dateFixes: { name: string; note: string }[];
  failures: { name: string; error: string }[];
};

const CHUNK = 100;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const dateOnly = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);
const loose = (v?: string) => { const t = Date.parse(v ?? ""); return Number.isNaN(t) ? undefined : t; };
const unique = <T>(a: T[]) => [...new Set(a)];
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const positive = (v?: number | null) => (v && v > 0 ? Math.min(10, Math.round(v)) : undefined);

const STATUS_MAP: Record<string, Status> = { completed: "Completed", retired: "Retired", shelved: "Shelved", abandoned: "Abandoned" };

const startOf = (p: BlPlay) =>
  dateOnly(p.start_date) ?? (p.play_dates ?? []).map((d) => dateOnly(d.start_date)).filter((d): d is string => !!d).sort()[0];
const finishOf = (p: BlPlay) => {
  const all = (p.play_dates ?? []).map((d) => dateOnly(d.finish_date)).filter((d): d is string => !!d).sort();
  return dateOnly(p.finish_date) ?? all[all.length - 1];
};
const startKey = (p: BlPlay) => loose(startOf(p)) ?? loose(p.created_at) ?? Infinity;

/** First non-replay playthrough (earliest start) leads, then the rest by start date. */
function ordered(list: BlPlay[]) {
  const byStart = [...list].sort((a, b) => { const x = startKey(a), y = startKey(b); return x === y ? 0 : x < y ? -1 : 1; });
  const lead = byStart.find((p) => !p.is_replay) ?? byStart[0];
  return lead ? [lead, ...byStart.filter((p) => p !== lead)] : [];
}

export const emptyReport = (total: number): ImportReport => ({
  total, imported: 0, cancelled: false, duplicates: [], notFound: [], nameMismatch: [], unknownPlatforms: [], unknownStatuses: [], dateFixes: [], failures: [],
});

export function mapEntry(e: BlEntry, ig: IgdbGame, images: IgdbDebugImage[], platformNames: Map<number, string>, report: ImportReport): Game {
  const log = e.game_log ?? {};
  const runs = ordered(Object.values(e.playthroughs ?? {}));
  const lead = runs[0];

  // status: is_playing > status > is_backlog > is_wishlist > (anything else) Backlog
  const raw = log.status?.toLowerCase().trim();
  if (raw && !STATUS_MAP[raw]) report.unknownStatuses.push({ name: e.name, status: String(log.status) });
  const status: Status = log.is_playing ? "Playing" : raw && STATUS_MAP[raw] ? STATUS_MAP[raw] : log.is_backlog ? "Backlog" : log.is_wishlist ? "Wishlist" : "Backlog";

  // played platforms (IGDB platform ids -> names), lead playthrough first
  const played: string[] = [];
  for (const p of runs) {
    const pid = p.played_platform ?? p.platform;
    if (typeof pid !== "number") continue;
    const name = platformNames.get(pid);
    if (!name) { report.unknownPlatforms.push({ name: e.name, platformId: pid }); continue; }
    if (!played.includes(name)) played.push(name);
  }

  // dates from the lead playthrough only
  const today = localToday();
  const fix = (note: string) => report.dateFixes.push({ name: e.name, note });
  let startedAt = lead ? startOf(lead) : undefined;
  let finishedAt = lead ? finishOf(lead) : undefined;
  if (startedAt && startedAt > today) { startedAt = today; fix("start date was in the future, set to today"); }
  if (finishedAt && finishedAt > today) { finishedAt = today; fix("finish date was in the future, set to today"); }
  if (startedAt && finishedAt && finishedAt < startedAt) { startedAt = undefined; fix("finish date was before start date, start date dropped"); }

  // time: sum of every playthrough, fallback to Backloggd's own total
  let totalSeconds = runs.reduce((s, p) => s + (p.hours_played ?? 0) * 3600 + (p.mins_played ?? 0) * 60, 0);
  if (!totalSeconds) totalSeconds = (log.total_hours ?? 0) * 3600 + (log.total_minutes ?? 0) * 60;

  const created = runs.map((p) => loose(p.created_at)).filter((x): x is number => x !== undefined).sort((a, b) => a - b)[0]
    ?? (log.last_edited_at ? log.last_edited_at * 1000 : undefined) ?? Date.now();

  return {
    id: crypto.randomUUID(),
    title: ig.name,
    platform: played[0] ?? "",
    playedPlatforms: played,
    emulatedOn: emulatedOn(played, ig.platforms),
    genre: ig.genres.join(", "),
    tags: unique(runs.flatMap((p) => (p.play_dates ?? []).flatMap((d) => d.tags ?? [])).map((t) => t.trim()).filter(Boolean)),
    status,
    notes: runs.map((p) => p.review?.trim()).find(Boolean) ?? "",
    rating: positive(log.rating) ?? (lead ? positive(lead.rating) : undefined),
    platinumed: runs.some((p) => p.is_master),
    favorite: !!log.game_liked,
    cover: ig.cover,
    backgroundCover: ig.background,
    totalSeconds,
    createdAt: new Date(created).toISOString(),
    startedAt,
    finishedAt,
    developer: ig.developer,
    releaseDate: ig.releaseTs ? new Date(ig.releaseTs * 1000).toISOString().slice(0, 10) : undefined,
    description: ig.description,
    genres: ig.genres,
    platforms: ig.platforms,
    igdbId: ig.id,
    igdbRating: ig.rating,
    igdbRatingCount: ig.ratingCount,
    timeAvgSeconds: ig.timeAvg,
    timeMainSeconds: ig.timeMain,
    timeFullSeconds: ig.timeFull,
    igdbImages: images,
    igdbVideos: ig.videos.slice(0, 3).map((v) => ({ id: v.videoId, name: v.name })),
    gameType: ig.gameType,
    gameStatus: ig.gameStatus,
    franchises: ig.franchises,
    themes: ig.themes,
    playerPerspectives: ig.playerPerspectives,
    igdbUpdatedAt: ig.updatedAt,
    backloggdId: String(e.id),
  };
}

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let i = 0; ; i++) {
    try { return await fn(); }
    catch (err) {
      if (i >= tries - 1 || !/429|timed? ?out|error sending|connection/i.test(String(err))) throw err;
      await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
  }
}

export async function importBackloggd(
  entries: BlEntry[], existing: Game[], creds: IgdbCreds,
  onProgress: (p: ImportProgress) => void, signal?: AbortSignal,
): Promise<{ games: Game[]; report: ImportReport }> {
  const report = emptyReport(entries.length);
  const have = new Set(existing.map((g) => g.igdbId).filter((x): x is number => typeof x === "number"));
  const seen = new Set<number>();
  const todo: { id: number; e: BlEntry }[] = [];
  for (const e of entries) {
    const id = Number(e.id);
    if (!Number.isInteger(id) || id <= 0) { report.failures.push({ name: String(e.name ?? e.id), error: "Missing or invalid id" }); continue; }
    if (have.has(id) || seen.has(id)) { report.duplicates.push({ id, name: e.name }); continue; }
    seen.add(id);
    todo.push({ id, e });
  }
  const games: Game[] = [];
  if (!todo.length) return { games, report };

  onProgress({ phase: "platforms", done: 0, total: todo.length });
  const platformNames = await withRetry(() => igdbPlatforms(creds));

  for (let i = 0; i < todo.length; i += CHUNK) {
    if (signal?.aborted) { report.cancelled = true; break; }
    const chunk = todo.slice(i, i + CHUNK);
    onProgress({ phase: "details", done: i, total: todo.length });
    let found = new Map<number, IgdbImport>();
    try {
      const rows = await withRetry(() => igdbImportBatch(chunk.map((c) => c.id), creds));
      found = new Map(rows.map((r) => [r.game.id, r]));
    } catch (err) {
      chunk.forEach(({ e }) => report.failures.push({ name: e.name, error: String(err) }));
      continue;
    }
    for (const { id, e } of chunk) {
      const hit = found.get(id);
      if (!hit) { report.notFound.push({ id, name: e.name }); continue; }
      try {
        if (norm(e.name) !== norm(hit.game.name)) report.nameMismatch.push({ id, backloggd: e.name, igdb: hit.game.name });
        games.push(mapEntry(e, hit.game, hit.images, platformNames, report));
      } catch (err) { report.failures.push({ name: e.name, error: String(err) }); }
    }
  }
  report.imported = games.length;
  onProgress({ phase: "done", done: todo.length, total: todo.length });
  return { games, report };
}

export function reportSections(r: ImportReport): { title: string; items: string[] }[] {
  return [
    { title: "Skipped, already in your library", items: r.duplicates.map((x) => `${x.name} (IGDB ${x.id})`) },
    { title: "Not found on IGDB", items: r.notFound.map((x) => `${x.name} (IGDB ${x.id})`) },
    { title: "Name differs from IGDB (imported anyway)", items: r.nameMismatch.map((x) => `Backloggd: "${x.backloggd}" → IGDB: "${x.igdb}"`) },
    { title: "Unknown platform ids", items: r.unknownPlatforms.map((x) => `${x.name}: platform id ${x.platformId}`) },
    { title: "Unknown statuses (set to Backlog)", items: r.unknownStatuses.map((x) => `${x.name}: "${x.status}"`) },
    { title: "Date fixes", items: r.dateFixes.map((x) => `${x.name}: ${x.note}`) },
    { title: "Failures", items: r.failures.map((x) => `${x.name}: ${x.error}`) },
  ].filter((s) => s.items.length);
}

export function reportToText(r: ImportReport) {
  const head = `Backloggd import: ${r.imported} imported of ${r.total} entries${r.cancelled ? " (cancelled)" : ""}`;
  return [head, ...reportSections(r).map((s) => `\n${s.title} (${s.items.length})\n${s.items.map((i) => `- ${i}`).join("\n")}`)].join("\n");
}