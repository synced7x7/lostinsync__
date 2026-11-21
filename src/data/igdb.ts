export type IgdbCreds = { clientId: string; clientSecret: string };
export type IgdbHit = { id: number; name: string; releaseTs?: number; developer?: string; cover?: string; gameType?: string };
export type IgdbExternalGame = { source: number; url?: string; name?: string; platform?: number; year?: number };
export type IgdbGame = {
  id: number; name: string; developer?: string; releaseTs?: number; description?: string;
  genres: string[]; platforms: string[]; rating?: number; ratingCount?: number;
  timeAvg?: number; timeMain?: number; timeFull?: number; cover?: string; background?: string;
  videos: { videoId: string; name?: string }[]; screenshots: string[];
  gameType?: string; gameStatus?: string; franchises?: string[];
  themes: string[]; playerPerspectives: string[]; storyline?: string;
  similarGames: { id: number; name: string; cover?: string }[]; updatedAt?: number; createdAt?: number; firstReleaseDate?: number;
};
export type IgdbDebugImage = {
  category: "cover" | "artwork" | "screenshot";
  imageId: string;
  imageType?: string;
  url: string;
  width?: number;
  height?: number;
};
export type IgdbMedia = {
  images: IgdbDebugImage[];
  videos: { id: string; name?: string }[];
};
export type IgdbDiscoverGame = {
  id: number; name: string; cover?: string; releaseTs?: number; rating?: number;
  ratingCount?: number; hypes?: number; follows?: number; summary?: string;
};
export type IgdbDiscover = {
  popular: IgdbDiscoverGame[]; forYou: IgdbDiscoverGame[]; latest: IgdbDiscoverGame[];
  upcoming: IgdbDiscoverGame[]; topRated: IgdbDiscoverGame[]; anticipated: IgdbDiscoverGame[];
  indie: IgdbDiscoverGame[]; story: IgdbDiscoverGame[]; trending: IgdbDiscoverGame[];
};

export type IgdbFeed = keyof IgdbDiscover;

export type TasteProfile = { weights: Record<string, number>; ownedIds: number[]; confidence: number; key: string };

/** Bounded LRU + TTL cache of in-flight/resolved requests. */
const TTL = 20 * 60_000;
type Entry<V> = { v: Promise<V>; t: number };
function memo<V>(map: Map<string, Entry<V>>, key: string, make: () => Promise<V>, max: number): Promise<V> {
  const hit = map.get(key);
  if (hit && Date.now() - hit.t < TTL) {
    map.delete(key);
    map.set(key, hit); // mark as most recently used
    return hit.v;
  }
  const v = make();
  map.delete(key);
  map.set(key, { v, t: Date.now() });
  if (map.size > max) map.delete(map.keys().next().value as string); // evict least recently used
  v.catch(() => { if (map.get(key)?.v === v) map.delete(key); }); // never keep failed requests
  return v;
}

const discoverCache = new Map<string, Entry<IgdbDiscover>>();
const discoverFeedCache = new Map<string, Entry<IgdbDiscoverGame[]>>();
export const hasTauri = "__TAURI_INTERNALS__" in globalThis;

export async function igdbSearch(query: string, c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<IgdbHit[]>("igdb_search", { query, clientId: c.clientId, clientSecret: c.clientSecret });
}
export async function igdbDetails(id: number, c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<IgdbGame>("igdb_details", { id, clientId: c.clientId, clientSecret: c.clientSecret });
}
const detailsCache = new Map<string, Entry<IgdbGame>>();
export const igdbDetailsCached = (id: number, c: IgdbCreds) =>
  memo(detailsCache, `${c.clientId}:${id}`, () => igdbDetails(id, c), 150);
export async function igdbImages(id: number, c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<IgdbDebugImage[]>("igdb_images", { id, clientId: c.clientId, clientSecret: c.clientSecret });
}
const imagesCache = new Map<string, Entry<IgdbDebugImage[]>>();
export const igdbImagesCached = (id: number, c: IgdbCreds) =>
  memo(imagesCache, `${c.clientId}:${id}`, () => igdbImages(id, c), 60);
export async function igdbDiscover(preferredGenres: string[], c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<IgdbDiscover>("igdb_discover", {
    preferredGenres, clientId: c.clientId, clientSecret: c.clientSecret,
  });
}
export const igdbDiscoverCached = (preferredGenres: string[], c: IgdbCreds) =>
  memo(discoverCache, `${c.clientId}:${preferredGenres.join("|")}`, () => igdbDiscover(preferredGenres, c), 10);
export async function igdbDiscoverFeed(feed: IgdbFeed, taste: TasteProfile, offset: number, limit: number, c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<IgdbDiscoverGame[]>("igdb_discover_feed", {
    feed, genreWeights: taste.weights, ownedIds: taste.ownedIds, confidence: taste.confidence,
    offset, limit, clientId: c.clientId, clientSecret: c.clientSecret,
  });
}
// v2 = ranking algorithm version; For You also keys on the taste profile + owned ids
export const igdbDiscoverFeedCached = (feed: IgdbFeed, taste: TasteProfile, offset: number, limit: number, c: IgdbCreds) =>
  memo(discoverFeedCache, `${c.clientId}:${feed}:${feed === "forYou" ? taste.key : ""}:${offset}:${limit}:v2`, () => igdbDiscoverFeed(feed, taste, offset, limit, c), 60);


export type SeriesData = {
  collections: { id: number; name: string; games?: number[] }[];
  relations: [number, number][]; // [parent, child]
  games: { id: number; name: string; releaseTs?: number; cover?: string; gameType?: number }[];
};
export async function igdbSeries(id: number, c: IgdbCreds, types?: number[]) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SeriesData>("igdb_series", { id, clientId: c.clientId, clientSecret: c.clientSecret, types });
}

const seriesCache = new Map<string, Entry<SeriesData>>();
export const igdbSeriesCached = (id: number, c: IgdbCreds, types?: number[]) =>
  memo(seriesCache, `${c.clientId}:${id}:${types?.join(",") ?? ""}`, () => igdbSeries(id, c, types), 40);

export type FranchiseGame = { id: number; name: string; releaseTs?: number; cover?: string; gameType?: number };

export async function igdbFranchise(name: string, gameIds: number[], c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<{ gameIds: number[]; franchises: { id: number; name: string }[] }>("igdb_franchise", {
    name, gameIds, clientId: c.clientId, clientSecret: c.clientSecret,
  });
}

export async function igdbGamesByIds(ids: number[], types: number[] | undefined, c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<FranchiseGame[]>("igdb_games_by_ids", { ids, types, clientId: c.clientId, clientSecret: c.clientSecret });
}


export type IgdbImport = { game: IgdbGame; images: IgdbDebugImage[] };

export async function igdbPlatforms(c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  const rows = await invoke<[number, string][]>("igdb_platforms", { clientId: c.clientId, clientSecret: c.clientSecret });
  return new Map<number, string>(rows);
}
export async function igdbImportBatch(ids: number[], c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<IgdbImport[]>("igdb_import_batch", { ids, clientId: c.clientId, clientSecret: c.clientSecret });
}
/** For the upcoming sync: [id, updated_at] per game. */
export async function igdbSyncCheck(ids: number[], c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<[number, number | null][]>("igdb_sync_check", { ids, clientId: c.clientId, clientSecret: c.clientSecret });
}
/** Opens the OS "Save as" dialog. Resolves to the saved path, or null if cancelled. */
export async function saveTextFile(defaultName: string, contents: string, filterName: string, ext: string) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string | null>("save_text_file", { defaultName, contents, filterName, ext });
}

export async function igdbBundleContents(id: number, c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<IgdbDiscoverGame[]>("igdb_bundle_contents", { id, clientId: c.clientId, clientSecret: c.clientSecret });
}

const bundleCache = new Map<string, Entry<IgdbDiscoverGame[]>>();
export const igdbBundleContentsCached = (id: number, c: IgdbCreds) =>
  memo(bundleCache, `${c.clientId}:${id}`, () => igdbBundleContents(id, c), 40);

/** Exact storefront entries for a game (IGDB external_games), including the real product URL. */
export async function igdbExternalGames(id: number, c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<IgdbExternalGame[]>("igdb_external_games", { gameId: id, clientId: c.clientId, clientSecret: c.clientSecret });
}

const externalCache = new Map<string, Entry<IgdbExternalGame[]>>();
export const igdbExternalGamesCached = (id: number, c: IgdbCreds) =>
  memo(externalCache, `${c.clientId}:${id}`, () => igdbExternalGames(id, c), 60);