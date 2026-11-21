# Store Import Guide (Desktop)

Lost in Sync can import your **Steam** and **Epic Games** libraries on the desktop app only. The web build never connects to a store; it can only receive already-imported games through a normal JSON export/import.

This guide covers the exact steps and the field-by-field mapping used during import.

---

## Before you start

1. Open the desktop app and go to **Settings**.
2. Add your **IGDB Twitch Client ID** and **Client Secret** in the IGDB credentials section. Imported games can still be created without them, but IGDB credentials are needed for covers, metadata, and reliable matching.
3. Open **Import from game stores** in Settings.

The panel has two tabs: **Steam** and **Epic Games**.

> Steam keys/SteamID64 are saved with your app settings like the IGDB keys. Epic tokens are stored by Rust in `<app_data>/store-credentials.json`. Neither is written to JSON exports or web Drive snapshots.

---

## Import from Steam

### 1. Prepare Steam

- Create a free Steam Web API key: <https://steamcommunity.com/dev/apikey>.
- Find your 17-digit **SteamID64** (for example from your Steam profile URL or a SteamID lookup site).
- In Steam, set **Profile → Edit Profile → Privacy Settings → Game details** to **Public**. A private profile returns no owned-game list even with a valid key.
- If you want wishlist games imported, keep your **wishlist public**.

### 2. Connect and fetch

1. Select **Steam** in the store tabs.
2. Paste the API key into **Steam Web API key** and your numeric ID into **SteamID64**. They are saved automatically as you type, like the IGDB credentials. There is no separate save button.
3. Confirm the panel shows **Status: Connected**.
4. Click **Fetch library**.

Steam achievements are always fetched for owned games; there is no achievement opt-in checkbox.

### 3. Review and import

After the fetch finishes, the app shows how many records Steam returned. Click **Start import** to continue, or **Cancel** to discard the fetch.

The import report shows:

- **imported** — new games added.
- **linked** — store ids added to games that already existed.
- **refreshed** — store-owned fields updated on existing games.
- **needs review** — games imported without a confident IGDB match.
- **duplicates**, **warnings**, and **failures**.

Use **Copy report** to keep a copy of the details.

---

## Import from Epic Games

Epic has no official public library API. The app uses Epic launcher-compatible endpoints, so an Epic outage or endpoint change can make the fetch fail. The app does not log tokens.

### 1. Sign in

1. Select **Epic Games** in the store tabs.
2. While the panel says **Not connected**, use **Open sign-in page**. Your system browser opens Epic's sign-in page.
3. Sign in with your Epic account. You land on a page containing an **`authorizationCode`**.
4. Copy that code, paste it into **Authorization code**, and click **Complete sign-in**.

Once sign-in succeeds, **Open sign-in page**, **Authorization code**, and **Complete sign-in** disappear and the panel shows **Connected**. If the connection is later lost or the token is removed from the device, those controls reappear. Switching store tabs or retrying a failed fetch refreshes the connection status.

### 2. Fetch and import

1. With Epic showing **Connected**, click **Fetch library**.
2. The app reads every library page, skips Unreal Engine (`ue`) namespace items, de-duplicates catalog ids, and resolves missing display names through Epic's public catalog endpoint.
3. Review the record count and click **Start import**.

Epic imports **ownership only**. Epic exposes no reliable public playtime, last-played, or achievement data, so those fields are not guessed.

---

## Steam field mapping

### Source fields

| Steam field | Used for |
|---|---|
| `appid` | `storeLinks` entry `{ store: "steam", id: "<appid>" }` and direct IGDB lookup |
| `name` | Initial title; replaced by IGDB `name` when matched |
| `playtime_forever` (minutes) | `steamPlaytimeSeconds` and `totalSeconds` (`minutes × 60`) |
| `playtime_2weeks` | Whether the game is `Playing` |
| `rtime_last_played` (Unix seconds) | `lastPlayedAt` and completion date |
| Wishlist app id | Wishlist record; ownership wins if the game is also owned |
| `GetPlayerAchievements`: `achieved`, `achieved > 0` unlock times | `storeAchievements`, `platinumed`, and start date |

`GetPlayerAchievements` returning `success: false` (“Requested app has no stats”) is treated as **zero achievements**, not as an import failure.

### Status criteria

A Steam game counts as **played** only when it has both `playtimeMinutes > 0` and a real `rtime_last_played` value. Claimed-but-never-launched free games have zero playtime and no last-played date, so they do not count as played.

| Condition | Imported status | Dates / mastery |
|---|---|---|
| Wishlist-only, not played | `Wishlist` | No start or completion date; not mastered |
| Not played (including unlaunched free games) | `Backlog` | No start or completion date; not mastered |
| Played and `playtime_2weeks > 0` | `Playing` | Start date set; **no** completion date |
| Played and not recently played | `Completed` | Start date set; `finishedAt` = `rtime_last_played` date |

If an app appears in both the owned list and the wishlist, the owned record wins.

**Status is set only on first import.** Re-syncing refreshes store-owned fields but never overwrites a status you changed yourself.

### Start and completion dates

`startedAt` is chosen in this order:

1. The earliest unlock time among Steam achievements you actually unlocked.
2. The earlier of the game's add date and its last-played date.

The result is clamped so `startedAt` can never be later than `finishedAt`.

`finishedAt` is set only for `Completed` games and comes from `rtime_last_played`. `Playing`, `Backlog`, and `Wishlist` games have no completion date. `lastPlayedAt` stores the last-played date whenever Steam provides a real one.

### Mastery and playtime

- `platinumed` becomes `true` only when `total > 0` and `achieved >= total`. A game with zero achievements is never marked mastered.
- `storeAchievements` keeps `{ achieved, total, firstUnlockUnix? }`.
- `totalSeconds` is replaced during a re-sync only when it still matches the previous Steam value (or is untouched). If you edited playtime yourself, the import leaves it alone.

---

## Epic field mapping

| Epic / app data | Imported result |
|---|---|
| Catalog item id | `storeLinks` entry `{ store: "epic", id: "<catalogItemId>" }` |
| Catalog or library title | Initial title; cleaned for trademark marks and common edition suffixes before matching |
| IGDB match | IGDB name, cover, backdrop, release date, platforms, genres, developer, description, ratings, and Time-To-Beat fields |
| No playtime source | `totalSeconds = 0`; `steamPlaytimeSeconds` is not set |
| No last-played source | No `lastPlayedAt`, `startedAt`, or `finishedAt` |
| No achievement source | No `storeAchievements`; `platinumed` is not set |
| First import | `Backlog` |
| Later re-sync | Store identity refreshed; user status and other manual edits preserved |

### How Epic games match to IGDB

1. **Direct id lookup:** the Epic catalog item id is looked up in IGDB `external_games.uid`, using Epic source `26` (with legacy `category` and non-Epic source tags accepted for GUID matches).
2. **Strict title search:** IGDB `/ <cleaned title>` must contain an exact normalized title.
3. **Unique normalized title:** only one normalized-title hit is accepted.
4. **Needs review:** ambiguous or missing matches are imported locally with the store title and listed in the report. No fuzzy guess is made.

Cleaning removes `®`, `™`, `©`, trailing mark tokens, and common suffixes such as “Game of the Year Edition”.

If a previously imported Epic game had no IGDB id, a later sync can enrich it once a confident match becomes available.

---

## Matching, art, and manual edits

- Matching order for both stores is: direct store-id lookup (or Epic catalog-id lookup) → strict `/ ` title search → unique normalized title.
- Ambiguous or missing matches are imported locally and appear under **Needs review** rather than being guessed.
- Covers and backdrops come only from IGDB remote URLs. Store artwork is never written to the desktop `images/` folder.
- Notes, ratings, favorites, manually edited status, and manually edited playtime are never overwritten by store import.
- Optional store fields survive desktop ↔ web JSON export/import; credentials do not.
