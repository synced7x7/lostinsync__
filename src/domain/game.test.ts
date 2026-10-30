import { describe, expect, it } from "vitest";
import { formatPlaytime, validateGame } from "./game";
describe("game rules", () => {
  it("validates required fields", () => {
    expect(validateGame("A", "PC")).toContain("title");
    expect(validateGame("Celeste", "")).toContain("platform");
    expect(validateGame("Celeste", "PC")).toBeNull();
  });
  it("formats verified playtime without treating missing time as completed time", () => {
    expect(formatPlaytime(0)).toBe("0m");
    expect(formatPlaytime(3723)).toBe("1h 2m");
  });
});
