import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IgdbCreds, IgdbHit } from "../igdb";
import { igdbSearch } from "../igdb";
import { igdbEpicLookup, igdbExternalLookup } from "./ipc";
import { cleanEpicTitle, clearMatchCache, chooseLoose, chooseStrict, matchRecord } from "./match";
import type { StoreRecord } from "./types";

vi.mock("../igdb", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../igdb")>();
  return { ...actual, igdbSearch: vi.fn() };
});
vi.mock("./ipc", () => ({ igdbExternalLookup: vi.fn(), igdbEpicLookup: vi.fn() }));

const creds: IgdbCreds = { clientId: "id", clientSecret: "secret" };
const hit = (id: number, name: string): IgdbHit => ({ id, name });
const epic = (title = "Rocket League R"): StoreRecord => ({ store: "epic", storeId: "catalog-123", title });
const steam = (): StoreRecord => ({ store: "steam", storeId: "10", title: "Hades" });

beforeEach(() => {
  clearMatchCache();
  vi.resetAllMocks();
});

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

describe("cleanEpicTitle", () => {
  it("strips trademark marks and edition suffixes", () => {
    expect(cleanEpicTitle("Rocket League®")).toBe("Rocket League");
    expect(cleanEpicTitle("Rocket League R")).toBe("Rocket League");
    expect(cleanEpicTitle("Fallout 3: Game of the Year Edition")).toBe("Fallout 3");
  });

  it("leaves ordinary subtitles alone", () => {
    expect(cleanEpicTitle("Jotunnslayer: Hordes of Hel")).toBe("Jotunnslayer: Hordes of Hel");
  });
});

describe("matchRecord — Epic direct ID linking", () => {
  it("resolves the Epic catalog id before any title search", async () => {
    vi.mocked(igdbEpicLookup).mockResolvedValue(119133);
    const result = await matchRecord(epic(), creds);
    expect(result).toEqual({ igdbId: 119133, origin: "external" });
    expect(igdbEpicLookup).toHaveBeenCalledWith("catalog-123", "Rocket League R", creds);
    expect(igdbSearch).not.toHaveBeenCalled();
  });

  it("falls back to the strict title search when the direct lookup misses", async () => {
    vi.mocked(igdbEpicLookup).mockResolvedValue(null);
    vi.mocked(igdbSearch).mockResolvedValueOnce([hit(7, "Rocket League")]);
    const result = await matchRecord(epic("Rocket League"), creds);
    expect(result).toEqual({ igdbId: 7, origin: "strict" });
  });

  it("searches with a cleaned Epic title", async () => {
    vi.mocked(igdbEpicLookup).mockResolvedValue(null);
    vi.mocked(igdbSearch).mockResolvedValueOnce([hit(7, "Rocket League")]);
    const result = await matchRecord(epic("Rocket League®"), creds);
    expect(result).toEqual({ igdbId: 7, origin: "strict" });
    expect(igdbSearch).toHaveBeenCalledWith("/ Rocket League", creds);
  });

  it("falls back to unique normalized title matching when strict search misses", async () => {
    vi.mocked(igdbEpicLookup).mockResolvedValue(null);
    vi.mocked(igdbSearch).mockResolvedValueOnce([]).mockResolvedValueOnce([hit(8, "Rocket League")]);
    const result = await matchRecord(epic("Rocket League"), creds);
    expect(result).toEqual({ igdbId: 8, origin: "title" });
  });

  it("keeps the generic store lookup for non-Epic connectors", async () => {
    vi.mocked(igdbExternalLookup).mockResolvedValue(42);
    const result = await matchRecord(steam(), creds);
    expect(result).toEqual({ igdbId: 42, origin: "external" });
    expect(igdbExternalLookup).toHaveBeenCalledWith("10", 1, creds);
    expect(igdbEpicLookup).not.toHaveBeenCalled();
  });
});
