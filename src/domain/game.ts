import type { IgdbDebugImage } from "../data/igdb";

export const STATUSES = ["Backlog", "Wishlist", "Playing", "Completed", "Shelved", "Abandoned", "On hold"] as const;
export type Status = typeof STATUSES[number];
export type View = "dashboard" | "library" | "discover" | "details" | "journey" | "trophies" | "stats" | "settings";
export type Game = {
  id: string; title: string; platform: string; genre: string; tags: string[];
  status: Status; notes: string; rating?: number; platinumed?: boolean; favorite: boolean;
  cover?: string; backgroundCover?: string; totalSeconds: number; activeSince?: string; createdAt: string; startedAt?: string; finishedAt?: string;
  developer?: string; releaseDate?: string; description?: string;
  genres?: string[]; platforms?: string[]; igdbId?: number;
  igdbRating?: number; igdbRatingCount?: number;
  timeAvgSeconds?: number; timeMainSeconds?: number; timeFullSeconds?: number;
  playedPlatforms?: string[]; emulatedOn?: string[];
  screenshots?: string[]; videos?: { id: string; name?: string }[];
  igdbImages?: IgdbDebugImage[]; igdbVideos?: { id: string; name?: string }[];
  gameType?: string; gameStatus?: string; franchises?: string[];
  themes?: string[]; playerPerspectives?: string[];
  igdbUpdatedAt?: number; backloggdId?: string;   bundleGames?: BundleGame[];

};

export type BundleGame = { id: number; name: string; cover?: string; releaseTs?: number };
export type Profile = { displayName: string; bio: string; accent: string; picture?: string; topFive?: string[] }; export type GridSize = "sm" | "md" | "lg";
export type LibraryLayout = "ps4" | "catalog";
export type LibrarySort = "recent" | "completion" | "playtime" | "rating" | "igdbRating" | "title" | "releaseDate" | "avgTime" | "mainTime" | "fullTime";
export type SortDirection = "asc" | "desc";

export type AppSettings = {
  theme: "aurora";
  defaultView: View | "grid" | "list";
  libraryLayout: LibraryLayout;
  libraryFullscreen: boolean;
  gridSize: GridSize;
  librarySort: LibrarySort;
  librarySortDirection: SortDirection;
  libraryFilter: Status | "All";
  libraryGenre: string;
  libraryFavoritesOnly: boolean;
  journeyRange?: "all" | "month" | number;
  journeyZoom?: number;
  journeyFit?: boolean;
  igdbClientId?: string;
  igdbClientSecret?: string;
  lastIgdbSyncAt?: string;
  libraryGameType?: string;
};
export type CollectionItem = { igdbId: number; name: string; cover?: string };
export type Collection = { id: string; name: string; description?: string; items: CollectionItem[] };
export type AppData = { games: Game[]; profile: Profile; settings: AppSettings; collections?: Collection[] };
export function validateGame(title: string): string | null {
  if (title.trim().length < 2) return "Enter a game title with at least two characters.";
  return null;
}
export function formatPlaytime(seconds: number): string | null {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours == 0 && minutes == 0) return null;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
export const defaultData: AppData = {
  games: [],
  collections: [],
  profile: { displayName: "Player One", bio: "Building a life in games.", accent: "#9b8cff" },
  settings: {
    theme: "aurora",
    defaultView: "library",
    libraryLayout: "ps4",
    libraryFullscreen: false,
    gridSize: "md",
    librarySort: "recent",
    librarySortDirection: "desc",
    libraryFilter: "All",
    libraryGenre: "All",
    libraryFavoritesOnly: false,
  },
};

export function formatCount(n?: number): string {
  if (!n) return "0";
  return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}
export function formatHours(seconds?: number): string {
  if (!seconds) return "—";
  const h = seconds / 3600;
  return `${h >= 10 ? Math.round(h) : h.toFixed(1).replace(/\.0$/, "")}h`;
}
