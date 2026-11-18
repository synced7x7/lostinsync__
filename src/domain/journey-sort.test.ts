import { describe, expect, it } from "vitest";
import { sortJourneyRows } from "./journey-sort";

const row = (id: string, start: number) => ({ id, start });

describe("sortJourneyRows", () => {
  it("orders oldest first in ascending direction", () => {
    const rows = [row("c", 3), row("a", 1), row("b", 2)];
    expect(sortJourneyRows(rows, "asc").map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("orders newest first in descending direction", () => {
    const rows = [row("c", 3), row("a", 1), row("b", 2)];
    expect(sortJourneyRows(rows, "desc").map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("breaks equal-start ties by id in both directions", () => {
    const rows = [row("b", 1), row("a", 1), row("c", 1)];
    expect(sortJourneyRows(rows, "asc").map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(sortJourneyRows(rows, "desc").map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("does not mutate the input and handles empty/single lists", () => {
    const rows = [row("a", 1)];
    const sorted = sortJourneyRows(rows, "asc");
    expect(sorted).not.toBe(rows);
    expect(sorted).toEqual(rows);
    expect(sortJourneyRows([], "desc")).toEqual([]);
  });
});
