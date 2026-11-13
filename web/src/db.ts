// Tiny IndexedDB wrapper. Stores: "kv" (small records) and "images" (Blobs keyed by content hash).
export type Store = "kv" | "images";
export const KEY = { data: "data", meta: "sync.meta", vaultKey: "vault.key", vaultCreds: "vault.creds" } as const;

let opened: Promise<IDBDatabase> | undefined;

function open(): Promise<IDBDatabase> {
  opened ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("lostinsync-web", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("kv");
      req.result.createObjectStore("images");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      opened = undefined;
      reject(req.error ?? new Error("Browser storage is unavailable."));
    };
  });
  return opened;
}

async function run<T>(store: Store, mode: IDBTransactionMode, op: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = op(tx.objectStore(store));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? req.error);
    tx.onabort = () => reject(tx.error ?? new Error("Storage write was aborted (is the disk full?)."));
  });
}

export const get = <T>(store: Store, key: string) => run<T | undefined>(store, "readonly", (s) => s.get(key));
export const put = (store: Store, key: string, value: unknown) =>
  run(store, "readwrite", (s) => s.put(value, key)).then(() => undefined);
export const del = (store: Store, key: string) => run(store, "readwrite", (s) => s.delete(key)).then(() => undefined);
export const count = (store: Store, key: string) => run<number>(store, "readonly", (s) => s.count(key));
export const keys = (store: Store) =>
  run<IDBValidKey[]>(store, "readonly", (s) => s.getAllKeys()).then((k) => k.map(String));

/** Runs writes one at a time so a restore can never interleave with a save. */
let chain: Promise<unknown> = Promise.resolve();
export function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(() => fn());
  chain = next.catch(() => undefined);
  return next;
}
