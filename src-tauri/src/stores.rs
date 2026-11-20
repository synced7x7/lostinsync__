//! Desktop-only store connectors. All HTTP and token storage stays in Rust;
//! the webview only sees normalized game records and a connection status.
//!
//! Endpoint URLs are kept here so an unofficial API change is a one-file fix.

use reqwest::Client;
use serde_json::{ json, Value };
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::Manager;

const STEAM_OWNED_GAMES: &str = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/";
const STEAM_ACHIEVEMENTS: &str = "https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/";
/// Steam's supported keyless wishlist API. The old `wishlistdata/` page now 302s to the store home.
const STEAM_WISHLIST: &str = "https://api.steampowered.com/IWishlistService/GetWishlist/v1/";
/// The wishlist API returns app ids only; resolve names with the store's basic app-details endpoint.
const STEAM_APP_DETAILS: &str = "https://store.steampowered.com/api/appdetails";
/// Epic's public launcher OAuth client id (not a Steam credential).
const EPIC_CLIENT_ID: &str = "34a02cf8f4414e29e1593316d79bb1e";
const EPIC_AUTH_URL: &str = "https://api.epicgames.dev/epic/oauth/v2/authorize?client_id=34a02cf8f4414e29e1593316d79bb1e&response_type=code&scope=basic&redirect_uri=https%3A%2F%2Flegendary.gl%2Fepicauth";
const EPIC_TOKEN: &str = "https://api.epicgames.dev/epic/oauth/v2/token";
const EPIC_REDIRECT: &str = "https://legendary.gl/epicauth";
const EPIC_LIBRARY: &str = "https://library-service.live.use1a.on.epicgames.com/library/api/public/items";
const GOG_CLIENT_ID: &str = "46899977096215655";
const GOG_REDIRECT: &str = "https://embed.gog.com/on_login_success?origin=client";
const GOG_AUTH_URL: &str = "https://auth.gog.com/auth?client_id=46899977096215655&redirect_uri=https%3A%2F%2Fembed.gog.com%2Fon_login_success%3Forigin%3Dclient&response_type=code&layout=client2";
const GOG_TOKEN: &str = "https://auth.gog.com/token";
const GOG_PRODUCTS: &str = "https://embed.gog.com/account/getFilteredProducts";

fn credentials_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("store-credentials.json"))
}

pub fn read_credentials(app: &tauri::AppHandle) -> Result<Value, String> {
    let path = credentials_path(app)?;
    if !path.exists() { return Ok(json!({})); }
    let text = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

fn write_credentials(app: &tauri::AppHandle, credentials: &Value) -> Result<(), String> {
    let path = credentials_path(app)?;
    if let Some(parent) = path.parent() { std::fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
    let text = serde_json::to_string_pretty(credentials).map_err(|e| e.to_string())?;
    std::fs::write(path, text).map_err(|e| e.to_string())
}

fn battlenet_path() -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let path = PathBuf::from(r"C:\ProgramData\Battle.net\Agent\product.db");
        if path.exists() { return Some(path); }
    }
    #[cfg(target_os = "macos")]
    {
        let path = PathBuf::from("/Users/Shared/Battle.net/Agent/product.db");
        if path.exists() { return Some(path); }
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = PathBuf::new();
    }
    None
}

pub fn battlenet_available() -> bool { battlenet_path().is_some() }

pub fn status(credentials: &Value, steam_connected: bool) -> Value {
    let connected = |store: &str| -> bool {
        credentials.get(store)
            .and_then(Value::as_object)
            .map(|entry| !entry.is_empty())
            .unwrap_or(false)
    };
    json!({
        "steam": steam_connected,
        "epic": connected("epic"),
        "gog": connected("gog"),
        "battlenet": battlenet_available()
    })
}

pub fn auth_url(store: &str) -> Result<String, String> {
    match store {
        "epic" => Ok(EPIC_AUTH_URL.into()),
        "gog" => Ok(GOG_AUTH_URL.into()),
        _ => Err("This store does not use a browser sign-in.".into()),
    }
}

pub async fn complete_auth(app: &tauri::AppHandle, store: &str, code: &str, steam_connected: bool) -> Result<Value, String> {
    let code = code.trim();
    if code.is_empty() { return Err("Paste the authorization code first.".into()); }
    let (access, refresh) = match store {
        "gog" => {
            let query = [
                ("client_id", GOG_CLIENT_ID),
                ("redirect_uri", GOG_REDIRECT),
                ("code", code),
                ("grant_type", "authorization_code"),
            ];
            let response = Client::new().post(GOG_TOKEN).query(&query).send().await.map_err(|e| e.to_string())?;
            if !response.status().is_success() { return Err(format!("GOG sign-in failed (HTTP {})", response.status())); }
            let body: Value = response.json().await.map_err(|e| e.to_string())?;
            (
                body.get("access_token").and_then(Value::as_str).unwrap_or("").to_string(),
                body.get("refresh_token").and_then(Value::as_str).unwrap_or("").to_string(),
            )
        }
        "epic" => {
            let mut url = reqwest::Url::parse(EPIC_TOKEN).map_err(|e| e.to_string())?;
            url.query_pairs_mut()
                .append_pair("grant_type", "authorization_code")
                .append_pair("code", code)
                .append_pair("client_id", EPIC_CLIENT_ID)
                .append_pair("redirect_uri", EPIC_REDIRECT)
                .append_pair("token_type", "eg1");
            let response = Client::new()
                .post(url)
                .header("content-type", "application/x-www-form-urlencoded")
                .send().await
                .map_err(|e| e.to_string())?;
            if !response.status().is_success() { return Err(format!("Epic sign-in failed (HTTP {})", response.status())); }
            let body: Value = response.json().await.map_err(|e| e.to_string())?;
            (
                body.get("access_token").and_then(Value::as_str).unwrap_or("").to_string(),
                body.get("refresh_token").and_then(Value::as_str).unwrap_or("").to_string(),
            )
        }
        _ => return Err("This store does not use a browser sign-in.".into()),
    };
    if access.is_empty() { return Err("The store did not return an access token.".into()); }
    let mut entry = serde_json::Map::new();
    entry.insert("accessToken".into(), json!(access));
    entry.insert("refreshToken".into(), json!(refresh));
    let mut all = read_credentials(app)?;
    all[store] = Value::Object(entry);
    write_credentials(app, &all)?;
    Ok(status(&all, steam_connected))
}

pub async fn fetch(
    store: &str,
    credentials: &Value,
    steam_key: Option<&str>,
    steam_id: Option<&str>,
) -> Result<Vec<Value>, String> {
    match store {
        "steam" => {
            let key = steam_key.filter(|s| !s.is_empty()).ok_or("Enter your Steam Web API key in Settings.")?;
            let id = steam_id.filter(|s| !s.is_empty()).ok_or("Enter your SteamID64 in Settings.")?;
            steam_fetch(key, id).await
        }
        "epic" => epic_fetch(credentials).await,
        "gog" => gog_fetch(credentials).await,
        "battlenet" => battlenet_rows(),
        _ => Err("Unknown store".into()),
    }
}

fn steam_owned_query<'a>(key: &'a str, steam_id: &'a str) -> [(&'a str, &'a str); 8] {
    [
        ("key", key),
        ("steamid", steam_id),
        ("include_appinfo", "1"),
        ("include_played_free_games", "1"),
        // Without this, free-to-play titles the account claimed but never launched are omitted.
        ("include_all_free_games", "1"),
        ("include_free_sub", "1"),
        // New/unvetted store apps are exactly the kind of title a user may have just added.
        ("skip_unvetted_apps", "0"),
        ("format", "json"),
    ]
}

async fn steam_fetch(key: &str, steam_id: &str) -> Result<Vec<Value>, String> {
    let query = steam_owned_query(key, steam_id);
    let response = Client::new().get(STEAM_OWNED_GAMES).query(&query).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Steam API returned HTTP {}", response.status())); }
    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    let games = body.get("response").and_then(|r| r.get("games")).and_then(Value::as_array)
        .ok_or("Steam returned no game list. Set your profile's Game details to Public and try again.")?;
    // Do not treat "all playtime is zero" as private. A newly added free game has no playtime and
    // must still be imported as Backlog; a genuinely private profile returns no game list at all.
    let mut out = Vec::new();
    let mut known_titles = HashMap::new();
    for game in games {
        let app_id = game.get("appid").and_then(Value::as_i64).unwrap_or(0);
        if app_id <= 0 { continue; }
        let mut title = game.get("name").and_then(Value::as_str).unwrap_or("").trim().to_string();
        if title.is_empty() {
            title = steam_app_title(app_id).await.unwrap_or_default();
        }
        if title.is_empty() { continue; }
        let minutes = game.get("playtime_forever").and_then(Value::as_i64).unwrap_or(0);
        let last = game.get("rtime_last_played").and_then(Value::as_i64).filter(|value| *value > 0);
        let recent = game.get("playtime_2weeks").and_then(Value::as_i64).unwrap_or(0) > 0;
        known_titles.insert(app_id.to_string(), title.clone());
        out.push(json!({
            "store": "steam", "storeId": app_id.to_string(), "title": title,
            "playtimeMinutes": minutes, "lastPlayedUnix": last,
            "recentlyPlayed": recent, "installed": false
        }));
    }
    if let Ok(wishlist) = steam_wishlist(steam_id, &known_titles).await { out.extend(wishlist); }
    Ok(out)
}

async fn steam_wishlist(steam_id: &str, known_titles: &HashMap<String, String>) -> Result<Vec<Value>, String> {
    let query = [("steamid", steam_id), ("format", "json")];
    let response = Client::new()
        .get(STEAM_WISHLIST)
        .query(&query)
        .send().await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Steam wishlist returned HTTP {}", response.status())); }
    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    // Private and empty wishlists both answer `{"response":{}}` — treat that as no wishlist games.
    let items = match body["response"]["items"].as_array() {
        Some(items) => items,
        None => return Ok(Vec::new()),
    };
    let mut out = Vec::new();
    for item in items {
        let app_id = item.get("appid").and_then(Value::as_i64).unwrap_or(0);
        if app_id <= 0 { continue; }
        let id = app_id.to_string();
        let title = match known_titles.get(&id) {
            Some(title) => title.clone(),
            None => steam_app_title(app_id).await.unwrap_or_else(|| format!("Steam app {}", id)),
        };
        out.push(json!({
            "store": "steam", "storeId": id, "title": title,
            "playtimeMinutes": 0, "wishlist": true, "installed": false
        }));
    }
    Ok(out)
}

async fn steam_app_title(app_id: i64) -> Option<String> {
    let url = format!("{}?appids={}&l=english", STEAM_APP_DETAILS, app_id);
    let response = Client::new()
        .get(url)
        .header("User-Agent", "Mozilla/5.0")
        .send().await
        .ok()?;
    if !response.status().is_success() { return None; }
    let body: Value = response.json().await.ok()?;
    let id = app_id.to_string();
    body.get(&id)?
        .get("data")?
        .get("name")?
        .as_str()
        .map(|name| name.trim().to_string())
        .filter(|name| !name.is_empty())
}

pub async fn achievements(steam_key: Option<&str>, steam_id: Option<&str>, store_id: &str) -> Result<Value, String> {
    let key = steam_key.filter(|s| !s.is_empty()).ok_or("Enter your Steam Web API key in Settings.")?;
    let steam_id = steam_id.filter(|s| !s.is_empty()).ok_or("Enter your SteamID64 in Settings.")?;
    let query = [("key", key), ("steamid", steam_id), ("appid", store_id), ("format", "json")];
    let response = Client::new().get(STEAM_ACHIEVEMENTS).query(&query).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Ok(json!({ "achieved": 0, "total": 0 })); }
    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    let empty: Vec<Value> = Vec::new();
    // `success: false` ("Requested app has no stats") is normal: no achievements, never an error.
    let list = if body["playerstats"]["success"].as_bool() == Some(false) {
        empty.as_slice()
    } else {
        body["playerstats"]["achievements"].as_array().unwrap_or(&empty).as_slice()
    };
    let achieved = list.iter().filter(|item| item.get("achieved").and_then(Value::as_i64).unwrap_or(0) > 0).count();
    let first_unlock = first_unlock_unix(list);
    Ok(json!({ "achieved": achieved, "total": list.len(), "firstUnlockUnix": first_unlock }))
}

/// Earliest unlock time among achievements the player actually has. Locked entries have `unlocktime: 0`.
fn first_unlock_unix(list: &[Value]) -> Option<i64> {
    list.iter()
        .filter(|item| item.get("achieved").and_then(Value::as_i64).unwrap_or(0) > 0)
        .filter_map(|item| item.get("unlocktime").and_then(Value::as_i64))
        .filter(|time| *time > 0)
        .min()
}

async fn gog_fetch(credentials: &Value) -> Result<Vec<Value>, String> {
    let token = credentials.get("gog").and_then(|s| s.get("accessToken")).and_then(Value::as_str)
        .ok_or("GOG is not connected.")?;
    let mut out = Vec::new();
    for page in 1..=50i64 {
        let page_text = page.to_string();
        let query = [("mediaType", "1"), ("page", page_text.as_str())];
        let response = Client::new().get(GOG_PRODUCTS).query(&query).bearer_auth(token).send().await.map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("GOG returned HTTP {} — this community API is fragile, try again later", response.status()));
        }
        let body: Value = response.json().await.map_err(|e| e.to_string())?;
        let products = body.get("products").and_then(Value::as_array).ok_or("GOG returned no product list")?;
        for product in products {
            let id = product.get("id").and_then(Value::as_i64).unwrap_or(0);
            let title = product.get("title").and_then(Value::as_str).unwrap_or("").trim().to_string();
            if id > 0 && !title.is_empty() {
                out.push(json!({ "store": "gog", "storeId": id.to_string(), "title": title, "installed": false }));
            }
        }
        let total_pages = body.get("totalPages").and_then(Value::as_i64).unwrap_or(page);
        if products.is_empty() || page >= total_pages { break; }
    }
    Ok(out)
}

async fn epic_fetch(credentials: &Value) -> Result<Vec<Value>, String> {
    let token = credentials.get("epic").and_then(|s| s.get("accessToken")).and_then(Value::as_str)
        .ok_or("Epic is not connected.")?;
    let mut cursor = String::new();
    let mut out = Vec::new();
    for _ in 0..50 {
        let response = (if cursor.is_empty() {
            Client::new().get(EPIC_LIBRARY).query(&[("includeMetadata", "true")]).bearer_auth(token).send().await
        } else {
            Client::new().get(EPIC_LIBRARY).query(&[("includeMetadata", "true"), ("cursor", cursor.as_str())]).bearer_auth(token).send().await
        }).map_err(|e| e.to_string())?;
        if !response.status().is_success() {
            return Err(format!("Epic returned HTTP {} — the unofficial API may have changed", response.status()));
        }
        let body: Value = response.json().await.map_err(|e| e.to_string())?;
        let records = body.get("records").and_then(Value::as_array).ok_or("Epic returned no library records")?;
        for item in records {
            let id = item.get("catalogItemId").and_then(Value::as_str)
                .or_else(|| item.get("itemId").and_then(Value::as_str))
                .unwrap_or("").trim().to_string();
            let title = item.get("title").and_then(Value::as_str)
                .or_else(|| item.get("metadata").and_then(|m| m.get("title")).and_then(Value::as_str))
                .or_else(|| item.get("metadata").and_then(|m| m.get("displayName")).and_then(Value::as_str))
                .unwrap_or("").trim().to_string();
            if !id.is_empty() && !title.is_empty() {
                out.push(json!({ "store": "epic", "storeId": id, "title": title, "installed": false }));
            }
        }
        let next = body.get("nextCursor").and_then(Value::as_str).unwrap_or("").to_string();
        if next.is_empty() || next == cursor { break; }
        cursor = next;
    }
    Ok(out)
}

fn ident(name: &str) -> String { name.replace('"', "\"\"") }

/// Best-effort read of Battle.net's local Agent database. Schema is unverified, so discover
/// tables/columns at runtime and hand raw rows to TypeScript for normalization.
pub fn battlenet_rows() -> Result<Vec<Value>, String> {
    let path = battlenet_path().ok_or("Battle.net Agent database not found on this computer.")?;
    let flags = rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX;
    let connection = rusqlite::Connection::open_with_flags(&path, flags)
        .map_err(|e| format!("Could not read the Battle.net Agent database: {e}"))?;

    let mut tables: Vec<String> = Vec::new();
    {
        let mut statement = connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").map_err(|e| e.to_string())?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
        for row in rows { if let Ok(name) = row { tables.push(name); } }
    }

    let mut out = Vec::new();
    for table in tables {
        let mut columns: Vec<String> = Vec::new();
        {
            let pragma = format!("PRAGMA table_info(\"{}\")", ident(&table));
            let mut statement = connection.prepare(&pragma).map_err(|e| e.to_string())?;
            let rows = statement.query_map([], |row| row.get::<_, String>(1)).map_err(|e| e.to_string())?;
            for row in rows { if let Ok(name) = row { columns.push(name); } }
        }
        let code_column = columns.iter().find(|c| {
            let lower = c.to_lowercase();
            lower.contains("code") || lower == "product"
        }).cloned();
        let name_column = columns.iter().find(|c| {
            let lower = c.to_lowercase();
            lower.contains("name") || lower.contains("title")
        }).cloned();
        let (Some(code_column), Some(name_column)) = (code_column, name_column) else { continue; };
        let sql = format!(
            "SELECT \"{}\", \"{}\" FROM \"{}\" LIMIT 200",
            ident(&code_column), ident(&name_column), ident(&table)
        );
        let mut statement = connection.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = statement.query_map([], |row| Ok((
            row.get::<_, String>(0).unwrap_or_default(),
            row.get::<_, String>(1).unwrap_or_default(),
        ))).map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            if row.0.is_empty() { continue; }
            out.push(json!({ "code": row.0, "name": row.1 }));
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::{first_unlock_unix, steam_owned_query};
    use serde_json::json;

    #[test]
    fn owned_query_requests_unplayed_free_games() {
        let query = steam_owned_query("key", "steamid");
        assert!(query.contains(&("include_all_free_games", "1")));
        assert!(query.contains(&("include_free_sub", "1")));
        assert!(query.contains(&("skip_unvetted_apps", "0")));
    }

    #[test]
    fn uses_the_earliest_unlocked_achievement_time() {
        let list = vec![
            json!({ "achieved": 1, "unlocktime": 1_700_000_000 }),
            json!({ "achieved": 0, "unlocktime": 0 }),
            json!({ "achieved": 1, "unlocktime": 1_500_000_000 }),
            json!({ "achieved": 1, "unlocktime": 1_600_000_000 }),
        ];
        assert_eq!(first_unlock_unix(&list), Some(1_500_000_000));
    }

    #[test]
    fn ignores_locked_entries_and_no_achievements() {
        let list = vec![json!({ "achieved": 0, "unlocktime": 1_400_000_000 })];
        assert_eq!(first_unlock_unix(&list), None);
        assert_eq!(first_unlock_unix(&[]), None);
    }
}
