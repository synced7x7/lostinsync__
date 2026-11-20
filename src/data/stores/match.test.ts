import { describe, expect, it } from "vitest";
import type { IgdbHit } from "../igdb";
import { chooseLoose, chooseStrict } from "./match";

const hit = (id: number, name: string): IgdbHit => ({ id, name });

describe("chooseStrict", () => {
  it("accepts an exact normalized name while ignoring punctuation", () => {
    expect(chooseStrict([hit(1, "Another"), hit(2, "The Finals!")], "the finals")?.id).toBe(2);
  });

  it("returns undefined when nothing matches", () => {
    expect(chooseStrict([hit(1, "Hades")], "Hollow Knight")).toBeUndefined();
  });
});

describe("chooseLoose", () => {
  it("accepts a unique normalized match", () => {
    expect(chooseLoose([hit(1, "Portal"), hit(2, "Portal 2")], "portal")?.hit?.id).toBe(1);
  });

  it("never guesses between several matches", () => {
    const result = chooseLoose([hit(1, "Doom"), hit(2, "Doom!")], "doom");
    expect(result.hit).toBeUndefined();
    expect(result.reason).toMatch(/Several IGDB games/);
  });

  it("explains an unmatched title", () => {
    expect(chooseLoose([], "Unknown").reason).toMatch(/No confident IGDB match/);
  });
});
