import { describe, expect, it } from "vitest";
import { parseEpicPage } from "./epic";

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
