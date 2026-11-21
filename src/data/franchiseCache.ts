import { hasTauri } from "./igdb";
import type { SeriesGame } from "../domain/franchise";

export type CachedFranchise = { key: string; sig: string; fetchedAt: number; games: SeriesGame[] };

export async function loadFranchiseCache(keys: string[]): Promise<CachedFranchise[]> {
  if (!hasTauri || !keys.length) return [];
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<CachedFranchise[]>("franchise_cache_load", { keys });
  } catch { return []; }
}

export async function saveFranchiseCache(key: string, sig: string, games: SeriesGame[]) {
  if (!hasTauri) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("franchise_cache_save", { key, sig, games });
  } catch { /* cache is best-effort */ }
}
