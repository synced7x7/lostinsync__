import type { StoreRecord } from "./types";

/** GOG's community-documented `getFilteredProducts` response. */
export type GogProduct = { id?: number; title?: string };
export type GogPage = { products?: GogProduct[]; page?: number; totalPages?: number };

export function parseGogPage(body: GogPage): { products: GogProduct[]; totalPages: number } {
  return {
    products: Array.isArray(body.products) ? body.products : [],
    totalPages: Math.max(1, Number(body.totalPages) || 1),
  };
}

export function gogRecords(products: GogProduct[]): StoreRecord[] {
  const out: StoreRecord[] = [];
  for (const p of products) {
    const id = Number(p.id);
    const title = String(p.title ?? "").trim();
    if (!Number.isInteger(id) || id <= 0 || !title) continue;
    out.push({ store: "gog", storeId: String(id), title, installed: false });
  }
  return out;
}
