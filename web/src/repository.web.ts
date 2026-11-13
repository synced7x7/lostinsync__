// Web replacement for src/data/repository.ts (swapped in by vite.config.ts; the offline file is untouched).
import type { AppData, Game } from "../../src/domain/game";
import * as db from "./db";
import { KEY, serial } from "./db";
import { externalizeGames, inflateGames, prepare, refsOf } from "./codec";
import { emitDirty } from "./events";
import { loadCreds, saveCreds } from "./vault";

export interface AppRepository { load(): Promise<AppData>; save(data: AppData): Promise<void>; }

let lastCreds = "";
let lastJson = "";

async function toSlim(data: AppData): Promise<AppData> {
  const { igdbClientId: _id, igdbClientSecret: _secret, ...settings } = data.settings;
  return { ...data, games: await externalizeGames(data.games), settings } as AppData;
}

async function gcImages(games: Game[]) {
  const keep = refsOf(games);
  for (const k of await db.keys("images")) if (!keep.has(k)) await db.del("images", k);
}

/** Reads the local copy (IndexedDB) and re-attaches the IGDB keys from the encrypted vault. */
export async function loadFromStore(): Promise<AppData> {
  const stored = await db.get<AppData>("kv", KEY.data);
  const data = prepare(stored ? { ...stored, games: await inflateGames(stored.games ?? []) } : undefined);
  const creds = await loadCreds();
  lastCreds = JSON.stringify(creds);
  lastJson = JSON.stringify(await toSlim(data));
  return {
    ...data,
    settings: {
      ...data.settings,
      ...(creds.clientId ? { igdbClientId: creds.clientId } : {}),
      ...(creds.clientSecret ? { igdbClientSecret: creds.clientSecret } : {}),
    },
  };
}

class WebAppRepository implements AppRepository {
  async load(): Promise<AppData> {
    void navigator.storage?.persist?.(); // ask the browser not to evict our data
    return loadFromStore();
  }
  save(data: AppData): Promise<void> {
    return serial(async () => {
      const creds = { clientId: data.settings.igdbClientId ?? "", clientSecret: data.settings.igdbClientSecret ?? "" };
      const credsJson = JSON.stringify(creds);
      if (credsJson !== lastCreds) { await saveCreds(creds); lastCreds = credsJson; }
      const slim = await toSlim(data);
      const json = JSON.stringify(slim);
      if (json === lastJson) return; // nothing changed (also avoids a redundant cloud sync after a restore)
      await db.put("kv", KEY.data, slim);
      lastJson = json;
      await gcImages(slim.games);
      emitDirty();
    });
  }
}

export function createAppRepository(): AppRepository { return new WebAppRepository(); }
export type { Game };
