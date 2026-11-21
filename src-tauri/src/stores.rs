//! Desktop-only store connectors. All HTTP and token storage stays in Rust;
//! the webview only sees normalized game records and a connection status.
//!
//! Endpoint URLs are kept here so an unofficial API change is a one-file fix.

use base64::{ engine::general_purpose::STANDARD, Engine };
use reqwest::Client;
use serde_json::{ json, Value };
use std::collections::{ HashMap, HashSet };
use std::path::PathBuf;
use tauri::Manager;

const STEAM_OWNED_GAMES: &str = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/";
const STEAM_ACHIEVEMENTS: &str = "https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/";
/// Steam's supported keyless wishlist API. The old `wishlistdata/` page now 302s to the store home.
const STEAM_WISHLIST: &str = "https://api.steampowered.com/IWishlistService/GetWishlist/v1/";
/// The wishlist API returns app ids only; resolve names with the store's basic app-details endpoint.
const STEAM_APP_DETAILS: &str = "https://store.steampowered.com/api/appdetails";
/// Epic's public launcher credentials (widely published by Legendary; not user secrets).
const EPIC_CLIENT_ID: &str = "34a02cf8f4414e29b15921876da36f9a";
const EPIC_CLIENT_SECRET: &str = "daafbccc737745039dffe53d94fc76cf";
const EPIC_AUTH_URL: &str = "https://www.epicgames.com/id/login?redirectUrl=https%3A%2F%2Fwww.epicgames.com%2Fid%2Fapi%2Fredirect%3FclientId%3D34a02cf8f4414e29b15921876da36f9a%26responseType%3Dcode";
const EPIC_TOKEN: &str = "https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token";
const EPIC_LIBRARY: &str = "https://library-service.live.use1a.on.epicgames.com/library/api/public/items";
const EPIC_CATALOG: &str = "https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace";

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

pub fn status(credentials: &Value, steam_connected: bool) -> Value {
    let connected = |store: &str| -> bool {
        credentials.get(store)
            .and_then(Value::as_object)
            .map(|entry| !entry.is_empty())
            .unwrap_or(false)
    };
    json!({
        "steam": steam_connected,
        "epic": connected("epic")
    })
}

pub fn auth_url(store: &str) -> Result<String, String> {
    if store == "epic" { Ok(EPIC_AUTH_URL.into()) }
    else { Err("This store does not use a browser sign-in.".into()) }
}

pub async fn complete_auth(app: &tauri::AppHandle, store: &str, code: &str, steam_connected: bool) -> Result<Value, String> {
    if store != "epic" { return Err("This store does not use a browser sign-in.".into()); }
    let code = code.trim();
    if code.is_empty() { return Err("Paste the authorization code first.".into()); }

    let basic = STANDARD.encode(format!("{}:{}", EPIC_CLIENT_ID, EPIC_CLIENT_SECRET));
    let response = Client::new()
        .post(EPIC_TOKEN)
        .header("authorization", format!("Basic {basic}"))
        .header("content-type", "application/x-www-form-urlencoded")
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("token_type", "eg1"),
        ])
        .send().await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() { return Err(format!("Epic sign-in failed (HTTP {})", response.status())); }
    let body: Value = response.json().await.map_err(|e| e.to_string())?;
    if let Some(message) = body.get("errorMessage").and_then(Value::as_str) {
        return Err(format!("Epic sign-in failed: {message}"));
    }
    let access = body.get("access_token").and_then(Value::as_str).unwrap_or("").to_string();
    let refresh = body.get("refresh_token").and_then(Value::as_str).unwrap_or("").to_string();
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

fn epic_title_from_catalog(body: &Value, id: &str) -> Option<String> {
    body.get(id)
        .and_then(|item| item.get("title"))
        .and_then(Value::as_str)
        .or_else(|| body.as_object()?.values().find_map(|item| item.get("title").and_then(Value::as_str)))
        .map(str::trim)
        .filter(|title| !title.is_empty())
        .map(str::to_string)
}

/// Epic library records often contain only ids. Resolve display names through the public catalog
/// endpoint, the same way the Legendary launcher does. Failures are cached so each item is tried once.
async fn epic_catalog_title(
    token: &str,
    namespace: &str,
    id: &str,
    cache: &mut HashMap<String, Option<String>>,
) -> Option<String> {
    if namespace.is_empty() || namespace == "ue" || id.is_empty() { return None; }
    let key = format!("{namespace}:{id}");
    if let Some(cached) = cache.get(&key) { return cached.clone(); }

    let mut url = reqwest::Url::parse(&format!("{EPIC_CATALOG}/{namespace}/bulk/items")).ok()?;
    url.query_pairs_mut()
        .append_pair("id", id)
        .append_pair("includeDLCDetails", "true")
        .append_pair("includeMainGameDetails", "true")
        .append_pair("country", "US")
        .append_pair("locale", "en");

    let title = async {
        let response = Client::new().get(url).bearer_auth(token).send().await.ok()?;
        if !response.status().is_success() { return None; }
        let body: Value = response.json().await.ok()?;
        epic_title_from_catalog(&body, id)
    }.await;

    cache.insert(key, title.clone());
    title
}

async fn epic_fetch(credentials: &Value) -> Result<Vec<Value>, String> {
    let token = credentials.get("epic").and_then(|s| s.get("accessToken")).and_then(Value::as_str)
        .ok_or("Epic is not connected.")?;
    let mut cursor = String::new();
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    let mut titles = HashMap::new();

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
            let namespace = item.get("namespace").and_then(Value::as_str).unwrap_or("").trim();
            if id.is_empty() || namespace == "ue" || !seen.insert(id.clone()) { continue; }

            let mut title = item.get("title").and_then(Value::as_str)
                .or_else(|| item.get("metadata").and_then(|m| m.get("title")).and_then(Value::as_str))
                .or_else(|| item.get("metadata").and_then(|m| m.get("displayName")).and_then(Value::as_str))
                .unwrap_or("").trim().to_string();
            if title.is_empty() {
                if let Some(resolved) = epic_catalog_title(token, namespace, &id, &mut titles).await { title = resolved; }
            }
            if !title.is_empty() {
                out.push(json!({ "store": "epic", "storeId": id, "title": title, "installed": false }));
            }
        }
        let next = body.get("responseMetadata")
            .and_then(|meta| meta.get("nextCursor"))
            .and_then(Value::as_str)
            .or_else(|| body.get("nextCursor").and_then(Value::as_str))
            .unwrap_or("").to_string();
        if next.is_empty() || next == cursor { break; }
        cursor = next;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::{epic_title_from_catalog, first_unlock_unix, steam_owned_query};
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

    #[test]
    fn resolves_epic_title_from_catalog_response() {
        let body = json!({ "abc-123": { "title": "  Hades  " } });
        assert_eq!(epic_title_from_catalog(&body, "abc-123").as_deref(), Some("Hades"));
        // The catalog is queried with one id, so the first value is a safe fallback.
        assert_eq!(epic_title_from_catalog(&body, "missing").as_deref(), Some("Hades"));
        assert_eq!(epic_title_from_catalog(&json!({}), "abc-123"), None);
    }
}
