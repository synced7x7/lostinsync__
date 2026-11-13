// Stateless IGDB proxy. It exists only because IGDB/Twitch block browser requests (CORS).
// It stores NOTHING: credentials arrive per request (headers, never the URL), are used once, and are discarded.
// Source is intentionally tiny so users can audit it.
export interface Env { ALLOWED_ORIGINS: string }

const ENDPOINTS = new Set([
  "games", "game_time_to_beats", "image_types", "artworks", "covers", "screenshots",
  "popularity_primitives", "collection_relations", "collections", "platforms",
]);
const ID_RE = /^[A-Za-z0-9]{10,64}$/;

// in-memory only (per isolate): access token cache keyed by a HASH of the credentials, plus a tiny abuse limiter
const tokens = new Map<string, { token: string; exp: number }>();
const hits = new Map<string, number[]>();

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function limited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > 40; // 40 requests / 10 s per IP
}

const json = (body: unknown, status: number, headers: HeadersInit) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "no-store" } });

async function accessToken(id: string, secret: string): Promise<string | null> {
  const k = await sha256(`${id}:${secret}`);
  const hit = tokens.get(k);
  if (hit && hit.exp > Date.now()) return hit.token;
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: "client_credentials" }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  if (tokens.size > 500) tokens.clear();
  tokens.set(k, { token: j.access_token, exp: Date.now() + Math.max(60, (j.expires_in ?? 3600) - 300) * 1000 });
  return j.access_token;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get("Origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean);
    const ok = allowed.includes(origin);
    const cors: HeadersInit = ok
      ? {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, X-Client-Id, X-Client-Secret",
          "Access-Control-Max-Age": "86400",
          Vary: "Origin",
        }
      : { Vary: "Origin" };

    if (req.method === "OPTIONS") return new Response(null, { status: ok ? 204 : 403, headers: cors });
    if (!ok) return json({ error: "Origin not allowed." }, 403, cors);

    const match = new URL(req.url).pathname.match(/^\/igdb\/([a-z_]+)$/);
    if (req.method !== "POST" || !match || !ENDPOINTS.has(match[1])) return json({ error: "Not found." }, 404, cors);
    if (limited(req.headers.get("CF-Connecting-IP") ?? "unknown")) return json({ error: "Too many requests. Slow down." }, 429, cors);

    const id = (req.headers.get("X-Client-Id") ?? "").trim();
    const secret = (req.headers.get("X-Client-Secret") ?? "").trim();
    if (!ID_RE.test(id) || !ID_RE.test(secret)) return json({ error: "Missing or malformed IGDB credentials." }, 401, cors);

    const query = await req.text();
    if (query.length > 6000) return json({ error: "Query too large." }, 413, cors);

    let token = await accessToken(id, secret);
    if (!token) return json({ error: "IGDB login failed. Check your Client ID and Secret in Settings." }, 401, cors);

    const call = (t: string) =>
      fetch(`https://api.igdb.com/v4/${match[1]}`, {
        method: "POST",
        headers: { "Client-ID": id, Authorization: `Bearer ${t}`, "Content-Type": "text/plain" },
        body: query,
      });
    let up = await call(token);
    if (up.status === 401) { // token revoked/expired early: refresh once
      tokens.delete(await sha256(`${id}:${secret}`));
      token = await accessToken(id, secret);
      if (!token) return json({ error: "IGDB rejected the credentials. Check Settings." }, 401, cors);
      up = await call(token);
    }
    if (up.status === 401) return json({ error: "IGDB rejected the credentials. Check Settings." }, 401, cors);
    if (up.status === 429) return json({ error: "IGDB rate limit reached. Try again in a moment." }, 429, cors);
    if (!up.ok) return json({ error: `IGDB error ${up.status}` }, 502, cors);
    return new Response(up.body, { status: 200, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
  },
};
