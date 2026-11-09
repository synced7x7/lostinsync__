import { describe, expect, it } from "vitest";
import { formatPlaytime, validateGame } from "./game";
describe("game rules", () => {
  it("validates required fields", () => {
    expect(validateGame("A")).toContain("title");
    expect(validateGame("Celeste")).toBeNull();
  });
  it("formats verified playtime without treating missing time as completed time", () => {
    expect(formatPlaytime(0)).toBeNull();
    expect(formatPlaytime(3723)).toBe("1h 2m");
  });
});

