# IGDB Image Endpoints

This documents the temporary image inspector and the image sources used by the
application. The inspector is intentionally non-persistent: it requests image
metadata for display only and does not add the results to the saved game data.

## Temporary image-fetch test

The temporary inspector was requested with the following test:

> TEMPORARY DEBUG
>
> ### All IGDB images
>
> Clear
> No image records returned.
>
> Image inspector: IGDB error 400 Bad Request

It is implemented by the `igdb_images` command. The inspector was removed from
the library/add-game component; the command is now used by the game details
gallery to load transient IGDB screenshots.

## Endpoints

All requests are POST requests to `https://api.igdb.com/v4/{endpoint}` and use
the configured Client ID and bearer token.

### `image_types`

```text
fields id,name;
limit 100;
```

Maps image-type reference IDs returned by covers and artworks to names such as
`Key art without logo`, `Key art with logo`, `Historical artwork`, `Concept art`,
and `Artwork`.

### `games`

The game details request fetches the game's metadata, its main `cover.image_id`,
and screenshot image IDs. The main cover is used for the portrait cover shown
on the game page.

```text
fields name,summary,first_release_date,game_type.type,game_status.status,
genres.name,platforms.name,total_rating,total_rating_count,cover.image_id,
screenshots.image_id,videos.video_id,videos.name,
involved_companies.developer,involved_companies.company.name;
where id = {game_id};
```

### `covers`

The temporary inspector fetches every cover record for the selected game:

```text
fields image_id,image_type,width,height;
where game = {game_id};
limit 100;
```

Cover images use the `cover_big` image size.

### `artworks`

The temporary inspector fetches every artwork record for the selected game:

```text
fields image_id,image_type,width,height;
where game = {game_id};
limit 100;
```

Background artwork is selected in this order:

1. Key art without logo
2. Key art with logo
3. Historical artwork
4. Concept art
5. Artwork
6. Screenshot

Selected artwork uses the `720p` image size.

### `screenshots`

The temporary inspector fetches every screenshot record for the selected game:

```text
fields image_id,width,height;
where game = {game_id};
limit 100;
```

Screenshots are used as the final background fallback and use the `720p` image
size in the inspector.

## Image URL format

```text
https://images.igdb.com/igdb/image/upload/t_{size}/{image_id}.jpg
```

The application uses `cover_big` for the main cover and `720p` for background
artwork and screenshots.

## Discovery feeds

The Discover tab uses the `igdb_discover` Tauri command. It queries the
`games` endpoint for popular, personalized, latest, upcoming, top-rated, and
anticipated games using the current Unix timestamp for release filtering.
Search continues to use `igdb_search`, including the existing `/ ` exact-name
syntax, while selected results load through `igdb_details` without persisting
them to the library.

Discovery cards use `total_rating` and `total_rating_count`; the UI displays
the score on a 10-point scale. Each feed initially loads 20 cards, while its
View all page loads batches of 30 on demand up to 100 cards. Detail responses
also include themes, player perspectives, storyline, and similar games for
contextual recommendations.
