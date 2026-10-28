use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
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
    total_seconds: i64,
    active_since: Option<String>,
    created_at: String,
    started_at: Option<String>,
    finished_at: Option<String>,
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
         );",
    )?;
    let applied: i64 = connection.query_row(
        "SELECT COUNT(*) FROM schema_migrations WHERE version = 1",
        [],
        |row| row.get(0),
    )?;
    if applied == 0 {
        connection.execute_batch(
            "INSERT INTO schema_migrations (version, applied_at)
             VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));",
        )?;
    }
    Ok(())
}

#[tauri::command]
fn load_app_data(database: tauri::State<'_, Database>) -> Result<Option<AppData>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Database lock failed".to_string())?;
    let json: Option<String> = connection
        .query_row("SELECT data_json FROM app_state WHERE id = 1", [], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|error| error.to_string())?;
    json.map(|value| serde_json::from_str(&value).map_err(|error| error.to_string()))
        .transpose()
}

#[tauri::command]
fn save_app_data(database: tauri::State<'_, Database>, data: AppData) -> Result<(), String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Database lock failed".to_string())?;
    let json = serde_json::to_string(&data).map_err(|error| error.to_string())?;
    connection
        .execute(
            "INSERT INTO app_state (id, data_json) VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET data_json = excluded.data_json",
            params![json],
        )
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let path = app.path().app_data_dir()?.join("lost-in-sync.sqlite");
            std::fs::create_dir_all(path.parent().expect("database path has a parent"))?;
            let connection = Connection::open(path)?;
            migrate(&connection)?;
            app.manage(Database(Mutex::new(connection)));
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![load_app_data, save_app_data])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
