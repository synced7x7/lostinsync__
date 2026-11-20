import type { StoreAchievements, StoreId } from "../../domain/game";
import type { IgdbCreds } from "../igdb";
import type { StoreRecord } from "./types";

/** Reliable desktop check: the web build deliberately reports `hasTauri = true` to keep IGDB UI parity. */
export const isDesktop = "__TAURI_INTERNALS__" in globalThis;

/** All store traffic goes through Rust. Keys/tokens are never written to a backup or a Drive snapshot. */
async function invokeStore<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

export type StoreStatus = Record<StoreId, boolean>;
export type SteamCreds = { apiKey: string; steamId: string };

/** Steam credentials are passed per call, exactly like the IGDB key/secret. */
const steamArgs = (steam?: SteamCreds) => ({ steamKey: steam?.apiKey ?? "", steamId: steam?.steamId ?? "" });

export const storesStatus = (steamConnected: boolean) =>
  invokeStore<StoreStatus>("stores_status", { steamConnected });
export const storesAuthUrl = (store: StoreId) => invokeStore<string>("stores_auth_url", { store });
export const storesCompleteAuth = (store: StoreId, code: string, steamConnected: boolean) =>
  invokeStore<StoreStatus>("stores_complete_auth", { store, code, steamConnected });
export const storesFetch = (store: StoreId, steam?: SteamCreds) =>
  invokeStore<StoreRecord[]>("stores_fetch", { store, ...steamArgs(steam) });
export const storesFetchAchievements = (store: StoreId, storeId: string, steam?: SteamCreds) =>
  invokeStore<StoreAchievements>("stores_fetch_achievements", { store, storeId, ...steamArgs(steam) });
export const storesScanBattleNet = () => invokeStore<{ code: string; name: string }[]>("stores_scan_battlenet");

/** Look up `(external source, uid)` directly on IGDB before falling back to title search. */
export const igdbExternalLookup = (uid: string, source: number, creds: IgdbCreds) =>
  invokeStore<number | null>("igdb_external_lookup", { uid, source, clientId: creds.clientId, clientSecret: creds.clientSecret });
