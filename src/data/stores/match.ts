import { igdbSearch, type IgdbCreds, type IgdbHit } from "../igdb";
import { igdbExternalLookup } from "./ipc";
import { IGDB_SOURCE, norm, storeKey, type StoreRecord } from "./types";

export type MatchOrigin = "external" | "strict" | "title" | "none";
export type MatchResult = { igdbId?: number; origin: MatchOrigin; reason?: string };

/** Session cache: once a store id is matched (or rejected) there is no need to ask IGDB again. */
const cache = new Map<string, MatchResult>();
export const cachedMatch = (record: StoreRecord) => cache.get(storeKey(record));
export const clearMatchCache = () => cache.clear();

export function chooseStrict(hits: IgdbHit[], title: string): IgdbHit | undefined {
  const target = norm(title);
  return hits.find((h) => norm(h.name) === target);
}

/** Only accept an unambiguous normalized-title match. Never auto-guess between several hits. */
export function chooseLoose(hits: IgdbHit[], title: string): { hit?: IgdbHit; reason?: string } {
  const target = norm(title);
  const matches = hits.filter((h) => norm(h.name) === target);
  if (matches.length === 1) return { hit: matches[0] };
  if (matches.length > 1) return { reason: "Several IGDB games share this title; link one manually to avoid a guess." };
  return { reason: "No confident IGDB match; imported without online metadata." };
}

/**
 * IGDB matching order: (source, uid) -> strict `/ ` search -> unique normalized title.
 * Ambiguous or missing matches go to the "needs review" list instead of being guessed.
 */
export async function matchRecord(record: StoreRecord, creds: IgdbCreds): Promise<MatchResult> {
  const key = storeKey(record);
  const hit = cache.get(key);
  if (hit) return hit;

  const hasCreds = !!(creds.clientId && creds.clientSecret);
  let result: MatchResult = { origin: "none", reason: hasCreds
    ? "No confident IGDB match; imported without online metadata."
    : "No IGDB credentials; imported without online metadata." };

  if (hasCreds) {
    const source = IGDB_SOURCE[record.store];
    if (source) {
      try {
        const id = await igdbExternalLookup(record.storeId, source, creds);
        if (typeof id === "number" && id > 0) result = { igdbId: id, origin: "external" };
      } catch { /* unofficial source ids may be stale — fall through to title search */ }
    }
    if (!result.igdbId) {
      try {
        const strict = await igdbSearch(`/ ${record.title}`, creds);
        const found = chooseStrict(strict, record.title);
        if (found) result = { igdbId: found.id, origin: "strict" };
      } catch { /* try the loose search below */ }
    }
    if (!result.igdbId) {
      try {
        const loose = await igdbSearch(record.title, creds);
        const choice = chooseLoose(loose, record.title);
        result = choice.hit ? { igdbId: choice.hit.id, origin: "title" } : { origin: "none", reason: choice.reason };
      } catch (error) {
        result = { origin: "none", reason: `IGDB search failed: ${error instanceof Error ? error.message : String(error)}` };
      }
    }
  }

  cache.set(key, result);
  return result;
}
