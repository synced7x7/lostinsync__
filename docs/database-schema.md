# Database Schema & Data Model

> **Verified against source on 2026-11-19.** The persisted "database" is a single JSON document (`AppData`) stored in one SQLite row on desktop, in `localStorage` in browser dev mode, and in IndexedDB in the web build. There are **no per-game tables, no foreign keys, and no relations**. Additive TypeScript fields therefore need no SQL migration.

Lost in Sync uses an offline-first storage model. On desktop (Tauri v2), data is persisted to a local SQLite database file named `lost-in-sync.sqlite` in the application data directory (`%APPDATA%/com.lostinsync.desktop/` on Windows).

## Storage Architecture

State is serialized as one JSON document into the `app_state` table. Migrations are tracked in `schema_migrations`. The exact DDL from `src-tauri/src/lib.rs:73-97` is:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data_json TEXT NOT NULL
);
```

Notes:

- There is **no `updated_at` column** on `app_state` and **no SQL default** on `applied_at`; the migration writes an ISO-8601 timestamp with `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`.
- Only migration version **1** is checked/inserted. There is no generic migration runner; the typed Rust structs `Game`, `Profile`, `Settings`, `AppData` near the top of `lib.rs` are unused dead code — the commands accept `serde_json::Value`.
- The only queries are the DDL above, `SELECT data_json FROM app_state WHERE id = 1` (`lib.rs:104-105`), the version check (`lib.rs:85-89`), and the UPSERT `INSERT INTO app_state (id, data_json) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json` (`lib.rs:118-123`).
- All filtering, sorting, and aggregation happens in TypeScript, not SQL.

### Persistence per platform

| Platform | Adapter | Location |
|---|---|---|
| Tauri desktop | `TauriAppRepository` (`src/data/repository.ts:81`) | SQLite `app_state.data_json`; images externalized to `<app_data>/images/` as `img:<hash-ext>` refs |
| Vite browser dev | `LocalAppRepository` (`src/data/repository.ts:18`) | `localStorage["lost-in-sync.data"]` |
| Web build | `web/src/repository.web.ts` | IndexedDB database `lostinsync-web` v1, stores `kv` and `images` |

Web IndexedDB schema (`web/src/db.ts:1-21`):

- `kv` — keys: `data`, `sync.meta`, `vault.key`, `vault.creds` (`KEY` at `db.ts:3`).
- `images` — SHA-256-keyed `Blob`s (`web/src/codec.ts`).
- Writes are serialized through `serial()` (`db.ts:44`) so a restore cannot interleave with a save.
- IGDB credentials are encrypted with a non-extractable AES-GCM key (`web/src/vault.ts`) and are stripped from the library, exports, and Drive snapshots.

---

## TypeScript Domain Models

All models are defined in `src/domain/game.ts` and are the authoritative schema.

### `AppData` (root document, `game.ts:50`)

```typescript
export type AppData = {
  games: Game[];
  profile: Profile;
  settings: AppSettings;
  collections?: Collection[];
};
```

### `Game` (`game.ts:6-21`)

```typescript
export type Game = {
  // Identity / user-owned tracking
  id: string; title: string; platform: string; genre: string; tags: string[];
  status: Status;                 // see STATUSES below
  notes: string;                  // required string (may be empty)
  rating?: number;                // 1–10 scale, half-star granularity
  platinumed?: boolean; favorite: boolean;
  cover?: string; backgroundCover?: string;
  totalSeconds: number;           // user-recorded playtime in seconds
  activeSince?: string; createdAt: string;
  startedAt?: string; finishedAt?: string;

  // IGDB-enriched metadata
  developer?: string; releaseDate?: string; description?: string;
  genres?: string[]; platforms?: string[]; igdbId?: number;
  igdbRating?: number; igdbRatingCount?: number;
  timeAvgSeconds?: number; timeMainSeconds?: number; timeFullSeconds?: number;
  playedPlatforms?: string[]; emulatedOn?: string[];
  screenshots?: string[]; videos?: { id: string; name?: string }[];
  igdbImages?: IgdbDebugImage[]; igdbVideos?: { id: string; name?: string }[];
  gameType?: string; gameStatus?: string; franchises?: string[];
  themes?: string[]; playerPerspectives?: string[];
  igdbUpdatedAt?: number; backloggdId?: string; bundleGames?: BundleGame[];
};
```

Supporting types:

```typescript
export const STATUSES = ["Backlog", "Wishlist", "Playing", "Completed",
                         "Shelved", "Abandoned", "On hold"] as const;
export type Status = typeof STATUSES[number];
export type BundleGame = { id: number; name: string; cover?: string; releaseTs?: number };
```

**Fields that do NOT exist** (often assumed): `lastPlayed`, `playedAt`, `order`, `priority`, `played`, ownership/store/medium fields, price/payment fields, and per-session play logs. `rating` is 1–10, not 0–5. `favorite` and `notes` are required (non-optional) fields.

### `Profile` (`game.ts:24`)

```typescript
export type Profile = {
  displayName: string; bio: string; accent: string;
  picture?: string; topFive?: string[];
};
```

### `AppSettings` (`game.ts:29-47`)

```typescript
export type AppSettings = {
  theme: "aurora";                 // literal; only one theme exists
  defaultView: View | "grid" | "list";
  libraryLayout: "ps4" | "catalog";
  libraryFullscreen: boolean;
  gridSize: "sm" | "md" | "lg";
  librarySort: "recent" | "completion" | "playtime" | "rating" | "igdbRating"
             | "title" | "releaseDate" | "avgTime" | "mainTime" | "fullTime";
  librarySortDirection: "asc" | "desc";
  libraryFilter: Status | "All";
  libraryGenre: string;
  libraryFavoritesOnly: boolean;
  journeyRange?: "all" | "month" | number;   // declared but currently unused
  journeyZoom?: number;                      // declared but currently unused
  journeyFit?: boolean;                      // declared but currently unused
  igdbClientId?: string; igdbClientSecret?: string;
  lastIgdbSyncAt?: string; libraryGameType?: string;
};
```

`defaultData` is at `game.ts:61-77`. Repository loading merges saved data over these defaults (`src/data/repository.ts:23` and `:89-93`), and `normalizeStatuses()` (`:8-16`) maps legacy `Played`/`Completed` variants into the current statuses.

### `Collection` (`game.ts:48-50`)

```typescript
export type CollectionItem = { igdbId?: number; gameId?: string; name: string; cover?: string };
export type Collection = { id: string; name: string; description?: string; items: CollectionItem[]; image?: string };
```

---

## Relationships

There are no SQL relationships. Application-level links are:

- `Collection.items[]` references games by `gameId` or `igdbId` (plus a denormalized `name`/`cover`).
- `Game.bundleGames[]` embeds IGDB bundle/edition contents.
- `Game.franchises[]` holds IGDB franchise names; the series tree is fetched on demand via `igdb_series`, not stored.
- Image files are referenced through `img:<filename>` strings and resolved to `asset://` URLs on load (`src/data/repository.ts`).

---

## Persistence Strategy & Defaults

- Desktop images are externalized: a `data:image/...` URI is written to `<app_data>/images/<hash>-<len>.<ext>` and the record stores an `img:` reference. Legacy embedded images are migrated on load (`src/data/repository.ts:58-105`). There is no image-deletion/orphan-cleanup command.
- Every mutation serializes the whole `AppData` and writes one row (500 ms debounce in `src/main.tsx:164-197`). This is the main scalability constraint of the current design.
- New optional fields are backward compatible automatically: add them to the type and to `defaultData`; old saved documents simply lack them. No SQL migration is required.
- User-owned fields (status, rating, notes, playtime, any new fields such as priority/ownership/price) must **never** be added to the IGDB sync allow-list `FIELDS` in `src/data/sync.ts:28-47`.

## Backup & Portability

From the **Settings → Data** view (`src/features/settings-data.tsx`):

- **JSON export** — full portable document with images inlined as data URIs; IGDB credentials are stripped (`:70-72`).
- **JSON import** — destructive replace of the library; current IGDB credentials are preserved from settings (`:97`).
- **CSV export** — fixed header: `Title, Status, Rating, Platform, Genres, Developer, Release date, Started, Finished, Total hours, Favorite` (`:29-37`), BOM-prefixed and RFC-style quoted.
- **Backloggd import** — CSV adapter in `src/data/backloggd.ts` (already implemented despite older roadmap claims).
- **IGDB metadata sync** — `src/data/sync.ts` refreshes only IGDB-owned fields.
- **Web only** — Google Drive backup snapshot `lost-in-sync.snapshot.json.gz`, format version 1 (`web/src/sync.ts:14-16`), with conflict detection via `remote.modifiedTime`. Credentials are never included.
