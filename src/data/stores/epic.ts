import type { StoreRecord } from "./types";

/** Epic's unofficial library endpoint; fields vary between launcher versions, so read them tolerantly. */
export type EpicLibraryItem = {
  catalogItemId?: string;
  itemId?: string;
  namespace?: string;
  title?: string;
  metadata?: { title?: string; displayName?: string; name?: string };
};
export type EpicPage = { records?: EpicLibraryItem[]; nextCursor?: string | null };

export function parseEpicPage(body: EpicPage): { records: StoreRecord[]; nextCursor: string | null } {
  const records: StoreRecord[] = [];
  for (const item of Array.isArray(body.records) ? body.records : []) {
    const id = String(item.catalogItemId ?? item.itemId ?? "").trim();
    const title = String(item.title ?? item.metadata?.title ?? item.metadata?.displayName ?? item.metadata?.name ?? "").trim();
    if (!id || !title) continue;
    records.push({ store: "epic", storeId: id, title, installed: false });
  }
  const next = typeof body.nextCursor === "string" ? body.nextCursor.trim() : "";
  return { records, nextCursor: next || null };
}
