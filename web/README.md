# Lost in Sync — web build

Lives in `web/` next to the offline app. **Nothing under `src/`, `src-tauri/` or the root config is modified.**
At build time `vite.config.ts` swaps three offline modules for web versions:

| Offline module | Web replacement |
|---|---|
| `src/data/repository.ts` | `web/src/repository.web.ts` (IndexedDB + encrypted key vault) |
| `src/data/igdb.ts` | `web/src/igdb.web.ts` (talks to the proxy instead of Tauri) |
| `src/features/settings-data.tsx` | `web/src/settings-data.web.tsx` (adds the Google Drive panel) |

## Run / build (from the project root)
```bash
cp web/.env.example web/.env.local          # fill in the two values below
npx vite --config web/vite.config.ts        # dev, http://localhost:5174
npx vite build --config web/vite.config.ts  # output: web/dist
```

## 1. IGDB proxy (Cloudflare Worker, free tier)
```bash
cd web/worker
# edit ALLOWED_ORIGINS in wrangler.toml (your site + http://localhost:5174)
npx wrangler deploy
```
Put the printed `https://….workers.dev` URL in `VITE_IGDB_PROXY_URL`.
Each user still enters their own IGDB Client ID/Secret in Settings; the worker stores nothing.

## 2. Google sign-in (OAuth) — one-time setup
1. console.cloud.google.com → new project → **APIs & Services → Library → enable "Google Drive API"**.
2. **OAuth consent screen** (External): add scopes `…/auth/drive.appdata` and `…/auth/userinfo.email`.
   While in "Testing" add yourself as a test user; publish when ready (both scopes are low-risk, no security audit).
3. **Credentials → Create OAuth client ID → Web application**. Authorized JavaScript origins:
   `http://localhost:5174` and your production URL. (No redirect URI is needed.)
4. Put the client ID in `VITE_GOOGLE_CLIENT_ID`. It is public by design; there is no client secret.

## 3. Deploy
Cloudflare Pages, build command `npx vite build --config web/vite.config.ts`, output directory `web/dist`.
Add the Pages URL to the worker's `ALLOWED_ORIGINS` and to the Google client's authorized origins.

## How data is protected / moved
- **IGDB keys**: encrypted (AES-GCM, non-extractable key) in IndexedDB. Never in the library record, the Drive snapshot or exported JSON.
- **Library**: IndexedDB is the working copy. Images are stored as blobs by hash, so saves stay small.
- **Drive**: a gzip snapshot + image files in the hidden app-only folder of the user's own Drive. Auto-sync only when something changed, at most once per chosen interval; never overwrites a newer remote silently.
- **Import / export**: identical JSON format to the offline app (images inline as data URIs), so a file moves both ways.
