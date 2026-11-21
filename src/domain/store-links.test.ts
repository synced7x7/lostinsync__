import { describe, expect, it } from "vitest";
import { storeLinksFromExternal } from "./store-links";

describe("storeLinksFromExternal", () => {
  it("keeps only rows with a usable URL", () => {
    expect(storeLinksFromExternal([
      { source: 1, url: "https://store.steampowered.com/app/620" },
      { source: 26, url: undefined },
      { source: 36, url: "not-a-url" },
    ])).toEqual([{ source: 1, url: "https://store.steampowered.com/app/620" }]);
  });

  it("de-duplicates the same source", () => {
    const links = storeLinksFromExternal([
      { source: 1, url: "https://store.steampowered.com/app/620" },
      { source: 1, url: "https://store.steampowered.com/app/621" },
    ]);
    expect(links).toHaveLength(1);
    expect(links[0].url).toBe("https://store.steampowered.com/app/620");
  });

  it("orders known storefronts by priority and leaves unknown sources last", () => {
    expect(storeLinksFromExternal([
      { source: 36, url: "https://store.playstation.com/p/1" },
      { source: 999, url: "https://example.com" },
      { source: 1, url: "https://store.steampowered.com/app/620" },
      { source: 26, url: "https://store.epicgames.com/p/1" },
    ]).map((s) => s.source)).toEqual([1, 26, 36, 999]);
  });

  it("returns an empty list for no rows", () => {
    expect(storeLinksFromExternal([])).toEqual([]);
  });

  it("hides links from the removed storefront source", () => {
    expect(storeLinksFromExternal([
      { source: 5, url: "https://example.com/removed" },
      { source: 1, url: "https://store.steampowered.com/app/620" },
    ])).toEqual([{ source: 1, url: "https://store.steampowered.com/app/620" }]);
  });
});
