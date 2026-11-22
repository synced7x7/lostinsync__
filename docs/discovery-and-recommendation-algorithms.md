# Discovery & Recommendation Algorithms

> Verified against source on 2026-11-22. This document describes the algorithms currently used in the **Discover** tab feeds and the **Find My Next Game** dashboard recommendation.

---

## 1. Discover Tab

The Discover tab is powered by IGDB data. Rust (`src-tauri/src/lib.rs`, `igdb_discover_feed`) retrieves candidate games from IGDB; for ranking-heavy feeds it scores candidates in Rust and returns a paged result. The frontend (`src/features/discover.tsx`) builds a local taste profile for **For You** and caches feed pages.

### 1.1 Common concepts

#### Bayesian-adjusted rating

Raw IGDB ratings are noisy when a game has few votes. The ranking uses a Bayesian average:

```text
bayes(R, N, m, C) = (N * R + m * C) / (N + m)
```

Where:

- `R` = game's IGDB `total_rating` (0–100).
- `N` = game's IGDB `total_rating_count`.
- `m` = prior weight (confidence threshold / minimum-votes equivalent).
- `C` = global average rating baseline.

`C` is computed once per app session from an un-sorted IGDB sample:

```text
where total_rating != null & total_rating_count >= 10 & game_type = 0 & first_release_date <= now
limit 500
C = mean(total_rating of sample), fallback 72.0
```

#### Candidate pool → rank → page

Feeds ranked in Rust fetch a larger IGDB candidate pool, score it, sort descending by score, apply feed-specific rules, then page the result:

```text
page = ranked.skip(offset).take(limit)
offset clamped to [0, 90], limit clamped to [1, 30]
```

---

### 1.2 Feed-by-feed behavior

| Feed | Source/ranking | Key IGDB filter / sort | Notes |
|---|---|---|---|
| Trending Now | IGDB hypes + custom trending query | `trending_games(...)` | Direct IGDB retrieval; paged. |
| Most Anticipated | IGDB direct sort/page | `first_release_date > now & hypes != null`, sort `hypes desc` | Not Rust-ranked. Discover home shows it as a hero (6 fetched, up to 4 displayed) with artwork/screenshot `art`, release date, hypes, and a live countdown. |
| For You | Rust-ranked | Candidate pool by top user genres; fallback to popular highly rated released games | Uses taste profile, owned-ID exclusion, diversity rerank. |
| All Time Popular | IGDB direct sort/page | `total_rating_count > 0 & released`, sort `total_rating_count desc` | IGDB supports only one sort field. |
| Top Rated | Rust-ranked | `total_rating != null & total_rating_count > 1500 & released`, pool sort `total_rating desc`, limit 100 | Bayesian ranking, `m=1500`. |
| Latest Releases | IGDB direct sort/page | `released`, sort `first_release_date desc` | Not Rust-ranked. |
| Indie Spotlight | Rust-ranked | Indie genre/company candidate pools, merged/deduped | Indie classification + Bayesian ranking. |
| Upcoming | IGDB direct sort/page | `first_release_date > now`, sort `first_release_date asc` | Not Rust-ranked. |
| Story-Driven Adventures | Rust-ranked | `storyline != null & total_rating != null & total_rating_count >= 100 & released`, pool sort `total_rating desc`, limit 200 | Narrative score + Bayesian quality. |

`released` means `game_type = 0 & first_release_date <= now`.

---

### 1.3 For You

**Goal:** recommend released games the user is likely to enjoy, based on local library taste.

#### Taste profile (frontend, `buildTaste`)

The frontend builds a genre weight map from local games (`src/features/discover.tsx`):

```text
For each game g and canonical genre f in g:
  count_f += 1
  if g.rating exists: rated_f += 1; ratingSum_f += g.rating
```

Normalization:

```text
maxCount = max(1, max(count_f))
libRating = (sum(ratingSum_f) / sum(rated_f)) / 10   if any rated games else 0
```

Signal weights (dropped and renormalized if unavailable):

```text
wf = 0.30  (frequency)
wr = 0.40  (rating, only if library has ratings)
wsum = wf + wr
```

Genre score:

```text
W_f = (
  wf * (count_f / maxCount)
  + wr * (rated_f ? (ratingSum_f / rated_f / 10) : libRating)
) / wsum
```

Only genres with `W_f >= 0.15` are kept, sorted desc, capped to top 12, rounded to 3 decimals.

The profile also includes:

- `ownedIds`: local games with `igdbId`.
- `confidence = min(1, librarySize / 15)`.
- `key`: stable cache key from weights, owned count, and owned ID checksum.

#### Candidate retrieval (Rust)

Top 12 weighted genres are turned into an IGDB genre filter:

```text
(genres.name = "A" | genres.name = "B" | ...) 
  & total_rating != null
  & total_rating_count > 10
  & released
sort total_rating desc
limit 200
```

If no genres are available (empty/cold library):

```text
total_rating != null & total_rating_count > 500 & released
```

#### Scoring (Rust)

Owned IGDB IDs are excluded. For each candidate:

```text
Q = bayes(total_rating, total_rating_count, M_FOR_YOU, C) / 100
M_FOR_YOU = 100

A = mean(W_f for candidate genres present in taste profile), or 0 if none
S = 0.65 * Q + 0.35 * confidence * A
```

Candidates are sorted by `S` desc.

#### Diversity rerank

A soft rule prevents 3 games with the same dominant taste genre in a row when another candidate can be placed:

```text
dominant genre = candidate genre with highest taste weight
if last two placed share dominant G, prefer next candidate whose dominant != G
```

---

### 1.4 Top Rated

```text
Filter: total_rating != null & total_rating_count > 1500 & released
Pool: 100, sort total_rating desc
Score: bayes(total_rating, total_rating_count, 1500, C)
```

High `m` strongly favors games with large vote counts.

---

### 1.5 Hidden Gems

Hidden Gems is currently **removed from the Discover UI/feed list**. The previous algorithm was:

```text
Filter: total_rating != null & 30 <= total_rating_count < 3000 & released
Q = bayes(R, N, 75, C) / 100
O = clamp(1 - ln(1 + N) / ln(1 + 3000), 0, 1)
H = 0.75 * Q + 0.25 * O
```

It is not active in the current feed set.

---

### 1.6 Indie Spotlight

#### Candidate retrieval

Two pools are merged and deduped by IGDB ID:

1. `genres.name = "Indie" & involved_companies != null & total_rating != null & total_rating_count >= 30 & released`, limit 200.
2. Curated developer-name override query (`involved_companies.company.name ~ "..."`) with same quality/release filters, limit 100.

#### Indie classification

A candidate is indie when:

```text
Confirmed: a developer company name is in INDIE_DEVELOPERS
Likely: no developer has a parent company AND the game has Indie genre
Excluded: no developer data, or developer in NOT_INDIE_DEVELOPERS
```

Curated overrides currently include: Team Cherry, Supergiant Games, ConcernedApe, Re-Logic, Motion Twin, Mega Crit.

#### Ranking

```text
Score = bayes(total_rating, total_rating_count, 100, C)
```

---

### 1.7 Story-Driven Adventures

#### Candidate retrieval

```text
storyline != null & total_rating != null & total_rating_count >= 100 & released
sort total_rating desc
limit 200
fields include storyline, genres, themes, keywords, game_modes
```

#### Narrative relevance score

```text
N in [0, 1], computed from 0–100 points then divided by 100:

+25  storyline present and non-empty
+30  strong narrative genre (Adventure, RPG, Visual Novel, Point-and-click)
+12  partial narrative genre if strong genre not present (Shooter, Hack and slash/Beat 'em up)
+20  keyword evidence, capped: min(20, 10 * keyword_hits)
+15  narrative theme present (Fantasy, Sci-fi, Horror, Historical, Mystery, Drama, Thriller, Romance)
+10  Single player mode present
```

Keyword hits are case-insensitive substring matches against a curated narrative keyword list (`story rich`, `choices matter`, `branching story`, etc.).

#### Final score

```text
If N < 0.4: exclude candidate
Q = bayes(total_rating, total_rating_count, 100, C) / 100
S = 0.65 * Q + 0.35 * N
```

---

## 2. Find My Next Game

Find My Next Game is a local, history-driven backlog recommender shown on the Dashboard (`src/features/dashboard.tsx`). It computes once per app session (module-level cache) and calls the Tauri command `get_backlog_recommendations` (`src-tauri/src/lib.rs`).

### 2.1 Input data

The command reads the local `app_state.data_json` SQLite blob and inspects `games`.

#### History games

A game contributes to taste profiles if:

```text
status in {Completed, Playing, Abandoned, On hold}
OR rating exists
OR startedAt/finishedAt/lastPlayedAt exists
```

Wishlist/Backlog games with no engagement signals are not treated as positive history.

#### Candidate games

```text
status == "Backlog"
```

---

### 2.2 Feature extraction

For each game, features are extracted as normalized tokens:

```text
genre:<name>        from genres[] or legacy genre string
theme:<name>        from themes[]
perspective:<name>  from playerPerspectives[]
type:<name>         from gameType
```

Features are deduped per game.

---

### 2.3 Taste profiles

Two profiles are built from history games.

#### Per-game signals

```text
Rg = clamp(rating / 10, 0, 1) if rating > 0 else 0.5
days = max(now - lastTouched(game), 0) / 86400
Tg = 2^(-days / 60)
```

`lastTouched` is the most recent valid timestamp among `lastPlayedAt`, `activeSince`, `finishedAt`, `startedAt`, `createdAt`.

#### Long-term and recent weights

```text
W_long(g) = Rg
W_recent(g) = Rg * Tg
```

For every feature `f` in game `g`:

```text
long_raw[f] += W_long(g)
recent_raw[f] += W_recent(g)
```

Profiles are normalized by their max value:

```text
P_long[f] = long_raw[f] / max(long_raw)
P_recent[f] = recent_raw[f] / max(recent_raw)
```

The combined preference used for candidate scoring is:

```text
Pref(f) = 0.70 * P_long[f] + 0.30 * P_recent[f]
```

---

### 2.4 Candidate scoring

For each backlog candidate with feature set `F`:

#### Similarity

```text
for f in F:
  pref = Pref(f)
  w = 1 + pref
  sim_sum += w * pref
  sim_w += w

S = clamp(sim_sum / sim_w, 0, 1) if sim_w > 0 else 0
```

Features with `pref > 0.15` are collected as human-readable reasons (top 3).

#### Quality

```text
If igdbRating > 0 and igdbRatingCount > 0:
  Q = clamp(bayes(igdbRating, igdbRatingCount, 50, 72) / 100, 0, 1)
Else if igdbRating > 0:
  Q = clamp(igdbRating / 100, 0, 1)
Else:
  Q = 0.45
```

#### Diversity/exploration bonus

```text
overlap = |{f in F | f in long profile or recent profile}| / max(|F|, 1)

D = 0.15 if 0.2 < overlap < 0.95
D = 0.05 if overlap >= 0.95
D = 0.02 if overlap <= 0.2
D = 0.0 if there is no profile
```

#### Final score

```text
If has profile:
  Final = 0.70*S + 0.20*Q + 0.10*D
If no profile:
  Final = 0.00*S + 0.85*Q + 0.15*D
```

The no-profile fallback keeps recommendations useful for sparse/new libraries.

---

### 2.5 Explanations

For each recommendation:

- **Reasons**: top 3 matched feature preferences (`genre`, `theme`, `perspective`, `type`).
- **Because you played...**: top 3 history games by overlap contribution.

Overlap contribution for a played game `p` against candidate `c`:

```text
overlapScore(p,c) = (0.5 + 0.5 * Rg_p) * sum(Pref(f) for f in features(p) ∩ features(c))
```

The UI maps similar played game IDs to titles.

---

### 2.6 Ordering and session cache

- Candidates are sorted by `Final` desc.
- A light diversity pass avoids 3 same dominant `genre:*` in a row when possible.
- Default result count is 6 (1 best pick + 5 alternatives), clamped to `[1, 20]`.
- The Dashboard caches the result in a module-level session variable (`recsSession`) so it calculates once per app session and is not recalculated on re-renders.

---

## 3. Known limitations / tuning points

- **Metadata coverage**: local games may not have full themes/perspectives/game modes/keywords; scoring quality improves as metadata becomes richer.
- **Taste signal**: Discover For You uses genre frequency and rating signals. Find My Next Game uses rating and recency signals.
- **Starting weights**: all coefficients (`0.70/0.30`, `0.65/0.35`, `0.70/0.20/0.10`, decay half-life 60 days, etc.) are initial tuning values.
- **IGDB constraints**: IGDB query sort has one sort field; some feeds use candidate pools then local ranking.
- **Cold start**: both systems fall back to quality/popular signals when user history is sparse.