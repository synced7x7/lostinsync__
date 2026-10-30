#![allow(dead_code)]

use rusqlite::{ Connection, OptionalExtension, params };
use serde::{ Deserialize, Serialize };
use serde_json::Value;
use std::sync::Mutex;
use std::time::{ Duration, Instant };
use tauri::Manager;

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
struct ActivityEvent {
    id: String,
    #[serde(rename = "type")]
    event_type: String,
    title: String,
    detail: String,
    occurred_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct JournalEntry {
    id: String,
    title: String,
    body: String,
    mood: String,
    created_at: String,
    game_id: Option<String>,
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
    activities: Vec<ActivityEvent>,
    journal: Vec<JournalEntry>,
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
    let q = query.replace('"', "").replace('\\', "");
    let body = format!(
        "search \"{q}\"; fields name,first_release_date,cover.image_id,involved_companies.developer,involved_companies.company.name; where version_parent = null; limit 8;"
    );
    let rows = igdb_post(&auth, "games", body, &client_id, &client_secret).await?;
    Ok(
        rows
            .as_array()
            .map(|a| {
                a.iter()
                    .map(|g| IgdbHit {
                        id: g["id"].as_i64().unwrap_or(0),
                        name: g["name"].as_str().unwrap_or("").to_string(),
                        release_ts: g["first_release_date"].as_i64(),
                        developer: developer_of(g),
                        cover: g["cover"]["image_id"].as_str().map(|i| img(i, "cover_small")),
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
        "fields name,summary,first_release_date,genres.name,platforms.name,total_rating,total_rating_count,cover.image_id,artworks.image_id,screenshots.image_id,videos.video_id,videos.name,involved_companies.developer,involved_companies.company.name; where id = {id};"
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
    let bg = g["artworks"][0]["image_id"].as_str().or(g["screenshots"][0]["image_id"].as_str());
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
        .map(|a| a.iter().filter_map(|s| s["image_id"].as_str().map(|i| img(i, "screenshot_big"))).collect())
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
        background: bg.map(|i| img(i, "1080p")),
        videos, 
        screenshots,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder
        ::default()
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("lost-in-sync.sqlite");
            std::fs::create_dir_all(path.parent().expect("database path has a parent"))?;
            let connection = Connection::open(path)?;
            migrate(&connection)?;
            app.manage(Database(Mutex::new(connection)));
            app.manage(IgdbAuth(tauri::async_runtime::Mutex::new(None)));
            if cfg!(debug_assertions) {
                app
                    .handle()
                    .plugin(
                        tauri_plugin_opener::init(),
                    )?;
            }
            Ok(())
        })
        .invoke_handler(
            tauri::generate_handler![load_app_data, save_app_data, igdb_search, igdb_details]
        )
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
