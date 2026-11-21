#![allow(dead_code)]

use rusqlite::{ Connection, OptionalExtension, params };
use serde::{ Deserialize, Serialize };
use std::sync::Mutex;
use std::time::{ Duration, Instant };
use tauri::Manager;
use serde_json::{ json, Value };
use std::collections::HashSet;
use std::hash::{ Hash, Hasher };
use base64::{ engine::general_purpose::STANDARD, Engine };

mod stores;

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
         );
         CREATE TABLE IF NOT EXISTS franchise_cache (
           key TEXT PRIMARY KEY NOT NULL,
           sig TEXT NOT NULL,
           fetched_at INTEGER NOT NULL,
           games_json TEXT NOT NULL
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
async fn load_app_data(
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
async fn save_app_data(
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

#[tauri::command]
async fn franchise_cache_load(
    database: tauri::State<'_, Database>,
    keys: Vec<String>
) -> Result<Vec<Value>, String> {
    if keys.is_empty() {
        return Ok(vec![]);
    }
    let connection = database.0.lock().map_err(|_| "Database lock failed".to_string())?;
    let marks = vec!["?"; keys.len()].join(",");
    let sql = format!(
        "SELECT key, sig, fetched_at, games_json FROM franchise_cache WHERE key IN ({marks})"
    );
    let mut st = connection.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = st
        .query_map(rusqlite::params_from_iter(keys.iter()), |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut out = vec![];
    for row in rows {
        let (key, sig, at, text) = row.map_err(|e| e.to_string())?;
        if let Ok(games) = serde_json::from_str::<Value>(&text) {
            out.push(json!({ "key": key, "sig": sig, "fetchedAt": at, "games": games }));
        }
    }
    Ok(out)
}

#[tauri::command]
async fn franchise_cache_save(
    database: tauri::State<'_, Database>,
    key: String,
    sig: String,
    games: Value
) -> Result<(), String> {
    let connection = database.0.lock().map_err(|_| "Database lock failed".to_string())?;
    let text = serde_json::to_string(&games).map_err(|e| e.to_string())?;
    let now = std::time::SystemTime
        ::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    connection
        .execute(
            "INSERT INTO franchise_cache (key, sig, fetched_at, games_json) VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(key) DO UPDATE SET sig = excluded.sig, fetched_at = excluded.fetched_at, games_json = excluded.games_json",
            params![key, sig, now, text]
        )
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn images_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("images");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

#[tauri::command]
async fn images_path(app: tauri::AppHandle) -> Result<String, String> {
    Ok(images_dir(&app)?.to_string_lossy().into_owned())
}

#[tauri::command]
async fn store_image(app: tauri::AppHandle, data_uri: String) -> Result<String, String> {
    let (head, b64) = data_uri.split_once(',').ok_or("bad data uri")?;
    let ext = if head.contains("png") {
        "png"
    } else if head.contains("webp") {
        "webp"
    } else if head.contains("gif") {
        "gif"
    } else {
        "jpg"
    };
    let bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;
    let mut h = std::collections::hash_map::DefaultHasher::new();
    bytes.hash(&mut h);
    let name = format!("{:016x}-{}.{}", h.finish(), bytes.len(), ext);
    let path = images_dir(&app)?.join(&name);
    if !path.exists() {
        std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    }
    Ok(name)
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
        "id": g["id"], "name": g["name"], "cover": g["cover"]["image_id"].as_str().map(|i| img(i, "cover_big_2x")),
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

async fn igdb_sleep(d: Duration) {
    let _ = tauri::async_runtime::spawn_blocking(move || std::thread::sleep(d)).await;
}

/// Same as igdb_post, but when `pace` is on it waits 260 ms before each request and retries on 429.
/// Only the franchise lookups turn `pace` on, so nothing else in the app is slowed down.
async fn igdb_post_paced(
    auth: &IgdbAuth,
    pace: bool,
    endpoint: &str,
    body: String,
    client_id: &str,
    secret: &str
) -> Result<Value, String> {
    let mut attempt: u32 = 0;
    loop {
        if pace {
            igdb_sleep(Duration::from_millis(300)).await;
        }
        match igdb_post(auth, endpoint, body.clone(), client_id, secret).await {
            Err(e) if e.contains("429") && attempt < 4 => {
                attempt += 1;
                igdb_sleep(Duration::from_millis(700 * 2u64.pow(attempt))).await;
            }
            r => return r,
        }
    }
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
                    .filter(|g| {
                        if id_query.is_some() {
                            g["id"].as_i64().is_some()
                        } else {
                            strict_query
                                .map(|strict| g["name"].as_str() == Some(strict))
                                .unwrap_or(true)
                        }
                    })
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
        cover: g["cover"]["image_id"].as_str().map(|i| img(i, "cover_big_2x")),
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
            "cover": game["cover"]["image_id"].as_str().map(|i| img(i, "cover_big_2x"))
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
                "url": img(image_id, if category == "cover" { "cover_big_2x" } else { "1080p" }),
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
    client_secret: String,
    types: Option<Vec<i64>>
) -> Result<Value, String> {
    let pace = types.is_some();
    let g = igdb_post_paced(
        &auth,
        pace,
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
            "fields parent_collection,child_collection; where child_collection = ({}); limit 500;",
            idlist(&frontier)
        );
        let rows = igdb_post_paced(&auth, pace, "collection_relations", q, &client_id, &client_secret).await?;
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
            "fields parent_collection,child_collection; where parent_collection = ({}); limit 500;",
            idlist(&frontier)
        );
        let rows = igdb_post_paced(&auth, pace, "collection_relations", q, &client_id, &client_secret).await?;
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
    let cols = igdb_post_paced(
        &auth,
        pace,
        "collections",
        format!("fields name,games; where id = ({}); limit 500;", idlist(&all)),
        &client_id,
        &client_secret
    ).await?;

    let filt = match &types {
        Some(t) if !t.is_empty() => format!(" & (game_type = ({}) | game_type = null)", idlist(t)),
        _ => String::new(),
    };

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
            "fields name,first_release_date,cover.image_id,game_type; where id = ({}){}; limit 500;",
            idlist(chunk),
            filt
        );
        let rows = igdb_post_paced(&auth, pace, "games", q, &client_id, &client_secret).await?;
        for r in rows.as_array().cloned().unwrap_or_default() {
            games.push(
                json!({
                "id": r["id"],
                "name": r["name"],
                "releaseTs": r["first_release_date"],
                "gameType": r["game_type"],
                "cover": r["cover"]["image_id"].as_str().map(|i| img(i, "cover_big_2x")),
            })
            );
        }
    }

    Ok(json!({ "collections": cols, "relations": relations, "games": games }))
}

fn qstr(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// IGDB `franchises` endpoint: the game ids of a franchise. Looks it up by name; if that finds nothing,
/// falls back to the franchises of the given library games.
#[tauri::command]
async fn igdb_franchise(
    auth: tauri::State<'_, IgdbAuth>,
    name: String,
    game_ids: Vec<i64>,
    client_id: String,
    client_secret: String
) -> Result<Value, String> {
    let mut rows = igdb_post_paced(
        &auth,
        true,
        "franchises",
        format!("fields name,games; where name ~ \"{}\"; limit 50;", qstr(&name)),
        &client_id,
        &client_secret
    ).await?
        .as_array()
        .cloned()
        .unwrap_or_default();
    if rows.is_empty() && !game_ids.is_empty() {
        let gs = igdb_post_paced(
            &auth,
            true,
            "games",
            format!("fields franchises; where id = ({}); limit 50;", idlist(&game_ids)),
            &client_id,
            &client_secret
        ).await?;
        let mut fids: Vec<i64> = vec![];
        for g in gs.as_array().cloned().unwrap_or_default() {
            for f in g["franchises"].as_array().cloned().unwrap_or_default() {
                if let Some(i) = f.as_i64() {
                    if !fids.contains(&i) {
                        fids.push(i);
                    }
                }
            }
        }
        if !fids.is_empty() {
            rows = igdb_post_paced(
                &auth,
                true,
                "franchises",
                format!("fields name,games; where id = ({}); limit 50;", idlist(&fids)),
                &client_id,
                &client_secret
            ).await?
                .as_array()
                .cloned()
                .unwrap_or_default();
        }
    }
    let mut ids: Vec<i64> = vec![];
    let mut seen: HashSet<i64> = HashSet::new();
    for f in &rows {
        for x in f["games"].as_array().cloned().unwrap_or_default() {
            if let Some(i) = x.as_i64() {
                if seen.insert(i) {
                    ids.push(i);
                }
            }
        }
    }
    let franchises: Vec<Value> = rows
        .iter()
        .map(|f| json!({ "id": f["id"], "name": f["name"] }))
        .collect();
    Ok(json!({ "gameIds": ids, "franchises": franchises }))
}

/// Game details for a chunk of ids, optionally limited to certain game_type ids (games with no type are kept).
#[tauri::command]
async fn igdb_games_by_ids(
    auth: tauri::State<'_, IgdbAuth>,
    ids: Vec<i64>,
    types: Option<Vec<i64>>,
    client_id: String,
    client_secret: String
) -> Result<Value, String> {
    if ids.is_empty() {
        return Ok(json!([]));
    }
    let filt = match &types {
        Some(t) if !t.is_empty() => format!(" & (game_type = ({}) | game_type = null)", idlist(t)),
        _ => String::new(),
    };
    let rows = igdb_post_paced(
        &auth,
        true,
        "games",
        format!(
            "fields name,first_release_date,cover.image_id,game_type; where id = ({}){}; limit 500;",
            idlist(&ids),
            filt
        ),
        &client_id,
        &client_secret
    ).await?;
    let out: Vec<Value> = rows
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|r|
            json!({
                "id": r["id"],
                "name": r["name"],
                "releaseTs": r["first_release_date"],
                "cover": r["cover"]["image_id"].as_str().map(|i| img(i, "cover_big_2x")),
                "gameType": r["game_type"],
            })
        )
        .collect();
    Ok(json!(out))
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

/// Exact storefront entries for a game from IGDB `external_games` (real product URLs).
#[tauri::command]
async fn igdb_external_games(
    auth: tauri::State<'_, IgdbAuth>,
    game_id: i64,
    client_id: String,
    client_secret: String
) -> Result<Vec<Value>, String> {
    let rows = igdb_post(
        &auth,
        "external_games",
        format!(
            "fields external_game_source,category,url,name,platform,year; where game = {game_id}; limit 100;"
        ),
        &client_id,
        &client_secret
    ).await?;
    Ok(
        rows
            .as_array()
            .cloned()
            .unwrap_or_default()
            .iter()
            .filter_map(|r| {
                let source = r["external_game_source"].as_i64().or_else(|| r["category"].as_i64())?;
                Some(
                    json!({
            "source": source,
            "url": r["url"].as_str(),
            "name": r["name"].as_str(),
            "platform": r["platform"].as_i64(),
            "year": r["year"].as_i64()
        })
                )
            })
            .collect()
    )
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
                         "url": img(image_id, if category == "cover" { "cover_big_2x" } else { "1080p" }),
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
            cover: g["cover"]["image_id"].as_str().map(|i| img(i, "cover_big_2x")),
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

// --- Store import commands (desktop only; credentials never enter AppData) ---

#[tauri::command]
async fn stores_status(app: tauri::AppHandle, steam_connected: bool) -> Result<Value, String> {
    Ok(stores::status(&stores::read_credentials(&app)?, steam_connected))
}

#[tauri::command]
async fn stores_auth_url(store: String) -> Result<String, String> {
    stores::auth_url(&store)
}

#[tauri::command]
async fn stores_complete_auth(
    app: tauri::AppHandle,
    store: String,
    code: String,
    steam_connected: bool
) -> Result<Value, String> {
    stores::complete_auth(&app, &store, &code, steam_connected).await
}

#[tauri::command]
async fn stores_fetch(
    app: tauri::AppHandle,
    store: String,
    steam_key: Option<String>,
    steam_id: Option<String>
) -> Result<Vec<Value>, String> {
    let credentials = stores::read_credentials(&app)?;
    stores::fetch(&store, &credentials, steam_key.as_deref(), steam_id.as_deref()).await
}

#[tauri::command]
async fn stores_fetch_achievements(
    store: String,
    store_id: String,
    steam_key: Option<String>,
    steam_id: Option<String>
) -> Result<Value, String> {
    if store != "steam" {
        return Ok(json!({ "achieved": 0, "total": 0 }));
    }
    stores::achievements(steam_key.as_deref(), steam_id.as_deref(), &store_id).await
}

/// Direct IGDB `external_games` lookup by store uid. Tries the current field name, then the old one.
#[tauri::command]
async fn igdb_external_lookup(
    auth: tauri::State<'_, IgdbAuth>,
    uid: String,
    source: i64,
    client_id: String,
    client_secret: String
) -> Result<Option<i64>, String> {
    let escaped = uid.replace('"', "");
    let modern = format!(
        "fields game; where uid = \"{}\" & external_game_source = {}; limit 1;",
        escaped,
        source
    );
    let legacy = format!(
        "fields game; where uid = \"{}\" & category = {}; limit 1;",
        escaped,
        source
    );
    let rows = match igdb_post(&auth, "external_games", modern, &client_id, &client_secret).await {
        Ok(rows) => rows,
        Err(_) => igdb_post(&auth, "external_games", legacy, &client_id, &client_secret).await?,
    };
    Ok(
        rows
            .as_array()
            .and_then(|array| array.first())
            .and_then(|row| row.get("game"))
            .and_then(Value::as_i64)
    )
}

/// Drop characters that would break an IGDB string literal. Store ids are opaque, so this is safe.
fn igdb_literal(value: &str) -> String {
    value.trim().replace('"', "")
}

/// Normalize store/IGDB titles for tie-breaking. Epic sometimes returns `Rocket League R` where
/// the `R` is a mangled `®`, so a trailing standalone mark token is ignored as well as punctuation.
fn epic_name_key(value: &str) -> String {
    let mut tokens: Vec<&str> = value.split_whitespace().collect();
    if let Some(last) = tokens.last() {
        let clean = last.trim_matches(|c: char| !c.is_ascii_alphanumeric());
        if
            clean.eq_ignore_ascii_case("r") ||
            clean.eq_ignore_ascii_case("tm") ||
            clean.eq_ignore_ascii_case("c")
        {
            tokens.pop();
        }
    }
    tokens
        .into_iter()
        .collect::<String>()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .collect()
}

fn epic_names_match(left: &str, right: &str) -> bool {
    let a = epic_name_key(left);
    !a.is_empty() && a == epic_name_key(right)
}

fn epic_games_query(uid: &str) -> String {
    format!("fields id,name; where external_games.uid = \"{}\"; limit 10;", igdb_literal(uid))
}

fn epic_external_query(uid: &str) -> String {
    format!(
        "fields game,external_game_source,category,name; where uid = \"{}\"; limit 10;",
        igdb_literal(uid)
    )
}

/// Pick the IGDB id from `games` rows. The external uid is authoritative; names only break ties.
fn epic_pick_game(rows: &[Value], title: &str) -> Option<i64> {
    let ids: Vec<(i64, String)> = rows
        .iter()
        .filter_map(|row|
            Some((
                row.get("id")?.as_i64()?,
                row.get("name").and_then(Value::as_str).unwrap_or("").to_string(),
            ))
        )
        .collect();
    if ids.len() == 1 {
        return Some(ids[0].0);
    }
    let mut matches = ids
        .iter()
        .filter(|(_, name)| epic_names_match(name, title))
        .map(|(id, _)| *id);
    let first = matches.next()?;
    matches.all(|id| id == first).then_some(first)
}

/// Pick the IGDB id from `external_games` rows. Epic catalog ids are GUIDs, so a uid match is
/// authoritative even if IGDB tagged the row with a non-Epic source; Epic/legacy sources win ties.
fn epic_pick_external(rows: &[Value], title: &str) -> Option<i64> {
    let ids: Vec<(i64, String, bool)> = rows
        .iter()
        .filter_map(|row| {
            let game = row.get("game")?.as_i64()?;
            let source = row
                .get("external_game_source")
                .and_then(Value::as_i64)
                .or_else(|| row.get("category").and_then(Value::as_i64))
                .unwrap_or(-1);
            let name = row.get("name").and_then(Value::as_str).unwrap_or("").to_string();
            Some((game, name, source == 26 || source == 0))
        })
        .collect();

    // Prefer correctly-tagged Epic rows, then fall back to any GUID match.
    for epic_only in [true, false] {
        let candidates: Vec<&(i64, String, bool)> = ids
            .iter()
            .filter(|row| row.2 == epic_only)
            .collect();
        if candidates.len() == 1 {
            return Some(candidates[0].0);
        }
        if candidates.len() > 1 {
            let mut matches = candidates
                .iter()
                .filter(|row| row.1.is_empty() || epic_names_match(&row.1, title))
                .map(|row| row.0);
            if let Some(first) = matches.next() {
                if matches.all(|id| id == first) {
                    return Some(first);
                }
            }
        }
    }
    None
}

/// Resolve an Epic catalog item id straight to an IGDB game id. Epic's title can differ from
/// IGDB's, so the external id is authoritative and the name is only used to break ties.
#[tauri::command]
async fn igdb_epic_lookup(
    auth: tauri::State<'_, IgdbAuth>,
    uid: String,
    title: String,
    client_id: String,
    client_secret: String
) -> Result<Option<i64>, String> {
    if igdb_literal(&uid).is_empty() {
        return Ok(None);
    }

    if
        let Ok(rows) = igdb_post(
            &auth,
            "games",
            epic_games_query(&uid),
            &client_id,
            &client_secret
        ).await
    {
        if let Some(id) = rows.as_array().and_then(|array| epic_pick_game(array, &title)) {
            return Ok(Some(id));
        }
    }

    let rows = igdb_post(
        &auth,
        "external_games",
        epic_external_query(&uid),
        &client_id,
        &client_secret
    ).await?;
    Ok(rows.as_array().and_then(|array| epic_pick_external(array, &title)))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder
        ::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("lost-in-sync.sqlite");
            std::fs::create_dir_all(path.parent().expect("database path has a parent"))?;
            let connection = Connection::open(path)?;
            migrate(&connection)?;
            app.manage(Database(Mutex::new(connection)));
            app.manage(IgdbAuth(tauri::async_runtime::Mutex::new(None)));
            Ok(())
        })
        .invoke_handler(
            tauri::generate_handler![
                load_app_data,
                save_app_data,
                franchise_cache_load,
                franchise_cache_save,
                images_path,
                store_image,
                igdb_search,
                igdb_details,
                igdb_images,
                igdb_series,
                igdb_franchise,
                igdb_games_by_ids,
                igdb_bundle_contents,
                igdb_discover,
                igdb_discover_feed,
                igdb_platforms,
                igdb_external_games,
                igdb_sync_check,
                igdb_import_batch,
                save_text_file,
                stores_status,
                stores_auth_url,
                stores_complete_auth,
                stores_fetch,
                stores_fetch_achievements,
                igdb_external_lookup,
                igdb_epic_lookup
            ]
        )
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        epic_external_query,
        epic_games_query,
        epic_name_key,
        epic_names_match,
        epic_pick_external,
        epic_pick_game,
    };
    use serde_json::json;

    #[test]
    fn epic_name_normalization_handles_mangled_trademark() {
        assert_eq!(epic_name_key("Rocket League R"), "rocketleague");
        assert_eq!(epic_name_key("Rocket League®"), "rocketleague");
        assert_eq!(epic_name_key("Monster Hunter"), "monsterhunter");
        assert!(epic_names_match("Rocket League R", "Rocket League"));
    }

    #[test]
    fn epic_games_query_filters_by_external_uid() {
        assert_eq!(
            epic_games_query("abc-123"),
            "fields id,name; where external_games.uid = \"abc-123\"; limit 10;"
        );
    }

    #[test]
    fn epic_external_query_looks_up_by_uid() {
        assert_eq!(
            epic_external_query("abc-123"),
            "fields game,external_game_source,category,name; where uid = \"abc-123\"; limit 10;"
        );
    }

    #[test]
    fn epic_pick_game_accepts_a_unique_uid_link() {
        let rows = vec![json!({ "id": 100, "name": "Rocket League" })];
        assert_eq!(epic_pick_game(&rows, "Rocket League R"), Some(100));
        let ambiguous = vec![json!({ "id": 1, "name": "A" }), json!({ "id": 2, "name": "B" })];
        assert_eq!(epic_pick_game(&ambiguous, "Rocket League R"), None);
    }

    #[test]
    fn epic_pick_external_accepts_legacy_and_modern_sources() {
        let modern = vec![
            json!({ "game": 42, "external_game_source": 26, "name": "Rocket League" })
        ];
        assert_eq!(epic_pick_external(&modern, "Rocket League R"), Some(42));
        let legacy = vec![json!({ "game": 42, "category": 0, "name": "Rocket League" })];
        assert_eq!(epic_pick_external(&legacy, "Rocket League R"), Some(42));
        let other = vec![json!({ "game": 99, "external_game_source": 1, "name": "Rocket League" })];
        assert_eq!(epic_pick_external(&other, "Rocket League R"), Some(99));
        // Correctly tagged Epic rows still win when both sources share the same uid.
        let mixed = vec![
            json!({ "game": 99, "external_game_source": 1, "name": "Rocket League" }),
            json!({ "game": 42, "external_game_source": 26, "name": "Rocket League" })
        ];
        assert_eq!(epic_pick_external(&mixed, "Rocket League R"), Some(42));
    }
}
