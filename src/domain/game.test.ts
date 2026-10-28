import { describe, expect, it } from "vitest";
import { durationSeconds, formatPlaytime, validateGame } from "./game";
describe("game rules", () => {
  it("validates required fields", () => {
    expect(validateGame("A", "PC")).toContain("title");
    expect(validateGame("Celeste", "")).toContain("platform");
    expect(validateGame("Celeste", "PC")).toBeNull();
  });
  it("calculates timestamp duration", () => {
    expect(durationSeconds("2026-01-01T00:00:00Z", "2026-01-01T01:02:03Z")).toBe(3723);
    expect(() => durationSeconds("2026-01-02T00:00:00Z", "2026-01-01T00:00:00Z")).toThrow();
  });
  it("formats verified playtime without treating missing time as completed time", () => {
    expect(formatPlaytime(0)).toBe("0m");
    expect(formatPlaytime(3723)).toBe("1h 2m");
  });
});
