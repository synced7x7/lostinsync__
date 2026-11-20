import { describe, expect, it } from "vitest";
import { mapBattleNetRows } from "./battlenet";
import { parseEpicPage } from "./epic";
import { gogRecords, parseGogPage } from "./gog";

describe("GOG paging", () => {
  it("reads products and total pages", () => {
    const page = parseGogPage({ products: [{ id: 1, title: "The Witcher 3" }], totalPages: 4 });
    expect(page.totalPages).toBe(4);
    expect(gogRecords(page.products)).toEqual([{
      store: "gog", storeId: "1", title: "The Witcher 3", installed: false,
    }]);
  });

  it("defaults to one page when metadata is missing", () => {
    expect(parseGogPage({})).toEqual({ products: [], totalPages: 1 });
  });
});

describe("Epic cursor paging", () => {
  it("maps nested titles and returns the next cursor", () => {
    const page = parseEpicPage({
      records: [
        { catalogItemId: "abc", namespace: "ns", metadata: { title: "Hades" } },
        { itemId: "def", metadata: { displayName: "Disco Elysium" } },
        { catalogItemId: "skip" },
      ],
      nextCursor: "cursor-2",
    });
    expect(page.records.map((r) => [r.storeId, r.title])).toEqual([["abc", "Hades"], ["def", "Disco Elysium"]]);
    expect(page.nextCursor).toBe("cursor-2");
  });

  it("treats an empty cursor as the end", () => {
    expect(parseEpicPage({ records: [], nextCursor: "  " }).nextCursor).toBeNull();
  });
});

describe("Battle.net local scan mapping", () => {
  it("drops agent rows, deduplicates and keeps installed games", () => {
    const records = mapBattleNetRows([
      { code: "agent", name: "Agent" },
      { code: "bna", name: "Battle.net" },
      { code: "WoW", name: "World of Warcraft" },
      { code: "wow", name: "World of Warcraft" },
      { code: "d3", name: "product_name" },
      { code: "Hero", name: "" },
    ]);
    expect(records).toEqual([
      { store: "battlenet", storeId: "WoW", title: "World of Warcraft", installed: true },
      { store: "battlenet", storeId: "d3", title: "Diablo III", installed: true },
      { store: "battlenet", storeId: "Hero", title: "Heroes of the Storm", installed: true },
    ]);
  });
});
