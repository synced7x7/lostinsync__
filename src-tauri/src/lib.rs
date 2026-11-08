#![allow(dead_code)]

use rusqlite::{ Connection, OptionalExtension, params };
use serde::{ Deserialize, Serialize };
use std::sync::Mutex;
use std::time::{ Duration, Instant };
use tauri::Manager;
use serde_json::{ json, Value };
use std::collections::HashSet;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Game {
    id: String,
    title: String,
    platform: String,
    genre: String,
    tags: Vec<String>,
    status: String,
    notes: String,
    rating: Option<i64>,
    mastery: Option<i64>,
    favorite: bool,
    cover: Option<String>,
    #[serde(default)]
    background_cover: Option<String>,
    total_seconds: i64,
    active_since: Option<String>,
    created_at: String,
    started_at: Option<String>,
    finished_at: Option<String>,

    #[serde(default)]
    videos: Vec<Video>,
    #[serde(default)]
    screenshots: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Video {
    id: String,
    name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Profile {
    display_name: String,
    bio: String,
    accent: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Settings {
    theme: String,
    default_view: String,
    timer_sound: bool,
    automatic_tracking: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AppData {
    games: Vec<Game>,
    profile: Profile,
    settings: Settings,
}

struct Database(Mutex<Connection>);

fn migrate(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         CREATE TABLE IF NOT EXISTS schema_migrations (
           version INTEGER PRIMARY KEY NOT NULL,
           applied_at TEXT NOT NULL
         );
         CREATE TABLE IF NOT EXISTS app_state (
           id INTEGER PRIMARY KEY CHECK (id = 1),
           data_json TEXT NOT NULL
         );"
    )?;
    let applied: i64 = connection.query_row(
        "SELECT COUNT(*) FROM schema_migrations WHERE version = 1",
        [],
        |row| row.get(0)
    )?;
    if applied == 0 {
        connection.execute_batch(
            "INSERT INTO schema_migrations (version, applied_at)
             VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));"
        )?;
    }
    Ok(())
}

#[tauri::command]
fn load_app_data(
    database: tauri::State<'_, Database>
) -> Result<Option<serde_json::Value>, String> {
    let connection = database.0.lock().map_err(|_| "Database lock failed".to_string())?;
    let json: Option<String> = connection
        .query_row("SELECT data_json FROM app_state WHERE id = 1", [], |row| { row.get(0) })
        .optional()
        .map_err(|error| error.to_string())?;
    json.map(|value| serde_json::from_str(&value).map_err(|error| error.to_string())).transpose()
}

#[tauri::command]
fn save_app_data(
    database: tauri::State<'_, Database>,
    data: serde_json::Value
) -> Result<(), String> {
    let connection = database.0.lock().map_err(|_| "Database lock failed".to_string())?;
    let json = serde_json::to_string(&data).map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO app_state (id, data_json) VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json",
            params![json]
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

struct IgdbAuth(tauri::async_runtime::Mutex<Option<(String, Instant)>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IgdbHit {
    id: i64,
    name: String,
    release_ts: Option<i64>,
    developer: Option<String>,
    cover: Option<String>,
    game_type: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IgdbVideo {
    video_id: String,
    name: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct IgdbGame {
    id: i64,
    name: String,
    developer: Option<String>,
    release_ts: Option<i64>,
    description: Option<String>,
    genres: Vec<String>,
    platforms: Vec<String>,
    rating: Option<i64>,
    rating_count: Option<i64>,
    time_avg: Option<i64>,
    time_main: Option<i64>,
    time_full: Option<i64>,
    cover: Option<String>,
    background: Option<String>,
    videos: Vec<IgdbVideo>,
    screenshots: Vec<String>,
    game_type: Option<String>,
    game_status: Option<String>,
    franchises: Vec<String>,
    themes: Vec<String>,
    player_perspectives: Vec<String>,
    storyline: Option<String>,
    similar_games: Vec<Value>,
    updated_at: Option<i64>,
}

fn discover_query(fields: &str, where_clause: &str, sort: &str) -> String {
    format!("fields {fields}; where {where_clause}; sort {sort}; limit 20;")
}

async fn trending_games(
    auth: &IgdbAuth,
    fields: &str,
    offset: i64,
    limit: i64,
    client_id: &str,
    secret: &str
) -> Result<Vec<Value>, String> {
    let pop = igdb_post(
        auth,
        "popularity_primitives",
        format!(
            "fields game_id,value; where popularity_type = 1; sort value desc; limit {limit}; offset {offset};"
        ),
        client_id,
        secret
    ).await?;
    let ids: Vec<i64> = pop
        .as_array()
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|p| p["game_id"].as_i64())
        .collect();
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let games = igdb_post(
        auth,
        "games",
        format!("fields {fields}; where id = ({}); limit {};", idlist(&ids), ids.len()),
        client_id,
        secret
    ).await?;
    let rows = games.as_array().cloned().unwrap_or_default();
    // "where id = (...)" loses ordering, so restore the popularity order
    Ok(
        ids
            .iter()
            .filter_map(|id|
                rows
                    .iter()
                    .find(|g| g["id"].as_i64() == Some(*id))
                    .cloned()
            )
            .collect()
    )
}

fn discover_games(rows: &Value) -> Vec<Value> {
    rows.as_array().cloned().unwrap_or_default()
}

fn discover_item(g: &Value) -> Value {
    json!({
        "id": g["id"], "name": g["name"], "cover": g["cover"]["image_id"].as_str().map(|i| img(i, "cover_big")),
        "releaseTs": g["first_release_date"], "rating": g["total_rating"], "ratingCount": g["total_rating_count"],
        "hypes": g["hypes"], "follows": g["follows"], "summary": g["summary"]
    })
}

fn img(id: &str, size: &str) -> String {
    format!("https://images.igdb.com/igdb/image/upload/t_{size}/{id}.jpg")
}

fn developer_of(v: &Value) -> Option<String> {
    let list = v["involved_companies"].as_array()?;
    let pick = list
        .iter()
        .find(|c| c["developer"].as_bool() == Some(true))
        .or(list.first())?;
    pick["company"]["name"].as_str().map(String::from)
}

fn names(v: &Value) -> Vec<String> {
    v.as_array()
        .map(|a|
            a
                .iter()
                .filter_map(|x| x["name"].as_str().map(String::from))
                .collect()
        )
        .unwrap_or_default()
}

fn first_image_id(v: &Value) -> Option<&str> {
    v.as_array()?
        .iter()
        .find_map(|artwork| artwork["image_id"].as_str())
}

fn image_type_name(image_type: &Value, image_types: &Value) -> Option<String> {
    if let Some(name) = image_type["name"].as_str() {
        return Some(name.to_string());
    }
    let type_id = image_type.as_i64()?;
    image_types
        .as_array()?
        .iter()
        .find(|item| item["id"].as_i64() == Some(type_id))
        .and_then(|item| item["name"].as_str())
        .map(String::from)
}

fn preferred_artwork_id<'a>(artworks: &'a Value, image_types: &Value) -> Option<&'a str> {
    let priorities = [
        "key art without logo",
        "key art with logo",
        "historical artwork",
        "concept art",
        "artwork",
    ];
    for priority in priorities {
        if
            let Some(image_id) = artworks
                .as_array()?
                .iter()
                .find_map(|artwork| {
                    let name = image_type_name(&artwork["image_type"], image_types)?;
                    (name.to_ascii_lowercase() == priority)
                        .then(|| artwork["image_id"].as_str())
                        .flatten()
                })
        {
            return Some(image_id);
        }
    }
    None
}

async fn igdb_token(auth: &IgdbAuth, client_id: &str, secret: &str) -> Result<String, String> {
    let mut guard = auth.0.lock().await;
    if let Some((token, expires)) = guard.as_ref() {
        if Instant::now() < *expires {
            return Ok(token.clone());
        }
    }
    let res = reqwest::Client
        ::new()
        .post("https://id.twitch.tv/oauth2/token")
        .query(
            &[
                ("client_id", client_id),
                ("client_secret", secret),
                ("grant_type", "client_credentials"),
            ]
        )
        .send().await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err("IGDB login failed. Check your Client ID and Secret in Settings.".into());
    }
    let body: Value = res.json().await.map_err(|e| e.to_string())?;
    let token = body["access_token"].as_str().ok_or("No token returned")?.to_string();
    let secs = body["expires_in"].as_u64().unwrap_or(3600).saturating_sub(300);
    *guard = Some((token.clone(), Instant::now() + Duration::from_secs(secs)));
    Ok(token)
}

async fn igdb_post(
    auth: &IgdbAuth,
    endpoint: &str,
    body: String,
    client_id: &str,
    secret: &str
) -> Result<Value, String> {
    let token = igdb_token(auth, client_id, secret).await?;
    let res = reqwest::Client
        ::new()
        .post(format!("https://api.igdb.com/v4/{endpoint}"))
        .header("Client-ID", client_id)
        .bearer_auth(token)
        .body(body)
        .send().await
        .map_err(|e| e.to_string())?;
    if res.status().as_u16() == 401 {
        *auth.0.lock().await = None;
        return Err("IGDB rejected the credentials. Check Settings.".into());
    }
    if !res.status().is_success() {
        return Err(format!("IGDB error {}", res.status()));
    }
    res.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn igdb_search(
    auth: tauri::State<'_, IgdbAuth>,
    query: String,
    client_id: String,
    client_secret: String
) -> Result<Vec<IgdbHit>, String> {
    let id_query = query
        .strip_prefix("& ")
        .map(str::trim)
        .filter(|value|
            value
                .parse::<i64>()
                .ok()
                .filter(|id| *id > 0)
                .is_some()
        );
    let strict_query = query
        .strip_prefix("/ ")
        .map(str::trim)
        .filter(|q| !q.is_empty());
    let q = strict_query.unwrap_or(query.trim()).replace('\\', "\\\\").replace('"', "\\\"");
    let body = if let Some(id) = id_query {
        format!(
            "fields name,first_release_date,game_type.type,cover.image_id,involved_companies.developer,involved_companies.company.name; where id = {id}; limit 1;"
        )
    } else if strict_query.is_some() {
        format!(
            "fields name,first_release_date,game_type.type,cover.image_id,involved_companies.developer,involved_companies.company.name; where version_parent = null & name = \"{q}\"; limit 50;"
        )
    } else {
        format!(
            "search \"{q}\"; fields name,first_release_date,game_type.type,cover.image_id,involved_companies.developer,involved_companies.company.name; where version_parent = null; limit 8;"
        )
    };
    let rows = igdb_post(&auth, "games", body, &client_id, &client_secret).await?;
    Ok(
        rows
            .as_array()
            .map(|a| {
                a.iter()
                    .filter(|g| (
                        if id_query.is_some() {
                            g["id"].as_i64().is_some()
                        } else {
                            strict_query
                                .map(|strict| g["name"].as_str() == Some(strict))
                                .unwrap_or(true)
                        }
                    ))
                    .map(|g| IgdbHit {
                        id: g["id"].as_i64().unwrap_or(0),
                        name: g["name"].as_str().unwrap_or("").to_string(),
                        release_ts: g["first_release_date"].as_i64(),
                        developer: developer_of(g),
                        cover: g["cover"]["image_id"].as_str().map(|i| img(i, "cover_small")),
                        game_type: g["game_type"]["type"].as_str().map(String::from),
                    })
                    .collect()
            })
            .unwrap_or_default()
    )
}

#[tauri::command]
async fn igdb_details(
    auth: tauri::State<'_, IgdbAuth>,
    id: i64,
    client_id: String,
    client_secret: String
) -> Result<IgdbGame, String> {
    let body = format!(
        "fields name,updated_at,summary,storyline,first_release_date,game_type.type,game_status.status,franchises.name,genres.name,themes.name,player_perspectives.name,platforms.name,total_rating,total_rating_count,cover.image_id,screenshots.image_id,videos.video_id,videos.name,similar_games.name,similar_games.cover.image_id,involved_companies.developer,involved_companies.company.name; where id = {id};"
    );
    let rows = igdb_post(&auth, "games", body, &client_id, &client_secret).await?;
    let g = rows.get(0).ok_or("Game not found on IGDB.")?;
    let ttb = igdb_post(
        &auth,
        "game_time_to_beats",
        format!("fields hastily,normally,completely; where game_id = {id};"),
        &client_id,
        &client_secret
    ).await.unwrap_or(Value::Null);
    let t = ttb.get(0).cloned().unwrap_or(Value::Null);
    let image_types = igdb_post(
        &auth,
        "image_types",
        "fields id,name; limit 100;".to_string(),
        &client_id,
        &client_secret
    ).await?;
    let artworks = igdb_post(
        &auth,
        "artworks",
        format!("fields image_id,image_type; where game = {id}; limit 100;"),
        &client_id,
        &client_secret
    ).await?;
    let background_id = preferred_artwork_id(&artworks, &image_types)
        .or_else(|| first_image_id(&artworks))
        .or_else(|| g["screenshots"][0]["image_id"].as_str());
    let videos: Vec<IgdbVideo> = g["videos"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| {
                    Some(IgdbVideo {
                        video_id: v["video_id"].as_str()?.to_string(),
                        name: v["name"].as_str().map(String::from),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let screenshots: Vec<String> = g["screenshots"]
        .as_array()
        .map(|a|
            a
                .iter()
                .filter_map(|s| s["image_id"].as_str().map(|i| img(i, "screenshot_big")))
                .collect()
        )
        .unwrap_or_default();
    Ok(IgdbGame {
        id,
        name: g["name"].as_str().unwrap_or("").to_string(),
        developer: developer_of(g),
        release_ts: g["first_release_date"].as_i64(),
        description: g["summary"].as_str().map(String::from),
        genres: names(&g["genres"]),
        platforms: names(&g["platforms"]),
        rating: g["total_rating"].as_f64().map(|r| r.round() as i64),
        rating_count: g["total_rating_count"].as_i64(),
        time_avg: t["normally"].as_i64(),
        time_main: t["hastily"].as_i64(),
        time_full: t["completely"].as_i64(),
        cover: g["cover"]["image_id"].as_str().map(|i| img(i, "cover_big")),
        background: background_id.map(|i| img(i, "1080p")),
        videos,
        screenshots,
        game_type: g["game_type"]["type"].as_str().map(String::from),
        game_status: g["game_status"]["status"].as_str().map(String::from),
        franchises: names(&g["franchises"]),
        themes: names(&g["themes"]),
        player_perspectives: names(&g["player_perspectives"]),
        storyline: g["storyline"].as_str().map(String::from),
        similar_games: g["similar_games"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(
                |game|
                    json!({
            "id": game["id"], "name": game["name"],
            "cover": game["cover"]["image_id"].as_str().map(|i| img(i, "cover_big"))
        })
            )
            .collect(),
        updated_at: g["updated_at"].as_i64(),
    })
}

#[tauri::command]
async fn igdb_images(
    auth: tauri::State<'_, IgdbAuth>,
    id: i64,
    client_id: String,
    client_secret: String
) -> Result<Value, String> {
    let image_types = igdb_post(
        &auth,
        "image_types",
        "fields id,name; limit 100;".to_string(),
        &client_id,
        &client_secret
    ).await?;
    let type_name = |image_type: &Value| -> Option<String> {
        if let Some(name) = image_type["name"].as_str() {
            return Some(name.to_string());
        }

        let type_id = image_type.as_i64()?;
        image_types
            .as_array()?
            .iter()
            .find(|item| item["id"].as_i64() == Some(type_id))
            .and_then(|item| item["name"].as_str())
            .map(String::from)
    };
    let mut images = Vec::new();
    for (endpoint, category, fields) in [
        ("covers", "cover", "image_id,image_type,width,height"),
        ("artworks", "artwork", "image_id,image_type,width,height"),
        ("screenshots", "screenshot", "image_id,width,height"),
    ] {
        let rows = igdb_post(
            &auth,
            endpoint,
            format!("fields {fields}; where game = {id}; limit 100;"),
            &client_id,
            &client_secret
        ).await?;
        for image in rows.as_array().cloned().unwrap_or_default() {
            let image_id = match image["image_id"].as_str() {
                Some(value) => value,
                None => {
                    continue;
                }
            };
            images.push(
                json!({
                "category": category,
                "imageId": image_id,
                "imageType": type_name(&image["image_type"]),
                "url": img(image_id, if category == "cover" { "cover_big" } else { "1080p" }),
                "width": image["width"],
                "height": image["height"],
            })
            );
        }
    }
    Ok(Value::Array(images))
}

#[tauri::command]
async fn igdb_discover(
    auth: tauri::State<'_, IgdbAuth>,
    preferred_genres: Vec<String>,
    client_id: String,
    client_secret: String
) -> Result<Value, String> {
    let now = std::time::SystemTime
        ::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs() as i64;
    let fields =
        "name,summary,first_release_date,rating,rating_count,total_rating,total_rating_count,hypes,follows,cover.image_id";
    let genre_filter = preferred_genres
        .iter()
        .take(3)
        .filter_map(|genre| {
            let value = genre.trim().replace('\\', "\\\\").replace('"', "\\\"");
            (!value.is_empty()).then(|| format!("genres.name = \"{value}\""))
        })
        .collect::<Vec<_>>()
        .join(" | ");
    let for_you_where = if genre_filter.is_empty() {
        "rating != null & rating_count > 25".to_string()
    } else {
        format!("({genre_filter}) & rating != null")
    };
    let queries = [
        (
            "popular",
            discover_query(fields, "total_rating_count != null", "total_rating_count desc"),
        ),
        ("forYou", discover_query(fields, &for_you_where, "total_rating desc")),
        (
            "latest",
            discover_query(
                fields,
                &format!("first_release_date <= {now}"),
                "first_release_date desc"
            ),
        ),
        (
            "upcoming",
            discover_query(
                fields,
                &format!("first_release_date > {now}"),
                "first_release_date asc"
            ),
        ),
        (
            "topRated",
            discover_query(
                fields,
                "total_rating != null & total_rating_count > 1500",
                "total_rating desc"
            ),
        ),
        (
            "anticipated",
            discover_query(
                fields,
                &format!("first_release_date > {now} & hypes != null"),
                "hypes desc"
            ),
        ),
        (
            "hiddenGems",
            discover_query(
                fields,
                "total_rating != null & total_rating_count > 10 & total_rating_count < 500",
                "total_rating desc"
            ),
        ),
        (
            "indie",
            discover_query(
                fields,
                "involved_companies.company != null & genres != null",
                "total_rating desc"
            ),
        ),
        (
            "story",
            discover_query(fields, "storyline != null & themes != null", "total_rating desc"),
        ),
    ];
    let mut result = serde_json::Map::new();
    let mut result = serde_json::Map::new();
    for (name, query) in queries {
        let rows = igdb_post(&auth, "games", query, &client_id, &client_secret).await?;
        result.insert(
            name.to_string(),
            Value::Array(discover_games(&rows).iter().map(discover_item).collect())
        );
    }
    let trending = trending_games(&auth, fields, 0, 20, &client_id, &client_secret).await?;
    result.insert(
        "trending".to_string(),
        Value::Array(trending.iter().map(discover_item).collect())
    );

    Ok(Value::Object(result))
}

#[tauri::command]
async fn igdb_discover_feed(
    auth: tauri::State<'_, IgdbAuth>,
    feed: String,
    preferred_genres: Vec<String>,
    offset: i64,
    limit: i64,
    client_id: String,
    client_secret: String
) -> Result<Value, String> {
    let now = std::time::SystemTime
        ::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs() as i64;
    let genres = preferred_genres
        .iter()
        .take(3)
        .filter_map(|genre| {
            let value = genre.trim().replace('\\', "\\\\").replace('"', "\\\"");
            (!value.is_empty()).then(|| format!("genres.name = \"{value}\""))
        })
        .collect::<Vec<_>>()
        .join(" | ");
    let for_you = if genres.is_empty() {
        "total_rating != null".to_string()
    } else {
        format!("({genres}) & total_rating != null")
    };
    if feed == "trending" {
        let fields =
            "name,summary,first_release_date,total_rating,total_rating_count,hypes,follows,cover.image_id";
        let rows = trending_games(
            &auth,
            fields,
            offset.clamp(0, 90),
            limit.clamp(1, 30),
            &client_id,
            &client_secret
        ).await?;
        return Ok(Value::Array(rows.iter().map(discover_item).collect()));
    }
    let (where_clause, sort): (String, &str) = match feed.as_str() {
        "popular" => ("total_rating_count != null".into(), "total_rating_count desc"),
        "forYou" => (for_you, "total_rating desc"),
        "latest" => (format!("first_release_date <= {now}"), "first_release_date desc"),
        "upcoming" => (format!("first_release_date > {now}"), "first_release_date asc"),
        "topRated" =>
            ("total_rating != null & total_rating_count > 1500".into(), "total_rating desc"),
        "anticipated" => (format!("first_release_date > {now} & hypes != null"), "hypes desc"),
        "hiddenGems" =>
            (
                "total_rating != null & total_rating_count > 10 & total_rating_count < 500 & game_type = 0".into(),
                "total_rating desc",
            ),
        "indie" =>
            (
                "involved_companies.company != null & genres != null & game_type = 0".into(),
                "total_rating desc",
            ),
        "story" =>
            ("storyline != null & themes != null & game_type = 0".into(), "total_rating desc"),
        _ => {
            return Err("Unknown discovery feed.".into());
        }
    };
    let safe_offset = offset.clamp(0, 90);
    let safe_limit = limit.clamp(1, 30);
    let body = format!(
        "fields name,summary,first_release_date,total_rating,total_rating_count,hypes,follows,cover.image_id; where {where_clause}; sort {sort}; limit {safe_limit}; offset {safe_offset};"
    );
    let rows = igdb_post(&auth, "games", body, &client_id, &client_secret).await?;
    Ok(Value::Array(discover_games(&rows).iter().map(discover_item).collect()))
}

fn idlist(v: &[i64]) -> String {
    v.iter()
        .map(|i| i.to_string())
        .collect::<Vec<_>>()
        .join(",")
}

#[tauri::command]
async fn igdb_series(
    auth: tauri::State<'_, IgdbAuth>,
    id: i64,
    client_id: String,
    client_secret: String
) -> Result<Value, String> {
    let g = igdb_post(
        &auth,
        "games",
        format!("fields collections; where id = {id};"),
        &client_id,
        &client_secret
    ).await?;
    let start: Vec<i64> = g[0]["collections"]
        .as_array()
        .map(|a|
            a
                .iter()
                .filter_map(|x| x.as_i64())
                .collect()
        )
        .unwrap_or_default();
    if start.is_empty() {
        return Ok(json!({ "collections": [], "relations": [], "games": [] }));
    }

    let mut relations: Vec<(i64, i64)> = vec![]; // (parent, child)
    let mut known: HashSet<i64> = start.iter().cloned().collect();

    // 1) climb up to the top-level series
    let mut frontier = start.clone();
    for _ in 0..4 {
        if frontier.is_empty() {
            break;
        }
        let q = format!(
            "fields parent_collection,child_collection; where child_collection = ({}); limit 100;",
            idlist(&frontier)
        );
        let rows = igdb_post(&auth, "collection_relations", q, &client_id, &client_secret).await?;
        frontier = vec![];
        for r in rows.as_array().cloned().unwrap_or_default() {
            if
                let (Some(p), Some(c)) = (
                    r["parent_collection"].as_i64(),
                    r["child_collection"].as_i64(),
                )
            {
                if !relations.contains(&(p, c)) {
                    relations.push((p, c));
                }
                if known.insert(p) {
                    frontier.push(p);
                }
            }
        }
    }

    // 2) walk back down through every sub-series
    let mut frontier: Vec<i64> = known.iter().cloned().collect();
    for _ in 0..4 {
        if frontier.is_empty() {
            break;
        }
        let q = format!(
            "fields parent_collection,child_collection; where parent_collection = ({}); limit 100;",
            idlist(&frontier)
        );
        let rows = igdb_post(&auth, "collection_relations", q, &client_id, &client_secret).await?;
        frontier = vec![];
        for r in rows.as_array().cloned().unwrap_or_default() {
            if
                let (Some(p), Some(c)) = (
                    r["parent_collection"].as_i64(),
                    r["child_collection"].as_i64(),
                )
            {
                if !relations.contains(&(p, c)) {
                    relations.push((p, c));
                }
                if known.insert(c) {
                    frontier.push(c);
                }
            }
        }
    }

    // 3) collection names + their game ids
    let all: Vec<i64> = known.iter().cloned().collect();
    let cols = igdb_post(
        &auth,
        "collections",
        format!("fields name,games; where id = ({}); limit 100;", idlist(&all)),
        &client_id,
        &client_secret
    ).await?;

    // 4) game details
    let mut gids: Vec<i64> = vec![];
    for c in cols.as_array().cloned().unwrap_or_default() {
        for x in c["games"].as_array().cloned().unwrap_or_default() {
            if let Some(i) = x.as_i64() {
                if !gids.contains(&i) {
                    gids.push(i);
                }
            }
        }
    }
    let mut games: Vec<Value> = vec![];
    for chunk in gids.chunks(500) {
        let q = format!(
            "fields name,first_release_date,cover.image_id; where id = ({}); limit 500;",
            idlist(chunk)
        );
        let rows = igdb_post(&auth, "games", q, &client_id, &client_secret).await?;
        for r in rows.as_array().cloned().unwrap_or_default() {
            games.push(
                json!({
                "id": r["id"],
                "name": r["name"],
                "releaseTs": r["first_release_date"],
                "cover": r["cover"]["image_id"].as_str().map(|i| img(i, "cover_big")),
            })
            );
        }
    }

    Ok(json!({ "collections": cols, "relations": relations, "games": games }))
}

#[tauri::command]
async fn igdb_platforms(
    auth: tauri::State<'_, IgdbAuth>,
    client_id: String,
    client_secret: String
) -> Result<Vec<(i64, String)>, String> {
    let mut out: Vec<(i64, String)> = Vec::new();
    let mut offset = 0;
    loop {
        let rows = igdb_post(
            &auth,
            "platforms",
            format!("fields id,name; limit 500; offset {offset};"),
            &client_id,
            &client_secret
        ).await?;
        let list = rows.as_array().cloned().unwrap_or_default();
        let n = list.len();
        out.extend(
            list.iter().filter_map(|p| Some((p["id"].as_i64()?, p["name"].as_str()?.to_string())))
        );
        if n < 500 {
            break;
        }
        offset += 500;
    }
    Ok(out)
}

/// Cheap check for sync: returns (id, updated_at) for up to thousands of ids, 500 per request.
#[tauri::command]
async fn igdb_sync_check(
    auth: tauri::State<'_, IgdbAuth>,
    ids: Vec<i64>,
    client_id: String,
    client_secret: String
) -> Result<Vec<(i64, Option<i64>)>, String> {
    let mut out = Vec::new();
    for chunk in ids.chunks(500) {
        let rows = igdb_post(
            &auth,
            "games",
            format!("fields id,updated_at; where id = ({}); limit 500;", idlist(chunk)),
            &client_id,
            &client_secret
        ).await?;
        for r in rows.as_array().cloned().unwrap_or_default() {
            if let Some(id) = r["id"].as_i64() {
                out.push((id, r["updated_at"].as_i64()));
            }
        }
    }
    Ok(out)
}

/// Everything the Add flow fetches (details + images + time to beat), for many games in ~3 requests.
#[tauri::command]
async fn igdb_import_batch(
    auth: tauri::State<'_, IgdbAuth>,
    ids: Vec<i64>,
    client_id: String,
    client_secret: String
) -> Result<Vec<Value>, String> {
    if ids.is_empty() {
        return Ok(vec![]);
    }
    let list = idlist(&ids);
    let n = ids.len();
    let rows = igdb_post(
        &auth,
        "games",
        format!(
            "fields name,summary,first_release_date,updated_at,game_type.type,game_status.status,franchises.name,genres.name,themes.name,player_perspectives.name,platforms.name,total_rating,total_rating_count,cover.image_id,cover.image_type,cover.width,cover.height,screenshots.image_id,screenshots.width,screenshots.height,videos.video_id,videos.name,artworks.image_id,artworks.image_type,artworks.width,artworks.height,involved_companies.developer,involved_companies.company.name; where id = ({list}); limit {n};"
        ),
        &client_id,
        &client_secret
    ).await?;
    let ttb = igdb_post(
        &auth,
        "game_time_to_beats",
        format!("fields game_id,hastily,normally,completely; where game_id = ({list}); limit {n};"),
        &client_id,
        &client_secret
    ).await.unwrap_or(Value::Null);
    let image_types = igdb_post(
        &auth,
        "image_types",
        "fields id,name; limit 100;".to_string(),
        &client_id,
        &client_secret
    ).await?;

    let mut out = Vec::new();
    for g in rows.as_array().cloned().unwrap_or_default() {
        let id = match g["id"].as_i64() {
            Some(v) => v,
            None => {
                continue;
            }
        };
        let t = ttb
            .as_array()
            .and_then(|a| a.iter().find(|x| x["game_id"].as_i64() == Some(id)))
            .cloned()
            .unwrap_or(Value::Null);
        let background_id = preferred_artwork_id(&g["artworks"], &image_types)
            .or_else(|| first_image_id(&g["artworks"]))
            .or_else(|| g["screenshots"][0]["image_id"].as_str());

        let mut images: Vec<Value> = Vec::new();
        {
            let mut push = |category: &str, v: &Value| {
                if let Some(image_id) = v["image_id"].as_str() {
                    images.push(
                        json!({
                        "category": category,
                        "imageId": image_id,
                        "imageType": image_type_name(&v["image_type"], &image_types),
                         "url": img(image_id, if category == "cover" { "cover_big" } else { "1080p" }),
                        "width": v["width"],
                        "height": v["height"],
                    })
                    );
                }
            };
            push("cover", &g["cover"]);
            for a in g["artworks"].as_array().into_iter().flatten().take(100) {
                push("artwork", a);
            }
            for s in g["screenshots"].as_array().into_iter().flatten().take(100) {
                push("screenshot", s);
            }
        }
        let videos: Vec<IgdbVideo> = g["videos"]
            .as_array()
            .map(|a| {
                a.iter()
                    .filter_map(|v| {
                        Some(IgdbVideo {
                            video_id: v["video_id"].as_str()?.to_string(),
                            name: v["name"].as_str().map(String::from),
                        })
                    })
                    .collect()
            })
            .unwrap_or_default();
        let game = IgdbGame {
            id,
            name: g["name"].as_str().unwrap_or("").to_string(),
            developer: developer_of(&g),
            release_ts: g["first_release_date"].as_i64(),
            description: g["summary"].as_str().map(String::from),
            genres: names(&g["genres"]),
            platforms: names(&g["platforms"]),
            rating: g["total_rating"].as_f64().map(|r| r.round() as i64),
            rating_count: g["total_rating_count"].as_i64(),
            time_avg: t["normally"].as_i64(),
            time_main: t["hastily"].as_i64(),
            time_full: t["completely"].as_i64(),
            cover: g["cover"]["image_id"].as_str().map(|i| img(i, "cover_big")),
            background: background_id.map(|i| img(i, "1080p")),
            videos,
            screenshots: vec![],
            game_type: g["game_type"]["type"].as_str().map(String::from),
            game_status: g["game_status"]["status"].as_str().map(String::from),
            franchises: names(&g["franchises"]),
            themes: names(&g["themes"]),
            player_perspectives: names(&g["player_perspectives"]),
            storyline: None,
            similar_games: vec![],
            updated_at: g["updated_at"].as_i64(),
        };
        out.push(json!({ "game": game, "images": images }));
    }
    Ok(out)
}

/// Native "Save as…" dialog + write. Returns the chosen path, or None if the user cancelled.
#[tauri::command]
async fn save_text_file(
    app: tauri::AppHandle,
    default_name: String,
    contents: String,
    filter_name: String,
    ext: String
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let dialog = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .add_filter(&filter_name, &[ext.as_str()]);
    let picked = tauri::async_runtime
        ::spawn_blocking(move || dialog.blocking_save_file()).await
        .map_err(|e| e.to_string())?;
    let Some(file) = picked else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    Ok(Some(path.to_string_lossy().to_string()))
}

/// Games that belong to a bundle (IGDB stores this on the child: `bundles` = "bundles this game is part of").
#[tauri::command]
async fn igdb_bundle_contents(
    auth: tauri::State<'_, IgdbAuth>,
    id: i64,
    client_id: String,
    client_secret: String
) -> Result<Vec<Value>, String> {
    let rows = igdb_post(
        &auth,
        "games",
        format!(
            "fields name,summary,first_release_date,total_rating,total_rating_count,cover.image_id; where bundles = [{id}]; sort first_release_date asc; limit 50;"
        ),
        &client_id,
        &client_secret
    ).await?;
    Ok(discover_games(&rows).iter().map(discover_item).collect())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder
        ::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("lost-in-sync.sqlite");
            std::fs::create_dir_all(path.parent().expect("database path has a parent"))?;
            let connection = Connection::open(path)?;
            migrate(&connection)?;
            app.manage(Database(Mutex::new(connection)));
            app.manage(IgdbAuth(tauri::async_runtime::Mutex::new(None)));
            if cfg!(debug_assertions) {
                app.handle().plugin(tauri_plugin_opener::init())?;
            }
            Ok(())
        })
        .invoke_handler(
            tauri::generate_handler![
                load_app_data,
                save_app_data,
                igdb_search,
                igdb_details,
                igdb_images,
                igdb_series,
                igdb_bundle_contents,
                igdb_discover,
                igdb_discover_feed,
                igdb_platforms,
                igdb_sync_check,
                igdb_import_batch,
                save_text_file
            ]
        )
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
