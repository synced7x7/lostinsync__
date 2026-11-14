import type { AppData, Game } from "../domain/game";
import { defaultData } from "../domain/game";
const KEY = "lost-in-sync.data";
import { convertFileSrc } from "@tauri-apps/api/core";
const upgradeIgdbCover = (u?: string) =>
  u && u.includes("images.igdb.com") ? u.replace("/t_cover_big/", "/t_cover_big_2x/") : u;

const normalizeStatuses = (data: AppData): AppData => ({
  ...data,
  games: data.games.map((game) => ({
    ...game,
    status: (game.status as string) === "Retired" ? "Completed" : game.status,
    cover: upgradeIgdbCover(game.cover),
  })),
  settings: { ...data.settings, libraryFilter: (data.settings.libraryFilter as string) === "Played" ? "All" : data.settings.libraryFilter },
});
export interface AppRepository { load(): Promise<AppData>; save(data: AppData): Promise<void>; }
export class LocalAppRepository implements AppRepository {
  async load(): Promise<AppData> {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<AppData>;
      const { activities: _activities, journal: _journal, lastOpenedGameId: _lastOpenedGameId, ...savedWithoutLegacyState } = saved as Partial<AppData> & { activities?: unknown; journal?: unknown; lastOpenedGameId?: unknown };
      return normalizeStatuses({ ...defaultData, ...savedWithoutLegacyState, settings: { ...defaultData.settings, ...saved.settings } } as AppData);
    }
    catch { throw new Error("Saved library data could not be read."); }
  }
  async save(data: AppData): Promise<void> {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (error) {
      const reason = error instanceof DOMException && error.name === "QuotaExceededError"
        ? "browser storage is full"
        : error instanceof Error
        ? error.message
        : "an unknown storage error occurred";
      throw new Error(`The library could not be saved because ${reason}. Use the native Tauri app for larger image libraries.`);
    }
  }
}

const PFX = "img:";
let imgDir = "";
type Inv = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

const toUrl = (v?: string) => (v && v.startsWith(PFX) ? convertFileSrc(`${imgDir}/${v.slice(PFX.length)}`) : v);
const hasData = (v?: string) => !!v && v.startsWith("data:image/");

const fileGame = (g: Game, f: (v?: string) => string | undefined): Game => ({
  ...g,
  cover: f(g.cover),
  backgroundCover: f(g.backgroundCover),
  screenshots: g.screenshots?.map((s) => f(s) as string),
} as Game);

const gameHasData = (g: Game) => hasData(g.cover) || hasData(g.backgroundCover) || !!g.screenshots?.some(hasData);

const savedCache = new WeakMap<Game, Game>();
async function externalize(data: AppData, invoke: Inv): Promise<AppData> {
  const marker = convertFileSrc(`${imgDir}/`);
  const one = async (v?: string): Promise<string | undefined> => {
    if (!v) return v;
    if (hasData(v)) return PFX + (await invoke<string>("store_image", { dataUri: v }));
    if (v.startsWith(marker)) return PFX + decodeURIComponent(v.slice(marker.length));
    return v;
  };
  const games: Game[] = [];
  for (const g of data.games) {
    let out = savedCache.get(g);
    if (!out) {
      const [cover, backgroundCover, screenshots] = await Promise.all([
        one(g.cover), one(g.backgroundCover), Promise.all((g.screenshots ?? []).map(one)),
      ]);
      out = { ...g, cover, backgroundCover, screenshots: g.screenshots ? (screenshots as string[]) : g.screenshots } as Game;
      savedCache.set(g, out);
    }
    games.push(out);
  }
  return { ...data, games };
}

export class TauriAppRepository implements AppRepository {
  async load(): Promise<AppData> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      imgDir = await invoke<string>("images_path");
      const loaded = await invoke<AppData | null>("load_app_data");
      if (!loaded) return defaultData;
      const { activities: _a, journal: _j, lastOpenedGameId: _l, ...rest } = loaded as AppData & { activities?: unknown; journal?: unknown; lastOpenedGameId?: unknown };
      let data = normalizeStatuses({
        ...defaultData, ...rest,
        profile: { ...defaultData.profile, ...loaded.profile },
        settings: { ...defaultData.settings, ...loaded.settings },
      });
      if (data.games.some(gameHasData)) {
        // one-time migration: move embedded images to files, then save the small JSON
        try {
          const migrated = await externalize(data, invoke as Inv);
          await invoke("save_app_data", { data: migrated });
          data = migrated;
        } catch { /* keep the original data if migration fails */ }
      }
      return { ...data, games: data.games.map((g) => fileGame(g, toUrl)) };
    } catch {
      return defaultData;
    }
  }
  async save(data: AppData): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    if (!imgDir) imgDir = await invoke<string>("images_path");
    const slim = await externalize(data, invoke as Inv);
    await invoke("save_app_data", { data: slim });
  }
}

export function createAppRepository(): AppRepository {
  return "__TAURI_INTERNALS__" in globalThis ? new TauriAppRepository() : new LocalAppRepository();
}

export type { Game };
