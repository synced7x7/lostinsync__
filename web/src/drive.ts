// Google sign-in (Identity Services, token flow) + the few Drive REST calls we need.
// Everything is stored in the hidden, app-only "appDataFolder" of the user's own Drive.
const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
export const driveConfigured = !!CLIENT_ID;
const SCOPE = "https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email";
const FILES = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

export class DriveError extends Error {
  kind: "auth" | "quota" | "network" | "http";
  constructor(kind: DriveError["kind"], message: string) {
    super(message);
    this.kind = kind;
  }
}

export type RemoteFile = { id: string; name: string; size?: string; modifiedTime: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
let gis: Promise<any> | undefined;
function loadGis(): Promise<any> {
  gis ??= new Promise((resolve, reject) => {
    const w = window as any;
    if (w.google?.accounts?.oauth2) return resolve(w.google);
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve(w.google);
    s.onerror = () => { gis = undefined; reject(new DriveError("network", "Could not load Google sign-in. Check your connection.")); };
    document.head.appendChild(s);
  });
  return gis;
}
export const preloadGoogle = () => { if (driveConfigured) void loadGis().catch(() => undefined); };

let token: { value: string; exp: number } | undefined;
let pending: Promise<string> | undefined;

/** interactive=false never opens UI: it only succeeds if Google can renew silently. */
export function getToken(interactive: boolean): Promise<string> {
  if (!CLIENT_ID) return Promise.reject(new DriveError("auth", "Google sign-in is not configured (VITE_GOOGLE_CLIENT_ID)."));
  if (token && token.exp - 60_000 > Date.now()) return Promise.resolve(token.value);
  pending ??= loadGis()
    .then((g) => new Promise<string>((resolve, reject) => {
      const client = g.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (r: any) => {
          if (r.error || !r.access_token) return reject(new DriveError("auth", r.error_description || r.error || "Sign-in failed."));
          token = { value: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
          resolve(r.access_token);
        },
        error_callback: (e: any) =>
          reject(new DriveError("auth", e?.type === "popup_closed" ? "The sign-in window was closed." : e?.message || "Sign-in failed.")),
      });
      client.requestAccessToken({ prompt: interactive ? "" : "none" });
    }))
    .finally(() => { pending = undefined; });
  return pending;
}

export async function forgetToken(): Promise<void> {
  const t = token?.value;
  token = undefined;
  if (!t) return;
  try { (await loadGis()).accounts.oauth2.revoke(t, () => undefined); } catch { /* ignore */ }
}

async function api(tk: string, url: string, init: RequestInit = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${tk}` } });
  } catch {
    throw new DriveError("network", "Could not reach Google Drive. Check your connection.");
  }
  if (res.ok) return res;
  if (res.status === 401) { token = undefined; throw new DriveError("auth", "Google sign-in expired. Reconnect to continue."); }
  const text = await res.text().catch(() => "");
  if (res.status === 403 && /quota|storageQuotaExceeded/i.test(text)) throw new DriveError("quota", "Your Google Drive storage is full.");
  throw new DriveError("http", `Google Drive error ${res.status}.`);
}

export async function fetchEmail(tk: string): Promise<string | undefined> {
  try {
    const r = await api(tk, "https://www.googleapis.com/oauth2/v3/userinfo");
    return ((await r.json()) as { email?: string }).email;
  } catch { return undefined; }
}

export async function listFiles(tk: string): Promise<RemoteFile[]> {
  const out: RemoteFile[] = [];
  let page = "";
  do {
    const q = new URLSearchParams({ spaces: "appDataFolder", pageSize: "1000", fields: "nextPageToken,files(id,name,size,modifiedTime)" });
    if (page) q.set("pageToken", page);
    const j = (await (await api(tk, `${FILES}?${q}`)).json()) as { files?: RemoteFile[]; nextPageToken?: string };
    out.push(...(j.files ?? []));
    page = j.nextPageToken ?? "";
  } while (page);
  return out;
}

export async function uploadFile(tk: string, name: string, blob: Blob, existingId?: string): Promise<RemoteFile> {
  const boundary = "lis" + crypto.randomUUID().replace(/-/g, "");
  const meta = existingId ? { name } : { name, parents: ["appDataFolder"] };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
    `--${boundary}\r\nContent-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);
  const fields = "fields=id,name,size,modifiedTime";
  const url = existingId ? `${UPLOAD}/${existingId}?uploadType=multipart&${fields}` : `${UPLOAD}?uploadType=multipart&${fields}`;
  const res = await api(tk, url, {
    method: existingId ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return (await res.json()) as RemoteFile;
}

export const downloadFile = async (tk: string, id: string): Promise<Blob> =>
  (await api(tk, `${FILES}/${id}?alt=media`)).blob();

export const deleteFile = async (tk: string, id: string): Promise<void> => {
  await api(tk, `${FILES}/${id}`, { method: "DELETE" });
};

export async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}
export async function gunzip(blob: Blob): Promise<string> {
  return new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).text();
}
