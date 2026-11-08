import type { AppSettings, GridSize, LibrarySort, SortDirection, Status } from "./game";

export type LibraryPrefs = {
  filter: Status | "All"; gameType: string; favoritesOnly: boolean;
  sort: LibrarySort; direction: SortDirection;
  layout: NonNullable<AppSettings["libraryLayout"]>; fullscreen: boolean; gridSize: GridSize;
};

export const libraryDefaults = (s: Partial<AppSettings>): LibraryPrefs => ({
  filter: s.libraryFilter ?? "All", gameType: s.libraryGameType ?? "All",
  favoritesOnly: s.libraryFavoritesOnly ?? false, sort: s.librarySort ?? "recent",
  direction: s.librarySortDirection ?? "desc", layout: s.libraryLayout ?? "ps4",
  fullscreen: s.libraryFullscreen ?? false, gridSize: s.gridSize ?? "md",
});

export const prefsToSettings = (p: LibraryPrefs): Partial<AppSettings> => ({
  libraryFilter: p.filter, libraryGameType: p.gameType, libraryFavoritesOnly: p.favoritesOnly,
  librarySort: p.sort, librarySortDirection: p.direction, libraryLayout: p.layout,
  libraryFullscreen: p.fullscreen, gridSize: p.gridSize,
});

export const SORT_OPTIONS: { value: LibrarySort; label: string }[] = [
  { value: "recent", label: "When added" },
  { value: "completion", label: "Last played (Completion Time)" },
  { value: "playtime", label: "Time played" },
  { value: "rating", label: "User rating" },
  { value: "igdbRating", label: "IGDB rating" },
  { value: "title", label: "Title" },
  { value: "releaseDate", label: "Release date" },
  { value: "avgTime", label: "Avg time to complete" },
  { value: "mainTime", label: "Main story completion time" },
  { value: "fullTime", label: "100% completion time" },
];

// lives in memory only; null = "seed from saved defaults on next Library visit"
export const librarySession: { query: string; prefs: LibraryPrefs | null } = { query: "", prefs: null };