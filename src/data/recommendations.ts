export type BacklogRecommendation = {
  gameId: string;
  score: number;
  similarityScore: number;
  qualityScore: number;
  reasons: string[];
  similarPlayedGames: string[];
};

export const hasTauri = "__TAURI_INTERNALS__" in globalThis;

export async function getBacklogRecommendations(limit = 6): Promise<BacklogRecommendation[]> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<BacklogRecommendation[]>("get_backlog_recommendations", { limit });
}
