import type { AppData, Game } from "../domain/game";
import { defaultData } from "../domain/game";
const KEY = "lost-in-sync.data";
export interface AppRepository { load(): Promise<AppData>; save(data: AppData): Promise<void>; }
export class LocalAppRepository implements AppRepository {
  async load(): Promise<AppData> {
    try { return { ...defaultData, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") } as AppData; }
    catch { throw new Error("Saved library data could not be read."); }
  }
  async save(data: AppData): Promise<void> {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { throw new Error("The library could not be saved."); }
  }
}
export class TauriAppRepository implements AppRepository {
  async load(): Promise<AppData> { const { invoke } = await import("@tauri-apps/api/core"); return (await invoke<AppData | null>("load_app_data")) ?? defaultData; }
  async save(data: AppData): Promise<void> { const { invoke } = await import("@tauri-apps/api/core"); await invoke("save_app_data", { data }); }
}
export function createAppRepository(): AppRepository {
  return "__TAURI_INTERNALS__" in globalThis ? new TauriAppRepository() : new LocalAppRepository();
}
export type { Game };
