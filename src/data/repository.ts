import type { Game } from "../domain/game";
const KEY = "lost-in-sync.games";
export interface GameRepository { list(): Promise<Game[]>; save(game: Game): Promise<void>; }
export class LocalGameRepository implements GameRepository {
  async list(): Promise<Game[]> {
    try { return JSON.parse(localStorage.getItem(KEY) ?? "[]") as Game[]; }
    catch { throw new Error("Saved library data could not be read."); }
  }
  async save(game: Game): Promise<void> {
    try { localStorage.setItem(KEY, JSON.stringify([...(JSON.parse(localStorage.getItem(KEY) ?? "[]") as Game[]).filter((item) => item.id !== game.id), game])); }
    catch { throw new Error("The game could not be saved."); }
  }
}

export class TauriGameRepository implements GameRepository {
  async list(): Promise<Game[]> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<Game[]>("list_games");
  }
  async save(game: Game): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("save_game", { game });
  }
}

export function createGameRepository(): GameRepository {
  return "__TAURI_INTERNALS__" in globalThis ? new TauriGameRepository() : new LocalGameRepository();
}
