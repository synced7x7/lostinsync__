export type IgdbCreds = { clientId: string; clientSecret: string };
export type IgdbHit = { id: number; name: string; releaseTs?: number; developer?: string; cover?: string };
export type IgdbGame = {
  id: number; name: string; developer?: string; releaseTs?: number; description?: string;
  genres: string[]; platforms: string[]; rating?: number; ratingCount?: number;
  timeAvg?: number; timeMain?: number; timeFull?: number; cover?: string; background?: string;   
  videos: { videoId: string; name?: string }[]; screenshots: string[];
  gameType?: string; gameStatus?: string;
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

export const hasTauri = "__TAURI_INTERNALS__" in globalThis;

export async function igdbSearch(query: string, c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<IgdbHit[]>("igdb_search", { query, clientId: c.clientId, clientSecret: c.clientSecret });
}
export async function igdbDetails(id: number, c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<IgdbGame>("igdb_details", { id, clientId: c.clientId, clientSecret: c.clientSecret });
}
export async function igdbImages(id: number, c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<IgdbDebugImage[]>("igdb_images", { id, clientId: c.clientId, clientSecret: c.clientSecret });
}


export type SeriesData = {
  collections: { id: number; name: string; games?: number[] }[];
  relations: [number, number][]; // [parent, child]
  games: { id: number; name: string; releaseTs?: number; cover?: string }[];
};
export async function igdbSeries(id: number, c: IgdbCreds) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<SeriesData>("igdb_series", { id, clientId: c.clientId, clientSecret: c.clientSecret });
}
