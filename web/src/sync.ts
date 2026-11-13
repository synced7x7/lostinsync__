// Local copy (IndexedDB) <-> Google Drive snapshot. Local is always the working copy.
import { useSyncExternalStore } from "react";
import type { AppData } from "../../src/domain/game";
import * as db from "./db";
import { KEY } from "./db";
import { refsOf } from "./codec";
import { onDirty } from "./events";
import { loadFromStore } from "./repository.web";
import {
  DriveError, deleteFile, downloadFile, fetchEmail, forgetToken, getToken, gunzip, gzip,
  listFiles, preloadGoogle, uploadFile, type RemoteFile,
} from "./drive";

const SNAP = "lost-in-sync.snapshot.json.gz";
const imgName = (hash: string) => `img-${hash}`;
const FORMAT = 1;

export type SyncReport = {
  id: string; at: number; kind: "push" | "pull"; trigger: "auto" | "manual"; ok: boolean; message: string;
  durationMs: number; games: number; collections: number;
  imagesUploaded: number; imagesDownloaded: number; imagesPruned: number; imagesMissing: number; bytes: number;
};
export type RemoteInfo = {
  exists: boolean; modifiedTime?: string; bytes?: number; games?: number; collections?: number;
  images?: number; savedAt?: number; device?: string; unreadable?: boolean;
};
export type SyncState = {
  ready: boolean; connected: boolean; email?: string; busy: "push" | "pull" | "check" | null; progress?: string;
  dirty: boolean; lastSyncedAt?: number; intervalMin: number; error?: string; needsAuth: boolean;
  conflict: boolean; remote?: RemoteInfo; local: { games: number; collections: number; images: number };
  history: SyncReport[]; thisDevice: string;
};
type Meta = {
  connected: boolean; intervalMin: number; dirty: boolean; lastSyncedAt?: number; remoteModified?: string;
  email?: string; deviceId: string; history: SyncReport[];
};

let meta: Meta | undefined;
let dirtySeq = 0;
let lastAttempt = 0;
let earlyDirty = false;
let timer: ReturnType<typeof setInterval> | undefined;

let state: SyncState = {
  ready: false, connected: false, busy: null, dirty: false, intervalMin: 5, needsAuth: false, conflict: false,
  local: { games: 0, collections: 0, images: 0 }, history: [], thisDevice: "",
};
const subs = new Set<() => void>();
const set = (p: Partial<SyncState>) => { state = { ...state, ...p }; subs.forEach((f) => f()); };
export const useSyncState = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state);

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const pool = async <T,>(items: T[], n: number, fn: (x: T) => Promise<void>) => {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
};

function publish() {
  if (!meta) return;
  const remote = state.remote;
  set({
    ready: true, connected: meta.connected, email: meta.email, dirty: meta.dirty, lastSyncedAt: meta.lastSyncedAt,
    intervalMin: meta.intervalMin, history: meta.history, thisDevice: meta.deviceId.slice(0, 8),
    conflict: !!remote?.exists && remote.modifiedTime !== meta.remoteModified,
  });
}
async function persist() {
  if (!meta) return;
  await db.put("kv", KEY.meta, meta);
  publish();
}

export async function refreshLocal() {
  const slim = await db.get<AppData>("kv", KEY.data);
  set({ local: { games: slim?.games.length ?? 0, collections: slim?.collections?.length ?? 0, images: slim ? refsOf(slim.games).size : 0 } });
}

/* ───────── helpers ───────── */
async function exclusive<T>(kind: "push" | "pull" | "check", fn: () => Promise<T>): Promise<T | undefined> {
  if (state.busy) return undefined;
  set({ busy: kind, error: undefined, progress: undefined });
  try { return await fn(); }
  finally { set({ busy: null, progress: undefined }); }
}
const progress = (progressText: string) => set({ progress: progressText });

async function auth(interactive: boolean): Promise<string> {
  try {
    const tk = await getToken(interactive);
    if (state.needsAuth) set({ needsAuth: false });
    return tk;
  } catch (e) {
    set({ needsAuth: true });
    throw e;
  }
}

async function inspect(tk: string, files: RemoteFile[]): Promise<RemoteInfo> {
  const snap = files.find((f) => f.name === SNAP);
  if (!snap) return { exists: false };
  const base: RemoteInfo = { exists: true, modifiedTime: snap.modifiedTime, bytes: Number(snap.size ?? 0), images: files.filter((f) => f.name.startsWith("img-")).length };
  try {
    const parsed = JSON.parse(await gunzip(await downloadFile(tk, snap.id)));
    if (parsed?.format !== FORMAT || !Array.isArray(parsed.data?.games)) return { ...base, unreadable: true };
    return { ...base, games: parsed.data.games.length, collections: parsed.data.collections?.length ?? 0, savedAt: parsed.savedAt, device: String(parsed.device ?? "").slice(0, 8) };
  } catch {
    return { ...base, unreadable: true };
  }
}

function newReport(kind: SyncReport["kind"], trigger: SyncReport["trigger"]): SyncReport {
  return { id: crypto.randomUUID(), at: Date.now(), kind, trigger, ok: false, message: "", durationMs: 0, games: 0, collections: 0, imagesUploaded: 0, imagesDownloaded: 0, imagesPruned: 0, imagesMissing: 0, bytes: 0 };
}
async function log(r: SyncReport, t0: number): Promise<SyncReport> {
  r.durationMs = Math.round(performance.now() - t0);
  if (meta) { meta.history = [r, ...meta.history].slice(0, 25); await persist(); }
  return r;
}

/* ───────── push (this device -> Drive) ───────── */
export function push(opts: { trigger: "auto" | "manual"; force?: boolean }): Promise<SyncReport | undefined> {
  return exclusive<SyncReport | undefined>("push", async () => {
    const t0 = performance.now();
    const seq = dirtySeq;
    lastAttempt = Date.now();
    const rep = newReport("push", opts.trigger);
    try {
      progress("Signing in…");
      const tk = await auth(opts.trigger === "manual");
      progress("Checking Drive…");
      const files = await listFiles(tk);
      const snap = files.find((f) => f.name === SNAP);
      const slim = await db.get<AppData>("kv", KEY.data);
      if (!slim) { rep.message = "Nothing is saved on this device yet."; return log(rep, t0); }
      rep.games = slim.games.length;
      rep.collections = slim.collections?.length ?? 0;

      if (snap && !opts.force) {
        if (slim.games.length === 0) {
          set({ remote: await inspect(tk, files) }); publish();
          rep.message = "This device is empty, so nothing was uploaded. Restore from Drive instead.";
          return log(rep, t0);
        }
        if (snap.modifiedTime !== meta?.remoteModified) {
          set({ remote: await inspect(tk, files) }); publish();
          rep.message = "Drive changed since this device last synced (another device or session). Nothing was overwritten. Restore from Drive, or choose to overwrite it.";
          return log(rep, t0);
        }
      }
      if (!snap && slim.games.length === 0) { rep.ok = true; rep.message = "Nothing to back up yet."; return log(rep, t0); }

      const refs = [...refsOf(slim.games)];
      const have = new Set(files.map((f) => f.name));
      const missing = refs.filter((h) => !have.has(imgName(h)));
      let done = 0;
      await pool(missing, 3, async (h) => {
        progress(`Uploading images (${++done}/${missing.length})…`);
        const blob = await db.get<Blob>("images", h);
        if (!blob) { rep.imagesMissing++; return; }
        await uploadFile(tk, imgName(h), blob);
        rep.imagesUploaded++;
      });

      progress("Uploading library…");
      const payload = JSON.stringify({ format: FORMAT, app: "lost-in-sync-web", savedAt: Date.now(), device: meta?.deviceId, data: slim });
      const gz = await gzip(payload);
      rep.bytes = gz.size;
      const up = await uploadFile(tk, SNAP, gz, snap?.id);

      const keep = new Set(refs.map(imgName));
      const orphans = files.filter((f) => f.name.startsWith("img-") && !keep.has(f.name));
      await pool(orphans, 3, async (f) => { await deleteFile(tk, f.id); rep.imagesPruned++; });

      if (meta) {
        meta.remoteModified = up.modifiedTime;
        meta.lastSyncedAt = Date.now();
        meta.dirty = dirtySeq !== seq; // edits made during the upload stay pending
      }
      set({ remote: { exists: true, modifiedTime: up.modifiedTime, bytes: gz.size, games: rep.games, collections: rep.collections, images: refs.length, savedAt: Date.now(), device: meta?.deviceId.slice(0, 8) } });
      rep.ok = true;
      rep.message = `Backed up ${rep.games} games${rep.imagesUploaded ? ` and ${rep.imagesUploaded} new images` : ""}.`;
      return log(rep, t0);
    } catch (e) {
      if (e instanceof DriveError && e.kind === "auth" && opts.trigger === "auto") {
        set({ error: "Google needs you to sign in again. Open Cloud backup and press Reconnect." });
        return undefined; // quiet: no history spam
      }
      rep.message = errText(e);
      set({ error: rep.message });
      return log(rep, t0);
    }
  });
}

/* ───────── pull (Drive -> this device) ───────── */
export function pull(): Promise<AppData | undefined> {
  return exclusive("pull", async () => {
    const t0 = performance.now();
    const rep = newReport("pull", "manual");
    try {
      progress("Signing in…");
      const tk = await auth(true);
      progress("Reading Drive…");
      const files = await listFiles(tk);
      const snap = files.find((f) => f.name === SNAP);
      if (!snap) { rep.message = "There is no backup on this Google Drive yet."; set({ error: rep.message }); await log(rep, t0); return undefined; }

      progress("Downloading library…");
      const raw = await downloadFile(tk, snap.id);
      rep.bytes = raw.size;
      const parsed = JSON.parse(await gunzip(raw));
      if (parsed?.format !== FORMAT || !Array.isArray(parsed.data?.games)) throw new Error("The Drive backup is not in a readable format. Nothing was changed.");
      const slim = parsed.data as AppData;
      rep.games = slim.games.length;
      rep.collections = slim.collections?.length ?? 0;

      const refs = [...refsOf(slim.games)];
      const byName = new Map(files.map((f) => [f.name, f]));
      const need: string[] = [];
      for (const h of refs) if ((await db.count("images", h)) === 0) need.push(h);
      let done = 0;
      await pool(need, 3, async (h) => {
        progress(`Downloading images (${++done}/${need.length})…`);
        const f = byName.get(imgName(h));
        if (!f) { rep.imagesMissing++; return; }
        await db.put("images", h, await downloadFile(tk, f.id));
        rep.imagesDownloaded++;
      });

      await db.serial(() => db.put("kv", KEY.data, slim));
      const restored = await loadFromStore();
      if (meta) { meta.remoteModified = snap.modifiedTime; meta.lastSyncedAt = Date.now(); meta.dirty = false; }
      set({ remote: await inspect(tk, files) });
      await refreshLocal();
      rep.ok = true;
      rep.message = `Restored ${rep.games} games${rep.imagesDownloaded ? ` and ${rep.imagesDownloaded} images` : ""}.${rep.imagesMissing ? ` ${rep.imagesMissing} images were missing on Drive.` : ""}`;
      await log(rep, t0);
      return restored;
    } catch (e) {
      rep.message = errText(e);
      set({ error: rep.message });
      await log(rep, t0);
      return undefined;
    }
  });
}

/* ───────── check / connect / settings ───────── */
export function check(interactive = false): Promise<RemoteInfo | undefined> {
  return exclusive("check", async () => {
    try {
      progress("Checking Drive…");
      const tk = await auth(interactive);
      const info = await inspect(tk, await listFiles(tk));
      set({ remote: info });
      publish();
      return info;
    } catch (e) {
      // a silent check that needs sign-in is not an error: the panel shows "Reconnect" via needsAuth
      if (!(e instanceof DriveError && e.kind === "auth" && !interactive)) set({ error: errText(e) });
      return undefined;
    }
  });
}

export async function connect(): Promise<void> {
  if (!meta) return;
  try {
    const tk = await getToken(true);
    meta.connected = true;
    meta.email = await fetchEmail(tk);
    set({ needsAuth: false, error: undefined });
    await persist();
    startTimer();
  } catch (e) {
    set({ error: errText(e) });
    return;
  }
  await refreshLocal();
  const info = await check(false);
  if (info && !info.exists && state.local.games > 0) await push({ trigger: "manual" });
}

export async function disconnect(): Promise<void> {
  if (!meta) return;
  await forgetToken();
  meta.connected = false;
  meta.email = undefined;
  meta.remoteModified = undefined;
  if (timer) { clearInterval(timer); timer = undefined; }
  set({ remote: undefined, error: undefined, needsAuth: false });
  await persist();
}

export async function setIntervalMin(min: number) {
  if (!meta) return;
  meta.intervalMin = min;
  await persist();
}

/* ───────── automatic sync ───────── */
async function tick(onHide = false) {
  if (!meta?.connected || !meta.dirty || meta.intervalMin <= 0) return;
  if (state.busy || state.conflict || state.needsAuth || !navigator.onLine) return;
  if (!onHide && Date.now() - lastAttempt < meta.intervalMin * 60_000) return;
  await push({ trigger: "auto" });
}
function startTimer() {
  if (timer) return;
  timer = setInterval(() => void tick(), 30_000);
}

onDirty(() => {
  if (!meta) { earlyDirty = true; return; }
  meta.dirty = true;
  dirtySeq++;
  void persist();
  void refreshLocal();
});

export async function init(): Promise<void> {
  try {
    meta = (await db.get<Meta>("kv", KEY.meta)) ?? { connected: false, intervalMin: 5, dirty: false, deviceId: crypto.randomUUID(), history: [] };
    if (earlyDirty) { meta.dirty = true; dirtySeq++; }
    await refreshLocal();
    await persist();
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void tick(true); });
    if (meta.connected) {
      preloadGoogle();
      startTimer();
      void check(false); // silent: tells the panel what is on Drive without opening any popup
    }
  } catch (e) {
    set({ ready: true, error: `Cloud backup is unavailable: ${errText(e)}` });
  }
}
