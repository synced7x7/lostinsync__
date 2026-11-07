import type { Game } from "../domain/game";
import { emulatedOn } from "./platform";
import { withRetry } from "./backloggd";
import { igdbImportBatch, igdbSyncCheck, type IgdbCreds, type IgdbDebugImage, type IgdbGame, type IgdbImport } from "./igdb";

export type SyncProgress = { phase: "checking" | "updating" | "done"; done: number; total: number };
export type SyncReport = {
  checked: number; cancelled: boolean;
  upToDate: number;                                      // same IGDB updated_at: skipped
  updated: { name: string; changes: string[] }[];        // IGDB changed and our fields were refreshed
  refreshed: { name: string }[];                         // IGDB stamp changed, but none of our fields differ
  notLinked: { name: string }[];                         // no IGDB id
  notOnIgdb: { name: string; id: number }[];             // id not returned by IGDB (kept)
  titleDiffers: { name: string; igdb: string }[];        // kept as you have it
  failures: { name: string; error: string }[];
};

const CHUNK = 100;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const same = (a: unknown, b: unknown) => {
  if (Array.isArray(a) && Array.isArray(b) && [...a, ...b].every((x) => typeof x === "string"))
    return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
};

// IGDB-sourced fields that sync is allowed to refresh. Nothing else on a game is ever touched.
const FIELDS: { key: keyof Game; label: string; pick: (ig: IgdbGame) => unknown }[] = [
  { key: "developer", label: "developer", pick: (g) => g.developer },
  { key: "releaseDate", label: "release date", pick: (g) => (g.releaseTs ? new Date(g.releaseTs * 1000).toISOString().slice(0, 10) : undefined) },
  { key: "description", label: "description", pick: (g) => g.description },
  { key: "genres", label: "genres", pick: (g) => g.genres },
  { key: "platforms", label: "release platforms", pick: (g) => g.platforms },
  { key: "franchises", label: "franchises", pick: (g) => g.franchises },
  { key: "themes", label: "themes", pick: (g) => g.themes },
  { key: "playerPerspectives", label: "perspectives", pick: (g) => g.playerPerspectives },
  { key: "gameType", label: "game type", pick: (g) => g.gameType },
  { key: "gameStatus", label: "game status", pick: (g) => g.gameStatus },
  { key: "igdbRating", label: "IGDB rating", pick: (g) => g.rating },
  { key: "igdbRatingCount", label: "IGDB rating count", pick: (g) => g.ratingCount },
  { key: "timeAvgSeconds", label: "time to beat (average)", pick: (g) => g.timeAvg },
  { key: "timeMainSeconds", label: "time to beat (main)", pick: (g) => g.timeMain },
  { key: "timeFullSeconds", label: "time to beat (100%)", pick: (g) => g.timeFull },
  { key: "igdbVideos", label: "trailers", pick: (g) => g.videos.slice(0, 3).map((v) => ({ id: v.videoId, name: v.name })) },
  { key: "cover", label: "cover", pick: (g) => g.cover },
  { key: "backgroundCover", label: "background", pick: (g) => g.background },
];

export function buildPatch(g: Game, ig: IgdbGame, images: IgdbDebugImage[]): { patch: Partial<Game>; changes: string[] } {
  const patch: Record<string, unknown> = {};
  const changes: string[] = [];
  const old = g as unknown as Record<string, unknown>;
  for (const f of FIELDS) {
    if ((f.key === "cover" || f.key === "backgroundCover") && String(old[f.key] ?? "").startsWith("data:")) continue; // your own uploaded image
    const next = f.pick(ig);
    if (isEmpty(next)) continue; // never blank out a field because IGDB has nothing
    if (!same(old[f.key], next)) { patch[f.key] = next; changes.push(f.label); }
  }
  // the free-text genre line follows IGDB only if you never edited it
  if (patch.genres && (!g.genre || g.genre === (g.genres ?? []).join(", "))) patch.genre = (patch.genres as string[]).join(", ");
  if (images.length) {
    const a = new Set((g.igdbImages ?? []).map((i) => i.imageId)), b = new Set(images.map((i) => i.imageId));
    const added = [...b].filter((x) => !a.has(x)).length, removed = [...a].filter((x) => !b.has(x)).length;
    if (added || removed) { patch.igdbImages = images; changes.push(`images (+${added} / −${removed})`); }
  }
  if (ig.updatedAt !== undefined) patch.igdbUpdatedAt = ig.updatedAt;
  return { patch: patch as Partial<Game>, changes };
}

export function applyPatches(games: Game[], patches: Map<string, Partial<Game>>): Game[] {
  return games.map((g) => {
    const p = patches.get(g.id);
    if (!p) return g;
    const m = { ...g, ...p };
    if (p.platforms) m.emulatedOn = emulatedOn(m.playedPlatforms ?? [], m.platforms ?? []);
    return m;
  });
}

export async function syncWithIgdb(
  games: Game[], creds: IgdbCreds, onProgress: (p: SyncProgress) => void, signal?: AbortSignal,
): Promise<{ patches: Map<string, Partial<Game>>; report: SyncReport }> {
  const report: SyncReport = { checked: 0, cancelled: false, upToDate: 0, updated: [], refreshed: [], notLinked: [], notOnIgdb: [], titleDiffers: [], failures: [] };
  const patches = new Map<string, Partial<Game>>();

  const byId = new Map<number, Game[]>();
  for (const g of games) {
    if (typeof g.igdbId !== "number") { report.notLinked.push({ name: g.title }); continue; }
    (byId.get(g.igdbId) ?? byId.set(g.igdbId, []).get(g.igdbId)!).push(g);
    report.checked++;
  }
  const ids = [...byId.keys()];
  if (!ids.length) return { patches, report };

  // 1) one cheap call: IGDB id + updated_at for every linked game
  onProgress({ phase: "checking", done: 0, total: ids.length });
  const remote = new Map<number, number | null>(await withRetry(() => igdbSyncCheck(ids, creds)));

  // 2) compare with the stamp stored on each game
  const stale = new Map<number, Game[]>();
  for (const [id, list] of byId) {
    if (!remote.has(id)) { list.forEach((g) => report.notOnIgdb.push({ name: g.title, id })); continue; }
    const r = remote.get(id) ?? undefined;
    const changed = list.filter((g) => g.igdbUpdatedAt !== r); // games never synced before have no stamp, so they refresh once
    report.upToDate += list.length - changed.length;
    if (changed.length) stale.set(id, changed);
  }

  // 3) refetch only what changed, 100 ids per batch
  const staleIds = [...stale.keys()];
  for (let i = 0; i < staleIds.length; i += CHUNK) {
    if (signal?.aborted) { report.cancelled = true; break; }
    const chunk = staleIds.slice(i, i + CHUNK);
    onProgress({ phase: "updating", done: i, total: staleIds.length });
    let found: Map<number, IgdbImport>;
    try {
      const rows = await withRetry(() => igdbImportBatch(chunk, creds));
      found = new Map(rows.map((r) => [r.game.id, r]));
    } catch (err) {
      chunk.forEach((id) => stale.get(id)!.forEach((g) => report.failures.push({ name: g.title, error: String(err) })));
      continue;
    }
    for (const id of chunk) {
      for (const g of stale.get(id)!) {
        const hit = found.get(id);
        if (!hit) { report.failures.push({ name: g.title, error: "IGDB returned no details for this id" }); continue; }
        try {
          const { patch, changes } = buildPatch(g, hit.game, hit.images);
          patches.set(g.id, patch);
          if (changes.length) report.updated.push({ name: g.title, changes });
          else report.refreshed.push({ name: g.title });
          if (norm(g.title) !== norm(hit.game.name)) report.titleDiffers.push({ name: g.title, igdb: hit.game.name });
        } catch (err) { report.failures.push({ name: g.title, error: String(err) }); }
      }
    }
  }
  onProgress({ phase: "done", done: staleIds.length, total: staleIds.length });
  return { patches, report };
}

export function syncReportSections(r: SyncReport): { title: string; items: string[] }[] {
  return [
    { title: "Updated from IGDB", items: r.updated.map((x) => `${x.name}: ${x.changes.join(", ")}`) },
    { title: "Refreshed, no visible changes", items: r.refreshed.map((x) => x.name) },
    { title: "Not found on IGDB (kept in your library)", items: r.notOnIgdb.map((x) => `${x.name} (IGDB ${x.id})`) },
    { title: "Not linked to IGDB (skipped)", items: r.notLinked.map((x) => x.name) },
    { title: "Title differs from IGDB (kept as you have it)", items: r.titleDiffers.map((x) => `${x.name} → IGDB: "${x.igdb}"`) },
    { title: "Failures", items: r.failures.map((x) => `${x.name}: ${x.error}`) },
  ].filter((s) => s.items.length);
}

export function syncReportToText(r: SyncReport) {
  const head = `IGDB sync${r.cancelled ? " (cancelled)" : ""}: ${r.checked} linked games checked, ${r.updated.length} updated, ${r.refreshed.length} refreshed with no visible changes, ${r.upToDate} up to date (skipped), ${r.notLinked.length} not linked.`;
  return [head, ...syncReportSections(r).map((s) => `\n${s.title} (${s.items.length})\n${s.items.map((i) => `- ${i}`).join("\n")}`)].join("\n");
}