export const STATUSES = ["Backlog", "Wishlist", "Playing", "Completed", "Retired", "Shelved", "Abandoned", "On hold"] as const;
export type Status = typeof STATUSES[number];
export type View = "dashboard" | "library" | "details" | "activity" | "profile" | "journal" | "settings";
export type Game = {
  id: string; title: string; platform: string; genre: string; tags: string[];
  status: Status; notes: string; rating?: number; mastery?: number; favorite: boolean;
  cover?: string; backgroundCover?: string; totalSeconds: number; activeSince?: string; createdAt: string; startedAt?: string; finishedAt?: string;
  developer?: string; releaseDate?: string; description?: string;
  genres?: string[]; platforms?: string[]; igdbId?: number;
  igdbRating?: number; igdbRatingCount?: number;
  timeAvgSeconds?: number; timeMainSeconds?: number; timeFullSeconds?: number;
  playedPlatforms?: string[]; emulatedOn?: string[];
  screenshots?: string[]; videos?: { id: string; name?: string }[];
};
export type ActivityEvent = { id: string; type: "added" | "status" | "completed" | "started" | "deleted"; title: string; detail: string; occurredAt: string };
export type JournalEntry = { id: string; title: string; body: string; mood: string; createdAt: string; gameId?: string };
export type Profile = { displayName: string; bio: string; accent: string };
export type GridSize = "sm" | "md" | "lg";
export type LibraryLayout = "ps4" | "catalog";
export type LibrarySort = "recent" | "title" | "playtime";

export type AppSettings = {
  theme: "aurora";
  defaultView: View | "grid" | "list";
  libraryLayout: LibraryLayout;
  gridSize: GridSize;
  librarySort: LibrarySort;
  libraryFilter: Status | "All";
  libraryGenre: string;
  timerSound: boolean;
  automaticTracking: boolean;
  igdbClientId?: string;
  igdbClientSecret?: string;
};
export type AppData = { games: Game[]; activities: ActivityEvent[]; journal: JournalEntry[]; profile: Profile; settings: AppSettings };
export function validateGame(title: string, platform: string): string | null {
  if (title.trim().length < 2) return "Enter a game title with at least two characters.";
  if (platform.trim().length < 2) return "Enter a platform.";
  return null;
}
export function formatPlaytime(seconds: number): string {
  const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
export const defaultData: AppData = {
  games: [], activities: [], journal: [],
  profile: { displayName: "Player One", bio: "Building a life in games.", accent: "#9b8cff" },
  settings: {
    theme: "aurora",
    defaultView: "library",
    libraryLayout: "ps4",
    gridSize: "md",
    librarySort: "recent",
    libraryFilter: "All",
    libraryGenre: "All",
    timerSound: true,
    automaticTracking: true,
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
