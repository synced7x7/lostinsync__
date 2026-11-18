import type { SortDirection } from "./game";

export type JourneySortable = { id: string; start: number };

/** Chronological order with a deterministic id tie-breaker for equal start times. */
const compareStart = (a: JourneySortable, b: JourneySortable) =>
  a.start - b.start || a.id.localeCompare(b.id);

/** Rows for the Fit All overview: "asc" = oldest first, "desc" = newest first. */
export function sortJourneyRows<T extends JourneySortable>(rows: readonly T[], direction: SortDirection): T[] {
  const sorted = [...rows].sort(compareStart);
  return direction === "asc" ? sorted : sorted.reverse();
}
