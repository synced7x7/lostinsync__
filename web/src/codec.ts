// Turns the in-memory library (images as data: URIs, exactly like the offline app)
// into a small stored form (images as "img:<hash>" references) and back.
import type { AppData, Game } from "../../src/domain/game";
import { defaultData } from "../../src/domain/game";
import * as db from "./db";

export const REF = "img:";
const isData = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/");
const isRef = (v: unknown): v is string => typeof v === "string" && v.startsWith(REF);

const hashOf = new Map<string, string>(); // data URI -> hash (avoids re-hashing on every save)
const remember = (uri: string, hash: string) => {
  if (hashOf.size > 600) hashOf.clear();
  hashOf.set(uri, hash);
};

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBlob(uri: string): Blob {
  const comma = uri.indexOf(",");
  const head = uri.slice(5, comma);
  const mime = head.split(";")[0] || "application/octet-stream";
  const payload = uri.slice(comma + 1);
  if (!head.includes(";base64")) return new Blob([decodeURIComponent(payload)], { type: mime });
  const bin = atob(payload);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

const readAsDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

async function store(uri: string): Promise<string> {
  let hash = hashOf.get(uri);
  if (!hash) { hash = await sha256(uri); remember(uri, hash); }
  if ((await db.count("images", hash)) === 0) await db.put("images", hash, toBlob(uri));
  return REF + hash;
}

const slimCache = new WeakMap<Game, Game>();

/** data: URIs -> img: references (writes new image blobs). Unchanged games are skipped via a WeakMap. */
export async function externalizeGames(games: Game[]): Promise<Game[]> {
  const out: Game[] = [];
  for (const g of games) {
    let s = slimCache.get(g);
    if (!s) {
      const one = async (v?: string) => (isData(v) ? store(v) : v);
      const [cover, backgroundCover, screenshots] = await Promise.all([
        one(g.cover), one(g.backgroundCover), Promise.all((g.screenshots ?? []).map(one)),
      ]);
      s = { ...g, cover, backgroundCover, screenshots: g.screenshots ? (screenshots as string[]) : g.screenshots } as Game;
      slimCache.set(g, s);
    }
    out.push(s);
  }
  return out;
}

export function refsOf(games: Game[]): Set<string> {
  const out = new Set<string>();
  for (const g of games) {
    for (const v of [g.cover, g.backgroundCover, ...(g.screenshots ?? [])]) if (isRef(v)) out.add(v.slice(REF.length));
  }
  return out;
}

/** img: references -> data: URIs, so the UI, import and export behave exactly like the offline app. */
export async function inflateGames(games: Game[]): Promise<Game[]> {
  const hashes = [...refsOf(games)];
  const uris = new Map<string, string>();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(6, hashes.length) }, async () => {
    while (next < hashes.length) {
      const h = hashes[next++];
      const blob = await db.get<Blob>("images", h);
      if (!blob) continue;
      const uri = await readAsDataUrl(blob);
      uris.set(h, uri);
      remember(uri, h);
    }
  }));
  const fix = (v?: string) => (isRef(v) ? uris.get(v.slice(REF.length)) : v);
  return games.map((g) => {
    const has = [g.cover, g.backgroundCover, ...(g.screenshots ?? [])].some(isRef);
    if (!has) return g;
    return {
      ...g,
      cover: fix(g.cover),
      backgroundCover: fix(g.backgroundCover),
      screenshots: g.screenshots?.map(fix).filter((x): x is string => !!x),
    } as Game;
  });
}

/** Same normalisation the offline repository applies on load. */
export function prepare(raw?: Partial<AppData>): AppData {
  const { activities: _a, journal: _j, lastOpenedGameId: _l, ...rest } =
    (raw ?? {}) as Partial<AppData> & { activities?: unknown; journal?: unknown; lastOpenedGameId?: unknown };
  const merged = {
    ...defaultData,
    ...rest,
    profile: { ...defaultData.profile, ...rest.profile },
    settings: { ...defaultData.settings, ...rest.settings },
  } as AppData;
  return {
    ...merged,
    games: merged.games.map((g) => ((g.status as string) === "Retired" ? { ...g, status: "Completed" } : g)),
    settings: {
      ...merged.settings,
      libraryFilter: (merged.settings.libraryFilter as string) === "Played" ? "All" : merged.settings.libraryFilter,
    },
  } as AppData;
}
