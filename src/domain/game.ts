export const STATUSES = ["Backlog", "Wishlist", "Playing", "Completed", "Retired", "Shelved", "Abandoned", "On hold"] as const;
export type Status = typeof STATUSES[number];
export type View = "dashboard" | "library" | "details" | "activity" | "profile" | "journal" | "settings";
export type Game = {
  id: string; title: string; platform: string; genre: string; tags: string[];
  status: Status; notes: string; rating?: number; mastery?: number; favorite: boolean;
  cover?: string; totalSeconds: number; activeSince?: string; createdAt: string; startedAt?: string; finishedAt?: string;
};
export type ActivityEvent = { id: string; type: "added" | "status" | "session" | "completed"; title: string; detail: string; occurredAt: string };
export type JournalEntry = { id: string; title: string; body: string; mood: string; createdAt: string; gameId?: string };
export type Profile = { displayName: string; bio: string; accent: string };
export type AppSettings = { theme: "aurora"; defaultView: "grid" | "list"; timerSound: boolean; automaticTracking: boolean };
export type AppData = { games: Game[]; activities: ActivityEvent[]; journal: JournalEntry[]; profile: Profile; settings: AppSettings };
export function durationSeconds(start: string, end: string): number {
  const duration = Math.floor((Date.parse(end) - Date.parse(start)) / 1000);
  if (!Number.isFinite(duration) || duration < 0) throw new Error("Session end must be after its start.");
  return duration;
}
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
  settings: { theme: "aurora", defaultView: "grid", timerSound: false, automaticTracking: false },
};
