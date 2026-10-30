import type { AppData, Game } from "../domain/game";
import { defaultData } from "../domain/game";
const KEY = "lost-in-sync.data";
export interface AppRepository { load(): Promise<AppData>; save(data: AppData): Promise<void>; }
export class LocalAppRepository implements AppRepository {
  async load(): Promise<AppData> {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<AppData>;
      return { ...defaultData, ...saved, settings: { ...defaultData.settings, ...saved.settings } } as AppData;
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
export class TauriAppRepository implements AppRepository {
  async load(): Promise<AppData> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const loaded = await invoke<AppData | null>("load_app_data");
      if (!loaded) return defaultData;
      return {
        ...defaultData,
        ...loaded,
        profile: { ...defaultData.profile, ...loaded.profile },
        settings: { ...defaultData.settings, ...loaded.settings },
      };
    } catch {
      return defaultData;
    }
  }
  async save(data: AppData): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_app_data", { data });
  }
}
export function createAppRepository(): AppRepository {
  return "__TAURI_INTERNALS__" in globalThis ? new TauriAppRepository() : new LocalAppRepository();
}
export type { Game };
