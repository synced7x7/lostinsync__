# Database Schema & Data Model

Lost in Sync uses an offline-first storage model. On desktop (Tauri 2), data is persisted to a local SQLite database file named `lost-in-sync.sqlite` located in the application data directory (`%APPDATA%/com.lostinsync.desktop/` on Windows).

## Storage Architecture

While the schema is evolving, the application state is serialized as a single, strongly-typed JSON document stored in an `app_state` table. Schema migrations are tracked in `schema_migrations`.

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

On browser / web development builds, persistence gracefully falls back to `localStorage` with identical schema serialization through the `AppRepository` interface.

---

## TypeScript Domain Models

### `AppData` (Root document)
The entire state tree serialized to SQLite:

```typescript
export type AppData = {
  games: Game[];
  profile: Profile;
  settings: AppSettings;
  collections?: CustomCollection[];
};
```

---

### `Game` Model
Defined in `src/domain/game.ts`:

```typescript
export type Game = {
  id: string;
  title: string;
  genre: string;
  platform: string;
  status: GameStatus;              // 'Playing' | 'Completed' | 'Backlog' | 'Wishlist' | 'Shelved' | 'Abandoned' | 'On hold'
  totalSeconds: number;
  lastPlayed: string;              // ISO-8601 date string
  rating: number;                  // 0 to 5 (half-star granularity)
  cover?: string;                  // URL or local asset path
  backgroundCover?: string;        // 1080p hero artwork URL
  favorite?: boolean;
  notes?: string;
  startedAt?: string;              // YYYY-MM-DD
  finishedAt?: string;             // YYYY-MM-DD
  platinumed?: boolean;            // 100% completion / Platinum trophy
  order?: number;

  // IGDB enriched metadata
  igdbId?: number;
  developer?: string;
  releaseDate?: string;            // YYYY-MM-DD
  description?: string;
  genres?: string[];
  platforms?: string[];
  playedPlatforms?: string[];
  emulatedOn?: string[];
  igdbRating?: number;             // 0 to 100
  igdbRatingCount?: number;
  timeAvgSeconds?: number;         // Time to beat (Normally)
  timeMainSeconds?: number;        // Time to beat (Main story)
  timeFullSeconds?: number;        // Time to beat (Completionist)
  themes?: string[];
  playerPerspectives?: string[];
  gameType?: string;               // Main game, DLC, Remake, Remaster, Bundle
  gameStatus?: string;             // Released, Alpha, Early Access, Cancelled
};
```

---

### `Profile` Model

```typescript
export type Profile = {
  username: string;
  bio: string;
  avatarUrl: string;
  joinedDate: string;
};
```

---

### `AppSettings` Model

```typescript
export type AppSettings = {
  theme: "dark";
  defaultView: "library" | "dashboard" | "journey" | "trophies" | "discover" | "stats";
  librarySort: "title" | "playtime" | "rating" | "recent" | "released";
  libraryFilter: "all" | GameStatus;
  gridSize: "compact" | "normal" | "large";
  layoutMode: "grid" | "list";
  journeyRange?: "all" | "month" | number;
  journeyZoom?: number;
  journeyFit?: boolean;
  igdbClientId?: string;
  igdbClientSecret?: string;
  syncInterval?: number;
};
```

---

### `CustomCollection` Model

```typescript
export type CustomCollection = {
  id: string;
  name: string;
  description: string;
  coverImage?: string;
  gameIds: string[];
  createdAt: string;
};
```

---

## Backup & Portability

The entire database state can be exported from the **Settings** view as a portable `.json` backup file and re-imported into another installation or environment.
