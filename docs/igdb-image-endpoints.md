# IGDB Image Endpoints

> **Verified against source on 2026-11-19.** Desktop and web builds request some image sizes differently; both variants are documented below.

Image requests are transient metadata lookups used for display. The image inspector was removed from the add-game component; `igdb_images` now serves the game details media gallery and Discover detail views. It does not persist results unless the user imports a game.

## Endpoints

All requests are POST requests to `https://api.igdb.com/v4/{endpoint}` using the configured Client ID and a Twitch OAuth2 bearer token. The web build reaches these through the Cloudflare Worker at `POST {VITE_IGDB_PROXY_URL}/igdb/<endpoint>`.

The worker allow-list (`web/worker/src/index.ts:6-9`) is:

```text
games, game_time_to_beats, image_types, artworks, covers, screenshots,
popularity_primitives, collection_relations, collections, platforms
```

### `image_types`

```text
fields id,name;
limit 100;
```

Maps image-type reference IDs to names such as `Key art without logo`, `Key art with logo`, `Historical artwork`, `Concept art`, and `Artwork`.

### `games`

Game details (`igdb_details`) fetch metadata, cover, screenshots, videos, similar games, and company data:

```text
fields name,updated_at,summary,storyline,first_release_date,game_type.type,
game_status.status,franchises.name,genres.name,themes.name,
player_perspectives.name,platforms.name,total_rating,total_rating_count,
cover.image_id,screenshots.image_id,videos.video_id,videos.name,
similar_games.name,similar_games.cover.image_id,
involved_companies.developer,involved_companies.company.name;
where id = {game_id};
```

Background artwork priority: key art without logo → with logo → historical → concept → artwork → screenshot.

### `covers`

```text
fields image_id,image_type,width,height;
where game = {game_id};
limit 100;
```

### `artworks`

```text
fields image_id,image_type,width,height;
where game = {game_id};
limit 100;
```

### `screenshots`

```text
fields image_id,width,height;
where game = {game_id};
limit 100;
```

### `game_time_to_beats`

Used by `igdb_details` and `igdb_import_batch` to populate `timeMainSeconds`, `timeAvgSeconds`, and `timeFullSeconds`.

### Other endpoints

- `popularity_primitives` — used by the Trending feed (desktop).
- `collection_relations`, `collections` — franchise/series tree (`igdb_series`).
- `platforms` — full platform list for importers.

## Image URL format

```text
https://images.igdb.com/igdb/image/upload/t_{size}/{image_id}.jpg
```

### Sizes actually used

| Use | Desktop (`src-tauri/src/lib.rs`) | Web (`web/src/igdb.web.ts`) |
|---|---|---|
| Main cover | `cover_big_2x` | `cover_big` |
| Search result thumb | `cover_small` | `cover_small` |
| Background artwork | `1080p` | `1080p` |
| Gallery cover | `cover_big_2x` | `cover_big` |
| Gallery artwork | `1080p` | `1080p` |
| Screenshots | `screenshot_big` | `screenshot_big` |

**Known divergence:** the desktop main cover was increased to `cover_big_2x`, but the web client still uses `cover_big`. The older `720p` size is no longer used. Aligning these is a low-risk follow-up, but note it would change cached image URLs.

CSP in `src-tauri/tauri.conf.json:24` allows `images.igdb.com`, YouTube image hosts, and local `asset:` URLs.

## Discovery feeds

The active feed path is the `igdb_discover_feed` Tauri command (web equivalent in `web/src/igdb.web.ts`). It queries the `games` endpoint with per-feed `where`/`sort` clauses using the current Unix timestamp; `offset` is clamped to 0–90 and `limit` to 1–30. The UI loads 20 cards per feed and up to 100 in a "View all" page. The legacy `igdb_discover` command returns a 10-feed snapshot but is unused by the current UI.

Discovery cards use `total_rating` and `total_rating_count` (the legacy path still uses `rating`/`rating_count`), with `hypes` for anticipated games. Search uses `igdb_search` with the `/ ` exact-name syntax; selected results load through `igdb_details` without being saved until the user imports them.

All IGDB caches are bounded LRU maps with a 20-minute TTL (`src/data/igdb.ts:36-52`). Worker responses are `Cache-Control: no-store`; credentials travel in request headers only and are never persisted by the worker.
