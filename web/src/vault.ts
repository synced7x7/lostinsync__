// IGDB credentials live ONLY here: AES-GCM encrypted in IndexedDB with a non-extractable key.
// They are never part of the saved library, the Google Drive snapshot, or exported files.
import * as db from "./db";
import { KEY } from "./db";

export type Creds = { clientId: string; clientSecret: string };
type Sealed = { iv: Uint8Array; ct: ArrayBuffer };

async function key(): Promise<CryptoKey> {
  let k = await db.get<CryptoKey>("kv", KEY.vaultKey);
  if (!k) {
    k = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await db.put("kv", KEY.vaultKey, k);
  }
  return k;
}

export async function saveCreds(c: Creds): Promise<void> {
  if (!c.clientId && !c.clientSecret) { await db.del("kv", KEY.vaultCreds); return; }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(JSON.stringify(c)));
  await db.put("kv", KEY.vaultCreds, { iv, ct } satisfies Sealed);
}

export async function loadCreds(): Promise<Creds> {
  const empty = { clientId: "", clientSecret: "" };
  try {
    const sealed = await db.get<Sealed>("kv", KEY.vaultCreds);
    if (!sealed) return empty;
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.iv as BufferSource }, await key(), sealed.ct);
    const parsed = JSON.parse(new TextDecoder().decode(raw)) as Partial<Creds>;
    return { clientId: parsed.clientId ?? "", clientSecret: parsed.clientSecret ?? "" };
  } catch {
    return empty;
  }
}
