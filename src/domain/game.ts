export const STATUSES = ["Backlog", "Wishlist", "Playing", "Completed", "Retired", "Shelved", "Abandoned", "On hold"] as const;
export type Status = typeof STATUSES[number];
export type Game = { id: string; title: string; platform: string; status: Status; notes: string; totalSeconds: number; activeSince?: string; createdAt: string };
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
