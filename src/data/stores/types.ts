import type { AppSettings, StoreId } from "../../domain/game";

export type { StoreId };

/** Capabilities let one UI drive every connector without store-specific branching. */
export type StoreCapabilities = {
  needsSignIn: boolean;
  hasPlaytime: boolean;
  hasAchievements: boolean;
  usesOAuth: boolean;
};

/** Normalized record returned by a connector. Auth never leaves the Rust side. */
export type StoreRecord = {
  store: StoreId;
  storeId: string;
  title: string;
  playtimeMinutes?: number;
  lastPlayedUnix?: number;
  achievements?: { achieved: number; total: number; firstUnlockUnix?: number };
  installed?: boolean;
  /** Steam: played in the last two weeks (Steam's "Recently Played" section). */
  recentlyPlayed?: boolean;
  /** Steam: record came from the public wishlist, not the owned-games list. */
  wishlist?: boolean;
};

export type StoreConnector = {
  id: StoreId;
  name: string;
  blurb: string;
  capabilities: StoreCapabilities;
  /** IGDB `external_games` source id, when one is known. */
  igdbSource?: number;
};

export const STORES: StoreConnector[] = [
  {
    id: "steam",
    name: "Steam",
    blurb: "Official Web API plus your public wishlist. Maps playtime, recently played, wishlist, dates and all achievements into library status, dates and mastery.",
    capabilities: { needsSignIn: true, hasPlaytime: true, hasAchievements: true, usesOAuth: false },
    igdbSource: 1,
  },
  {
    id: "epic",
    name: "Epic Games",
    blurb: "Unofficial launcher API. Ownership only — Epic exposes no confirmed playtime endpoint.",
    capabilities: { needsSignIn: true, hasPlaytime: false, hasAchievements: false, usesOAuth: true },
    igdbSource: 26,
  },
];

export const storeById = (id: StoreId) => STORES.find((s) => s.id === id);

/** IGDB source ids used for the first matching pass (unverified live — strict title search is the backstop). */
export const IGDB_SOURCE: Partial<Record<StoreId, number>> = { steam: 1, epic: 26 };

export type StoreImportProgress = {
  phase: "fetching" | "achievements" | "matching" | "details" | "done";
  done: number;
  total: number;
};

export type StoreImportReport = {
  store: StoreId;
  total: number;
  imported: number;
  linked: number;
  updated: number;
  duplicates: number;
  cancelled: boolean;
  needsReview: { title: string; storeId: string; reason: string }[];
  failures: { title: string; error: string }[];
  warnings: string[];
};

/** Credentials are device-only: Epic tokens live in Rust storage, Steam keys live in settings like IGDB. */
const STORE_CREDENTIAL_KEYS = ["steamKey", "steamApiKey", "steamId", "storeCredentials", "epicAccessToken"];
export function stripStoreCredentials(settings: AppSettings): AppSettings {
  const out = settings as unknown as Record<string, unknown>;
  for (const key of STORE_CREDENTIAL_KEYS) delete out[key];
  return settings;
}

export const emptyStoreReport = (store: StoreId, total = 0): StoreImportReport => ({
  store, total, imported: 0, linked: 0, updated: 0, duplicates: 0,
  cancelled: false, needsReview: [], failures: [], warnings: [],
});

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export const storeKey = (r: Pick<StoreRecord, "store" | "storeId">) => `${r.store}:${r.storeId}`;
export const minutesToSeconds = (minutes?: number | null) =>
  typeof minutes === "number" && Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 60) : 0;
export const unixToDate = (seconds?: number | null) =>
  typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString().slice(0, 10) : undefined;

export function storeReportSections(r: StoreImportReport): { title: string; items: string[] }[] {
  return [
    { title: "Needs review (imported without online metadata)", items: r.needsReview.map((x) => `${x.title} (${r.store} id ${x.storeId}): ${x.reason}`) },
    { title: "Linked to an existing game", items: r.linked ? [`${r.linked} game(s) matched by IGDB id or title and gained store ids.`] : [] },
    { title: "Refreshed store fields", items: r.updated ? [`${r.updated} game(s) had store-owned fields refreshed.`] : [] },
    { title: "Skipped duplicates", items: r.duplicates ? [`${r.duplicates} record(s) were already linked to your library.`] : [] },
    { title: "Warnings", items: r.warnings },
    { title: "Failures", items: r.failures.map((x) => `${x.title}: ${x.error}`) },
  ].filter((s) => s.items.length);
}

export function storeReportToText(r: StoreImportReport): string {
  const head = `${r.store} import: ${r.imported} imported, ${r.linked} linked, ${r.updated} refreshed of ${r.total} records${r.cancelled ? " (cancelled)" : ""}`;
  return [head, ...storeReportSections(r).map((s) => `\n${s.title} (${s.items.length})\n${s.items.map((i) => `- ${i}`).join("\n")}`)].join("\n");
}
