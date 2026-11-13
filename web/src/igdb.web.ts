// Web replacement for src/data/igdb.ts. Same exports, but instead of Tauri commands it talks to the
// IGDB proxy (web/worker). The query building / parsing below is a port of the Rust commands in lib.rs.
import type {
  IgdbCreds, IgdbDebugImage, IgdbDiscover, IgdbDiscoverGame, IgdbFeed, IgdbGame, IgdbHit, IgdbImport, IgdbMedia, SeriesData,
} from "../../src/data/igdb";
export type { IgdbCreds, IgdbDebugImage, IgdbDiscover, IgdbDiscoverGame, IgdbFeed, IgdbGame, IgdbHit, IgdbImport, IgdbMedia, SeriesData };

/** The offline UI enables import/sync/save-dialog features when this is true. The web build supports all of them. */
export const hasTauri = true;

const PROXY = ((import.meta.env.VITE_IGDB_PROXY_URL as string | undefined) ?? "").replace(/\/+$/, "");

/* eslint-disable @typescript-eslint/no-explicit-any */
type J = any;

/* ───────── transport ───────── */
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let nextSlot = 0;
async function slot() { // IGDB allows ~4 requests/second per key: space requests out
  const now = Date.now();
  const at = Math.max(now, nextSlot);
  nextSlot = at + 260;
  if (at > now) await wait(at - now);
}

async function post(endpoint: string, body: string, c: IgdbCreds, retry = true): Promise<J> {
  if (!PROXY) throw new Error("The IGDB proxy is not configured (VITE_IGDB_PROXY_URL).");
  if (!c.clientId || !c.clientSecret) throw new Error("Add your IGDB Client ID and Secret in Settings.");
  await slot();
  let res: Response;
  try {
    res = await fetch(`${PROXY}/igdb/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain", "X-Client-Id": c.clientId, "X-Client-Secret": c.clientSecret },
      body,
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new Error("Could not reach the IGDB proxy. Check your connection.");
  }
  if (res.status === 429 && retry) { await wait(1200); return post(endpoint, body, c, false); }
  if (!res.ok) {
    let msg = "";
    try { msg = ((await res.json()) as { error?: string }).error ?? ""; } catch { /* not json */ }
    throw new Error(msg || `IGDB error ${res.status}`);
  }
  return res.json();
}

/* ───────── helpers (ported from lib.rs) ───────── */
const img = (id: string, size: string) => `https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg`;
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const idlist = (v: number[]) => v.join(",");
const nowSecs = () => Math.floor(Date.now() / 1000);

const developerOf = (g: J): string | undefined => {
  const list: J[] | undefined = Array.isArray(g?.involved_companies) ? g.involved_companies : undefined;
  if (!list?.length) return undefined;
  return (list.find((c) => c?.developer === true) ?? list[0])?.company?.name ?? undefined;
};
const names = (v: J): string[] => (Array.isArray(v) ? v.map((x) => x?.name).filter((n): n is string => typeof n === "string") : []);
const firstImageId = (v: J): string | undefined => (Array.isArray(v) ? v.find((a) => typeof a?.image_id === "string")?.image_id : undefined);
const imageTypeName = (t: J, types: J): string | undefined => {
  if (t && typeof t === "object" && typeof t.name === "string") return t.name;
  if (typeof t !== "number" || !Array.isArray(types)) return undefined;
  return types.find((x) => x?.id === t)?.name;
};
const PRIORITY = ["key art without logo", "key art with logo", "historical artwork", "concept art", "artwork"];
const preferredArtworkId = (artworks: J, types: J): string | undefined => {
  if (!Array.isArray(artworks)) return undefined;
  for (const p of PRIORITY) {
    const hit = artworks.find((a) => typeof a?.image_id === "string" && imageTypeName(a.image_type, types)?.toLowerCase() === p);
    if (hit) return hit.image_id;
  }
  return undefined;
};
const videosOf = (g: J) =>
  (Array.isArray(g?.videos) ? g.videos : []).flatMap((v: J) => (typeof v?.video_id === "string" ? [{ videoId: v.video_id as string, name: typeof v.name === "string" ? v.name as string : undefined }] : []));
const discoverItem = (g: J): IgdbDiscoverGame => ({
  id: g.id, name: g.name, cover: g.cover?.image_id ? img(g.cover.image_id, "cover_big") : undefined,
  releaseTs: g.first_release_date, rating: g.total_rating, ratingCount: g.total_rating_count,
  hypes: g.hypes, follows: g.follows, summary: g.summary,
});
const rows = (v: J): J[] => (Array.isArray(v) ? v : []);

/* ───────── commands ───────── */
export async function igdbSearch(query: string, c: IgdbCreds): Promise<IgdbHit[]> {
  const idMatch = query.startsWith("& ") ? query.slice(2).trim() : "";
  const idQuery = /^\d+$/.test(idMatch) && Number(idMatch) > 0 ? Number(idMatch) : undefined;
  const strictRaw = query.startsWith("/ ") ? query.slice(2).trim() : "";
  const strict = strictRaw || undefined;
  const q = esc(strict ?? query.trim());
  const fields = "name,first_release_date,game_type.type,cover.image_id,involved_companies.developer,involved_companies.company.name";
  const body = idQuery !== undefined
    ? `fields ${fields}; where id = ${idQuery}; limit 1;`
    : strict
      ? `fields ${fields}; where version_parent = null & name = "${q}"; limit 50;`
      : `search "${q}"; fields ${fields}; where version_parent = null; limit 8;`;
  const data = rows(await post("games", body, c));
  return data
    .filter((g) => (idQuery !== undefined ? Number.isInteger(g.id) : strict ? g.name === strict : true))
    .map((g) => ({
      id: g.id ?? 0, name: g.name ?? "", releaseTs: g.first_release_date, developer: developerOf(g),
      cover: g.cover?.image_id ? img(g.cover.image_id, "cover_small") : undefined, gameType: g.game_type?.type,
    }));
}

export async function igdbDetails(id: number, c: IgdbCreds): Promise<IgdbGame> {
  const games = rows(await post("games", `fields name,updated_at,summary,storyline,first_release_date,game_type.type,game_status.status,franchises.name,genres.name,themes.name,player_perspectives.name,platforms.name,total_rating,total_rating_count,cover.image_id,screenshots.image_id,videos.video_id,videos.name,similar_games.name,similar_games.cover.image_id,involved_companies.developer,involved_companies.company.name; where id = ${id};`, c));
  const g = games[0];
  if (!g) throw new Error("Game not found on IGDB.");
  const [ttb, types, artworks] = await Promise.all([
    post("game_time_to_beats", `fields hastily,normally,completely; where game_id = ${id};`, c).catch(() => null),
    post("image_types", "fields id,name; limit 100;", c),
    post("artworks", `fields image_id,image_type; where game = ${id}; limit 100;`, c),
  ]);
  const t = rows(ttb)[0] ?? {};
  const backgroundId = preferredArtworkId(artworks, types) ?? firstImageId(artworks) ?? g.screenshots?.[0]?.image_id;
  return {
    id, name: g.name ?? "", developer: developerOf(g), releaseTs: g.first_release_date, description: g.summary,
    genres: names(g.genres), platforms: names(g.platforms),
    rating: typeof g.total_rating === "number" ? Math.round(g.total_rating) : undefined, ratingCount: g.total_rating_count,
    timeAvg: t.normally, timeMain: t.hastily, timeFull: t.completely,
    cover: g.cover?.image_id ? img(g.cover.image_id, "cover_big") : undefined,
    background: backgroundId ? img(backgroundId, "1080p") : undefined,
    videos: videosOf(g),
    screenshots: rows(g.screenshots).flatMap((s) => (typeof s?.image_id === "string" ? [img(s.image_id, "screenshot_big")] : [])),
    gameType: g.game_type?.type, gameStatus: g.game_status?.status, franchises: names(g.franchises),
    themes: names(g.themes), playerPerspectives: names(g.player_perspectives), storyline: g.storyline,
    similarGames: rows(g.similar_games).map((x) => ({ id: x.id, name: x.name, cover: x.cover?.image_id ? img(x.cover.image_id, "cover_big") : undefined })),
    updatedAt: g.updated_at,
  };
}

export async function igdbImages(id: number, c: IgdbCreds): Promise<IgdbDebugImage[]> {
  const types = await post("image_types", "fields id,name; limit 100;", c);
  const out: IgdbDebugImage[] = [];
  for (const [endpoint, category, fields] of [
    ["covers", "cover", "image_id,image_type,width,height"],
    ["artworks", "artwork", "image_id,image_type,width,height"],
    ["screenshots", "screenshot", "image_id,width,height"],
  ] as const) {
    for (const im of rows(await post(endpoint, `fields ${fields}; where game = ${id}; limit 100;`, c))) {
      if (typeof im.image_id !== "string") continue;
      out.push({ category, imageId: im.image_id, imageType: imageTypeName(im.image_type, types), url: img(im.image_id, category === "cover" ? "cover_big" : "1080p"), width: im.width, height: im.height });
    }
  }
  return out;
}

const DISCOVER_FIELDS = "name,summary,first_release_date,rating,rating_count,total_rating,total_rating_count,hypes,follows,cover.image_id";
const FEED_FIELDS = "name,summary,first_release_date,total_rating,total_rating_count,hypes,follows,cover.image_id";
const genreFilter = (preferred: string[]) =>
  preferred.slice(0, 3).map((g) => g.trim()).filter(Boolean).map((g) => `genres.name = "${esc(g)}"`).join(" | ");
const dq = (fields: string, where: string, sort: string) => `fields ${fields}; where ${where}; sort ${sort}; limit 20;`;

async function trendingGames(fields: string, offset: number, limit: number, c: IgdbCreds): Promise<J[]> {
  const pop = rows(await post("popularity_primitives", `fields game_id,value; where popularity_type = 1; sort value desc; limit ${limit}; offset ${offset};`, c));
  const ids: number[] = pop.map((p) => p.game_id).filter((x) => Number.isInteger(x));
  if (!ids.length) return [];
  const games = rows(await post("games", `fields ${fields}; where id = (${idlist(ids)}); limit ${ids.length};`, c));
  return ids.flatMap((id) => games.filter((g) => g.id === id).slice(0, 1)); // restore popularity order
}

export async function igdbDiscover(preferredGenres: string[], c: IgdbCreds): Promise<IgdbDiscover> {
  const now = nowSecs();
  const gf = genreFilter(preferredGenres);
  const forYou = gf ? `(${gf}) & rating != null` : "rating != null & rating_count > 25";
  const f = DISCOVER_FIELDS;
  const queries: [keyof IgdbDiscover, string][] = [
    ["popular", dq(f, "total_rating_count != null", "total_rating_count desc")],
    ["forYou", dq(f, forYou, "total_rating desc")],
    ["latest", dq(f, `first_release_date <= ${now}`, "first_release_date desc")],
    ["upcoming", dq(f, `first_release_date > ${now}`, "first_release_date asc")],
    ["topRated", dq(f, "total_rating != null & total_rating_count > 1500", "total_rating desc")],
    ["anticipated", dq(f, `first_release_date > ${now} & hypes != null`, "hypes desc")],
    ["hiddenGems", dq(f, "total_rating != null & total_rating_count > 10 & total_rating_count < 500", "total_rating desc")],
    ["indie", dq(f, "involved_companies.company != null & genres != null", "total_rating desc")],
    ["story", dq(f, "storyline != null & themes != null", "total_rating desc")],
  ];
  const result: Partial<IgdbDiscover> = {};
  const lists = await Promise.all(queries.map(([, body]) => post("games", body, c)));
  queries.forEach(([name], i) => { result[name] = rows(lists[i]).map(discoverItem); });
  result.trending = (await trendingGames(f, 0, 20, c)).map(discoverItem);
  return result as IgdbDiscover;
}

export async function igdbDiscoverFeed(feed: IgdbFeed, preferredGenres: string[], offset: number, limit: number, c: IgdbCreds): Promise<IgdbDiscoverGame[]> {
  const now = nowSecs();
  const gf = genreFilter(preferredGenres);
  const safeOffset = Math.min(90, Math.max(0, offset));
  const safeLimit = Math.min(30, Math.max(1, limit));
  if (feed === "trending") return (await trendingGames(FEED_FIELDS, safeOffset, safeLimit, c)).map(discoverItem);
  const table: Record<string, [string, string]> = {
    popular: ["total_rating_count != null", "total_rating_count desc"],
    forYou: [gf ? `(${gf}) & total_rating != null` : "total_rating != null", "total_rating desc"],
    latest: [`first_release_date <= ${now}`, "first_release_date desc"],
    upcoming: [`first_release_date > ${now}`, "first_release_date asc"],
    topRated: ["total_rating != null & total_rating_count > 1500", "total_rating desc"],
    anticipated: [`first_release_date > ${now} & hypes != null`, "hypes desc"],
    hiddenGems: ["total_rating != null & total_rating_count > 10 & total_rating_count < 500 & game_type = 0", "total_rating desc"],
    indie: ["involved_companies.company != null & genres != null & game_type = 0", "total_rating desc"],
    story: ["storyline != null & themes != null & game_type = 0", "total_rating desc"],
  };
  const entry = table[feed];
  if (!entry) throw new Error("Unknown discovery feed.");
  const data = await post("games", `fields ${FEED_FIELDS}; where ${entry[0]}; sort ${entry[1]}; limit ${safeLimit}; offset ${safeOffset};`, c);
  return rows(data).map(discoverItem);
}

export async function igdbSeries(id: number, c: IgdbCreds): Promise<SeriesData> {
  const g = rows(await post("games", `fields collections; where id = ${id};`, c));
  const start: number[] = rows(g[0]?.collections).filter((x) => Number.isInteger(x));
  if (!start.length) return { collections: [], relations: [], games: [] };

  const relations: [number, number][] = [];
  const seen = new Set<string>();
  const addRel = (p: number, ch: number) => { const k = `${p}:${ch}`; if (!seen.has(k)) { seen.add(k); relations.push([p, ch]); } };
  const known = new Set<number>(start);

  let frontier = [...start]; // 1) climb to the top-level series
  for (let i = 0; i < 4 && frontier.length; i++) {
    const rel = rows(await post("collection_relations", `fields parent_collection,child_collection; where child_collection = (${idlist(frontier)}); limit 100;`, c));
    frontier = [];
    for (const r of rel) {
      if (!Number.isInteger(r.parent_collection) || !Number.isInteger(r.child_collection)) continue;
      addRel(r.parent_collection, r.child_collection);
      if (!known.has(r.parent_collection)) { known.add(r.parent_collection); frontier.push(r.parent_collection); }
    }
  }
  frontier = [...known]; // 2) walk back down through every sub-series
  for (let i = 0; i < 4 && frontier.length; i++) {
    const rel = rows(await post("collection_relations", `fields parent_collection,child_collection; where parent_collection = (${idlist(frontier)}); limit 100;`, c));
    frontier = [];
    for (const r of rel) {
      if (!Number.isInteger(r.parent_collection) || !Number.isInteger(r.child_collection)) continue;
      addRel(r.parent_collection, r.child_collection);
      if (!known.has(r.child_collection)) { known.add(r.child_collection); frontier.push(r.child_collection); }
    }
  }
  const cols = rows(await post("collections", `fields name,games; where id = (${idlist([...known])}); limit 100;`, c));
  const gids: number[] = [];
  for (const col of cols) for (const x of rows(col.games)) if (Number.isInteger(x) && !gids.includes(x)) gids.push(x);
  const games: SeriesData["games"] = [];
  for (let i = 0; i < gids.length; i += 500) {
    const chunk = gids.slice(i, i + 500);
    for (const r of rows(await post("games", `fields name,first_release_date,cover.image_id; where id = (${idlist(chunk)}); limit 500;`, c))) {
      games.push({ id: r.id, name: r.name, releaseTs: r.first_release_date, cover: r.cover?.image_id ? img(r.cover.image_id, "cover_big") : undefined });
    }
  }
  return { collections: cols, relations, games };
}

export async function igdbPlatforms(c: IgdbCreds): Promise<Map<number, string>> {
  const out: [number, string][] = [];
  for (let offset = 0; ; offset += 500) {
    const list = rows(await post("platforms", `fields id,name; limit 500; offset ${offset};`, c));
    for (const p of list) if (Number.isInteger(p.id) && typeof p.name === "string") out.push([p.id, p.name]);
    if (list.length < 500) break;
  }
  return new Map(out);
}

export async function igdbSyncCheck(ids: number[], c: IgdbCreds): Promise<[number, number | null][]> {
  const out: [number, number | null][] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const data = await post("games", `fields id,updated_at; where id = (${idlist(ids.slice(i, i + 500))}); limit 500;`, c);
    for (const r of rows(data)) if (Number.isInteger(r.id)) out.push([r.id, r.updated_at ?? null]);
  }
  return out;
}

export async function igdbImportBatch(ids: number[], c: IgdbCreds): Promise<IgdbImport[]> {
  if (!ids.length) return [];
  const list = idlist(ids);
  const n = ids.length;
  const data = rows(await post("games", `fields name,summary,first_release_date,updated_at,game_type.type,game_status.status,franchises.name,genres.name,themes.name,player_perspectives.name,platforms.name,total_rating,total_rating_count,cover.image_id,cover.image_type,cover.width,cover.height,screenshots.image_id,screenshots.width,screenshots.height,videos.video_id,videos.name,artworks.image_id,artworks.image_type,artworks.width,artworks.height,involved_companies.developer,involved_companies.company.name; where id = (${list}); limit ${n};`, c));
  const ttb = rows(await post("game_time_to_beats", `fields game_id,hastily,normally,completely; where game_id = (${list}); limit ${n};`, c).catch(() => null));
  const types = await post("image_types", "fields id,name; limit 100;", c);
  const out: IgdbImport[] = [];
  for (const g of data) {
    if (!Number.isInteger(g.id)) continue;
    const t = ttb.find((x) => x.game_id === g.id) ?? {};
    const backgroundId = preferredArtworkId(g.artworks, types) ?? firstImageId(g.artworks) ?? g.screenshots?.[0]?.image_id;
    const images: IgdbDebugImage[] = [];
    const push = (category: IgdbDebugImage["category"], v: J) => {
      if (typeof v?.image_id !== "string") return;
      images.push({ category, imageId: v.image_id, imageType: imageTypeName(v.image_type, types), url: img(v.image_id, category === "cover" ? "cover_big" : "1080p"), width: v.width, height: v.height });
    };
    push("cover", g.cover);
    rows(g.artworks).slice(0, 100).forEach((a) => push("artwork", a));
    rows(g.screenshots).slice(0, 100).forEach((s) => push("screenshot", s));
    out.push({
      game: {
        id: g.id, name: g.name ?? "", developer: developerOf(g), releaseTs: g.first_release_date, description: g.summary,
        genres: names(g.genres), platforms: names(g.platforms),
        rating: typeof g.total_rating === "number" ? Math.round(g.total_rating) : undefined, ratingCount: g.total_rating_count,
        timeAvg: t.normally, timeMain: t.hastily, timeFull: t.completely,
        cover: g.cover?.image_id ? img(g.cover.image_id, "cover_big") : undefined,
        background: backgroundId ? img(backgroundId, "1080p") : undefined,
        videos: videosOf(g), screenshots: [], gameType: g.game_type?.type, gameStatus: g.game_status?.status,
        franchises: names(g.franchises), themes: names(g.themes), playerPerspectives: names(g.player_perspectives),
        storyline: undefined, similarGames: [], updatedAt: g.updated_at,
      },
      images,
    });
  }
  return out;
}

export async function igdbBundleContents(id: number, c: IgdbCreds): Promise<IgdbDiscoverGame[]> {
  const data = await post("games", `fields name,summary,first_release_date,total_rating,total_rating_count,cover.image_id; where bundles = [${id}]; sort first_release_date asc; limit 50;`, c);
  return rows(data).map(discoverItem);
}

/** Browser "Save as": uses the native picker where available (Chrome/Edge), otherwise a normal download. */
export async function saveTextFile(defaultName: string, contents: string, filterName: string, ext: string): Promise<string | null> {
  const mime = ext === "json" ? "application/json" : ext === "csv" ? "text/csv" : "text/plain";
  const url = URL.createObjectURL(new Blob([contents], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = defaultName;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "your browser's downloads folder";
}

/* ───────── bounded caches (LRU + 20 min TTL) ───────── */
const TTL = 20 * 60_000;
type Entry<V> = { v: Promise<V>; t: number };
function memo<V>(map: Map<string, Entry<V>>, key: string, make: () => Promise<V>, max: number): Promise<V> {
  const hit = map.get(key);
  if (hit && Date.now() - hit.t < TTL) { map.delete(key); map.set(key, hit); return hit.v; }
  const v = make();
  map.delete(key);
  map.set(key, { v, t: Date.now() });
  if (map.size > max) map.delete(map.keys().next().value as string);
  v.catch(() => { if (map.get(key)?.v === v) map.delete(key); });
  return v;
}
const detailsCache = new Map<string, Entry<IgdbGame>>();
const imagesCache = new Map<string, Entry<IgdbDebugImage[]>>();
const discoverCache = new Map<string, Entry<IgdbDiscover>>();
const feedCache = new Map<string, Entry<IgdbDiscoverGame[]>>();
const bundleCache = new Map<string, Entry<IgdbDiscoverGame[]>>();
// keys use a hash-free prefix of the client id only; the secret is never part of a cache key
export const igdbDetailsCached = (id: number, c: IgdbCreds) => memo(detailsCache, `${c.clientId}:${id}`, () => igdbDetails(id, c), 150);
export const igdbImagesCached = (id: number, c: IgdbCreds) => memo(imagesCache, `${c.clientId}:${id}`, () => igdbImages(id, c), 60);
export const igdbDiscoverCached = (g: string[], c: IgdbCreds) => memo(discoverCache, `${c.clientId}:${g.join("|")}`, () => igdbDiscover(g, c), 10);
export const igdbDiscoverFeedCached = (feed: IgdbFeed, g: string[], offset: number, limit: number, c: IgdbCreds) =>
  memo(feedCache, `${c.clientId}:${feed}:${g.join("|")}:${offset}:${limit}`, () => igdbDiscoverFeed(feed, g, offset, limit, c), 60);
export const igdbBundleContentsCached = (id: number, c: IgdbCreds) => memo(bundleCache, `${c.clientId}:${id}`, () => igdbBundleContents(id, c), 40);
