use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Game {
    id: String,
    title: String,
    platform: String,
    status: String,
    notes: String,
    total_seconds: i64,
    active_since: Option<String>,
    created_at: String,
}

struct Database(Mutex<Connection>);

fn migrate(connection: &Connection) -> Result<(), rusqlite::Error> {
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
     CREATE TABLE IF NOT EXISTS schema_migrations (
       version INTEGER PRIMARY KEY NOT NULL,
       applied_at TEXT NOT NULL
     );",
    )?;
    let applied: i64 = connection.query_row(
        "SELECT COUNT(*) FROM schema_migrations WHERE version = 1",
        [],
        |row| row.get(0),
    )?;
    if applied == 0 {
        connection.execute_batch(
            "BEGIN;
       CREATE TABLE IF NOT EXISTS games (
       id TEXT PRIMARY KEY NOT NULL,
       title TEXT NOT NULL,
       platform TEXT NOT NULL,
       status TEXT NOT NULL,
       notes TEXT NOT NULL DEFAULT '',
       total_seconds INTEGER NOT NULL DEFAULT 0,
       active_since TEXT,
       created_at TEXT NOT NULL
       );
       CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
       INSERT INTO schema_migrations (version, applied_at)
       VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
       COMMIT;",
        )?;
    }
    Ok(())
}

#[tauri::command]
fn list_games(database: tauri::State<'_, Database>) -> Result<Vec<Game>, String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Database lock failed".to_string())?;
    let mut statement = connection
    .prepare("SELECT id, title, platform, status, notes, total_seconds, active_since, created_at FROM games ORDER BY created_at DESC")
    .map_err(|error| error.to_string())?;
    let games = statement
        .query_map([], |row| {
            Ok(Game {
                id: row.get(0)?,
                title: row.get(1)?,
                platform: row.get(2)?,
                status: row.get(3)?,
                notes: row.get(4)?,
                total_seconds: row.get(5)?,
                active_since: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(games)
}

#[tauri::command]
fn save_game(database: tauri::State<'_, Database>, game: Game) -> Result<(), String> {
    let connection = database
        .0
        .lock()
        .map_err(|_| "Database lock failed".to_string())?;
    connection.execute(
    "INSERT INTO games (id, title, platform, status, notes, total_seconds, active_since, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(id) DO UPDATE SET title=excluded.title, platform=excluded.platform, status=excluded.status,
       notes=excluded.notes, total_seconds=excluded.total_seconds, active_since=excluded.active_since",
    params![game.id, game.title, game.platform, game.status, game.notes, game.total_seconds, game.active_since, game.created_at],
  ).map(|_| ()).map_err(|error| error.to_string())
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
        .invoke_handler(tauri::generate_handler![list_games, save_game])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
