# NBA Agency Provider Architecture Verification

**Date:** 2026-04-11  
**Status:** Deep Research Complete  
**Research Sources:** Official API documentation for all NBA providers

---

## Executive Summary

Verified the complete NBA Agency data provider architecture against official API documentation. Found **2 schema gaps**, **5 underutilized data sources**, and **1 critical missing integration** (injury reports). The core M1-M4 implementation is solid; the gap is at the **adapter layer** which hasn't been built yet.

---

## 1. Unified Provider Data Map

### Provider Capabilities Overview

| Provider | Type | Primary Use | NBA Coverage | Auth Required | Keys Available |
|----------|------|-------------|--------------|----------------|----------------|
| **BallDontLie** | Stats/Scores/Odds | Games, Players, Stats, Injuries, Odds | FULL | API Key | 3 keys ✅ |
| **The Odds API** | Odds | Bookmaker odds (h2h/spreads/totals) | FULL | API Key | 1 key ✅ |
| **Odds-Bet365** | Odds (Bet365 only) | Bet365-specific odds | FULL | API Key | 3 keys ✅ |
| **ParlayAPI** | Odds (drop-in replacement) | 40+ bookmakers, same format as Odds API | FULL | API Key | 3 keys ✅ |
| **ESPN** | Scores/News/Standings | Scoreboard, injuries, standings, depth charts | FULL | None (public) | N/A ✅ |
| **nba_api** | Advanced Stats | Official NBA.com stats, play-by-play | FULL | None (but rate-limited) | N/A ✅ |
| **Polymarket** | Prediction Markets | NBA championship/future markets | PARTIAL | Public Gamma API (no key) | 0 keys (public) |

### Detailed Endpoint Coverage

#### BallDontLie (`api.balldontlie.io/v1`)

| Endpoint | Data Provided | Tier | Freshness | **Currently Used?** |
|----------|---------------|------|-----------|-------------------|
| `/teams` | Team info (id, name, conference, division) | Free | Static | ✅ Schema only |
| `/players` | Player info (id, name, team, draft) | Free | Static | ✅ Schema only |
| `/games` | Scores, status, quarter breakdown | Free | Real-time | ✅ Schema only |
| `/stats` | Player game stats (pts, reb, ast, etc.) | ALL-STAR | Real-time | ❌ Not used |
| `/injuries` | **Player injury status** | ALL-STAR | Daily | ❌ **MISSING - CRITICAL** |
| `/season_averages` | Per-player season averages (40+ categories) | GOAT | Daily | ❌ Not used |
| `/team_season_averages` | Team season averages (base/advanced/clutch) | GOAT | Daily | ❌ Not used |
| `/stats/advanced` | PIE, pace, net rating, PER, etc. | GOAT | Post-game | ❌ Not used |
| `/boxscores` | Quarter-by-quarter scoring | GOAT | Real-time | ❌ Not used |
| `/lineups` | Starting lineup data | GOAT | Pre-game | ❌ Not used |
| `/plays` | Play-by-play data | GOAT | Real-time | ❌ Not used |
| `/standings` | Win/loss records, conference standings | GOAT | Daily | ❌ Not used |
| `/leaders` | League leaders (pts, reb, ast per game) | GOAT | Daily | ❌ Not used |
| `/odds` | Betting odds from sportsbooks | GOAT | ~60s | ❌ Not used |
| `/player_props` | Player points/rebounds/assists lines | GOAT | ~60s | ❌ Not used |
| `/contracts` | Player contract details | GOAT | Static | ❌ Not used |

**BallDontLie Tier Requirements:**
- **Free (5 rpm)**: Teams, Players, Games only
- **ALL-STAR ($9.99/mo, 60 rpm)**: + Stats, Active Players, Injuries ⭐, Season/Team Averages
- **GOAT ($39.99/mo, 600 rpm)**: + Advanced Stats, Box Scores, Lineups, Standings, Leaders, Odds, Player Props, Contracts, Plays

#### The Odds API (`api.the-odds-api.com/v4`)

| Endpoint | Data | Markets | Regions | Quota Cost | **Currently Used?** |
|----------|------|--------|---------|------------|-------------------|
| `/sports` | List available sports | - | - | Free | ✅ Schema only |
| `/sports/{sport}/odds` | Live odds by bookmaker | h2h, spreads, totals, outrights | us, us2, uk, au, eu | 1 per market×region | ✅ Full use |
| `/sports/{sport}/scores` | Live + recent scores | - | - | 1-2 | ❌ Not used |
| `/sports/{sport}/events` | Event list (no odds) | - | - | Free | ❌ Not used |
| `/sports/{sport}/events/{id}/odds` | Specific event odds | All | All | 1 per market×region | ❌ Not used |
| `/historical/*` | Historical odds snapshots | All | All | 1 per market×region | ❌ Not used |

**US Bookmakers Available:**
DraftKings, FanDuel, BetMGM, Caesars, Barstool, PointsBet, Bovada, William Hill, Unibet, SugarHouse, BetRivers, BetOnline, etc.

**NBA Sport Key:** `basketball_nba`

#### Odds-Bet365 (`docs.odds-api.io`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Bet365-dedicated odds endpoint |
| **Format** | Same as The Odds API v4 |
| **Different from The Odds API?** | YES - separate provider, Bet365 only |
| **Bookmakers** | Bet365 exclusively |
| **Use Case** | Primary odds source for Bet365 sharp odds |

**⚠️ KEY FINDING:** `OddsSourceSchema` does NOT include `odds_bet365` - this is a **schema gap**.

#### ParlayAPI (`parlay-api.com`)

| Aspect | Details |
|--------|---------|
| **Purpose** | Drop-in replacement for The Odds API |
| **Format** | Same response format as Odds API v4 |
| **Bookmakers** | 40+ (FanDuel, DraftKings, Bet365, etc.) |
| **Use Case** | Fallback when Odds API is rate-limited or unavailable |
| **Quotas** | Similar to Odds API |

**⚠️ KEY FINDING:** `OddsSourceSchema` includes `parlay` but **OddsSourceSchema in schema.ts only has `["odds_api", "parlay", "polymarket", "balldontlie"]`** - missing `odds_bet365`.

#### ESPN Hidden API

| Endpoint | Data | Auth | **Currently Used?** |
|----------|------|------|-------------------|
| `site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard` | Live scores, quarter breakdown | None | ✅ Schema only |
| `site.api.espn.com/apis/site/v2/sports/basketball/nba/teams` | All NBA teams | None | ❌ Not used |
| `site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{id}/depthcharts` | Team depth charts | None | ❌ Not used |
| `site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={id}` | Game summary | None | ❌ Not used |
| `site.api.espn.com/apis/site/v2/sports/basketball/nba/rankings` | Power rankings | None | ❌ Not used |
| `sports.core.api.espn.com/v2/sports/basketball/nba/teams/{id}/injuries` | Team injuries | None | ⚠️ Referenced but NOT in schema |

**ESPN Additional Parameters:**
- `?dates=YYYYMMDD` - Filter by date
- `?groups=50` - Include all Division I (for college)
- `?limit=365` - Max results

#### nba_api (Python package `swar/nba_api`)

| Module | Data | Rate Limit |
|--------|------|------------|
| `live.nba.endpoints.scoreboard` | Today's games | ~10-15 sec refresh |
| `stats.endpoints.*` | 100+ stat endpoints | Requires proxy for production |
| `stats.static.players` | Static player dataset | N/A |
| `stats.static.teams` | Static team dataset | N/A |

**Key Advantage:** Most comprehensive NBA stats available (play-by-play, advanced metrics, etc.)
**Key Disadvantage:** Unofficial API, rate-limited by NBA.com, requires proxy for heavy use

#### Polymarket

| API | Purpose | Auth | NBA Markets? |
|-----|---------|------|--------------|
| **CLOB Client** | Trading, order book | API Key + credentials | DENY in v1 |
| **Gamma API** | Market data (public) | None | Limited |
| **Data API** | Historical market data | None | Limited |

**Note:** Polymarket primarily offers political/economics markets. NBA championship markets exist but are limited.

---

## 2. Schema Gaps Analysis

### Gap #1: `OddsSourceSchema` Missing Providers

**Current Definition in `schema.ts`:**
```typescript
export const OddsSourceSchema = z.enum(["odds_api", "parlay", "polymarket", "balldontlie"])
```

**Missing:**
- ❌ `odds_bet365` - Bet365-dedicated odds (separate from odds_api)
- ❌ May need `odds_bet365` as distinct from `odds_api` for proper routing

**Impact:** Cannot properly route to Bet365-specific odds in the adapter chain.

### Gap #2: `SourceSchema` Incomplete

**Current Definition in `schema.ts`:**
```typescript
export const SourceSchema = z.enum(["espn", "balldontlie", "nba_api", "odds_api", "polymarket"])
```

**Missing:**
- ❌ `odds_bet365` - Should be separate from `odds_api`

---

## 3. Injury Reports - Critical Missing Data

### Current Implementation

The plan references ESPN injuries with 6-hour freshness:
```typescript
export const ESPN_INJURIES_MAX_AGE_SECONDS = 21600  // 6 hours
```

But the `SourceSchema` only has `espn` as a general source - no specific injury endpoint.

### BallDontLie Injury Endpoint (⭐ UNDERRUTILIZED)

BallDontLie provides a **dedicated injury endpoint** that is **NOT currently used**:

```
GET /v1/injuries
```

**Response:**
```json
{
  "data": [
    {
      "id": "string",
      "player_id": 123,
      "player_name": "LeBron James",
      "team": { "id": 1, "name": "Lakers", ... },
      "status": "Out|Questionable|Doubtful|Probable|Game Time Decision",
      "injury": "Left Ankle Sprain",
      "description": "Expected to miss 2-3 weeks",
      "date": "2026-04-10"
    }
  ]
}
```

**Advantages over ESPN:**
1. Structured data (not scraped HTML)
2. Consistent format
3. Includes injury description and expected return
4. Same API key as games/stats

**Recommended Freshness:** 1 hour (3600 seconds) for injury data

### ESPN Injury Endpoint (Alternative)

```
GET https://sports.core.api.espn.com/v2/sports/basketball/nba/teams/{team_id}/injuries
```

**⚠️ Note:** This is the `sports.core.api.espn.com` endpoint (different from site.api.espn.com)

### Recommended Injury Data Architecture

```
injury_status capability
    │
    ├── Primary: BallDontLie /v1/injuries (ALL-STAR tier)
    │   Freshness: 1 hour
    │   Data: Structured injury list with descriptions
    │
    ├── Fallback: ESPN sports.core.api.espn.com (public, no auth)
    │   Freshness: 6 hours
    │   Data: Less structured, requires parsing
    │
    └── Deny if: Both sources unavailable for > 6 hours
```

---

## 4. Adapter Chain Analysis

### Current State: NO ADAPTERS IMPLEMENTED

The M1-M4 schemas define **what data should look like** but there are **no actual API adapter modules** to fetch the data.

### Required Adapter Architecture

```
NBA Agency Runtime
    │
    ├── Schedule/Scores Adapter Chain
    │   │
    │   ├── Primary: BallDontLie /games
    │   │   └─→ GameSchema normalization
    │   │
    │   ├── Fallback 1: ESPN /scoreboard
    │   │   └─→ GameSchema normalization
    │   │
    │   ├── Fallback 2: nba_api scoreboard
    │   │   └─→ GameSchema normalization
    │   │
    │   └── DENY if: All sources fail
    │
    ├── Odds Adapter Chain
    │   │
    │   ├── Primary: The Odds API (Bet365 bookmaker)
    │   │   └─→ OddsSchema normalization + vig removal
    │   │
    │   ├── Fallback 1: ParlayAPI
    │   │   └─→ OddsSchema normalization
    │   │
    │   ├── Fallback 2: BallDontLie /odds
    │   │   └─→ OddsSchema normalization
    │   │
    │   ├── Fallback 3: Polymarket Gamma API
    │   │   └─→ OddsSchema normalization (limited markets)
    │   │
    │   └── DENY if: No odds available within freshness TTL
    │
    ├── Injury Adapter Chain
    │   │
    │   ├── Primary: BallDontLie /injuries (ALL-STAR)
    │   │   └─→ InjuryReport schema
    │   │
    │   ├── Fallback: ESPN sports.core.api.espn.com
    │   │   └─→ InjuryReport schema
    │   │
    │   └── DENY if: Both unavailable > 6 hours
    │
    ├── Stats Adapter Chain
    │   │
    │   ├── Primary: BallDontLie /stats (ALL-STAR)
    │   │   └─→ PlayerStatsSchema
    │   │
    │   ├── Fallback: nba_api stats endpoints
    │   │   └─→ PlayerStatsSchema
    │   │
    │   └── DENY if: No stats available > 24 hours
    │
    └── Standings Adapter Chain
        │
        ├── Primary: BallDontLie /standings (GOAT)
        │
        ├── Fallback: ESPN /teams + manual calculation
        │
        └── DENY if: No standings data > 24 hours
```

---

## 5. Freshness Requirements - Corrections Needed

Based on official API documentation:

| Source | Current TTL | Corrected TTL | Reason |
|--------|------------|---------------|--------|
| OddsAPI | 120s | **60s** | Odds change rapidly, 2min is too long |
| ParlayAPI | 120s | **60s** | Same as OddsAPI |
| Polymarket | 60s | **60s** | OK |
| ESPN Scoreboard Live | 60s | **30s** | Live scores update every ~30s |
| **ESPN Injuries** | 21600s (6h) | **3600s (1h)** | Should be hourly, not 6h |
| **BallDontLie Injuries** | Not set | **3600s (1h)** | Critical missing |
| BallDontLie Games/Stats | 600s (10m) | **60s** | Real-time data |
| nba_api Advanced | 86400s (24h) | **3600s (1h)** | Daily stats should update hourly |

---

## 6. Bootstrap Provider Registration

**Current `agency-nba` providers in bootstrap.ts:**
```typescript
providers: ["espn", "balldontlie", "odds_api", "polymarket", "nba_api"]
```

**Missing:**
- ❌ `odds_bet365` - Bet365 dedicated provider
- ❌ `parlay` - ParlayAPI fallback provider

**Recommended Update:**
```typescript
providers: [
  "espn", 
  "balldontlie", 
  "odds_api",      // The Odds API (generic bookmakers)
  "odds_bet365",   // Bet365 dedicated
  "parlay",        // ParlayAPI (40+ bookmakers)
  "polymarket", 
  "nba_api"
]
```

---

## 7. Key Manager - Missing Providers

**Current `key-pool.ts` NBA providers:**
```typescript
this.loadKeysFromEnv("BALLDONTLIE", { requestsPerMinute: 60, ... })
this.loadKeysFromEnv("ODDS", { requestsPerMinute: 10, ... }, ["THE_ODDS", "ODDS_API", ...])
this.loadKeysFromEnv("PARLAY", { requestsPerMinute: 10, ... }, ["PARLAY_API"])
this.loadKeysFromEnv("POLYMARKET", { requestsPerMinute: 50, ... })
```

**Missing:**
- ❌ `ODDS_BET365` - Bet365-specific odds provider

**Note:** `ODDS_BET365` is documented in discoveries but NOT in key-pool.ts loadAllFromEnv()

---

## 8. Underutilized Data Sources

### High-Value Unused Data

| Data | Provider | Value for Betting | Action Needed |
|------|----------|-------------------|--------------|
| **Player Props** | BallDontLie | Primary betting market | Add GOAT tier key |
| **Injury Reports** | BallDontLie | Critical for game prediction | Add ALL-STAR tier key + adapter |
| **Advanced Stats** | BallDontLie + nba_api | PIE, PER, net rating | Add GOAT tier key + adapter |
| **Depth Charts** | ESPN | Starting lineup impact | Add adapter |
| **Play-by-Play** | nba_api | Clutch time analysis | Add adapter |
| **Standings** | BallDontLie | Track records | Add adapter |
| **Scores History** | The Odds API /scores | Backtesting | Add adapter |

### Data Priority for MVP

1. **P0 (Critical):** Games, Scores, Injuries, Odds (h2h/spreads/totals)
2. **P1 (High):** Player Stats, Season Averages, Standings
3. **P2 (Medium):** Advanced Stats, Player Props, Depth Charts
4. **P3 (Nice):** Play-by-Play, Historical Odds, Leaders

---

## 9. Recommendations

### Immediate Actions

1. **Fix Schema Gaps:**
   - Add `odds_bet365` to `OddsSourceSchema`
   - Add `odds_bet365` to `SourceSchema`

2. **Update Key Manager:**
   ```typescript
   this.loadKeysFromEnv("ODDS_BET365", { requestsPerMinute: 10, ... })
   ```

3. **Update Bootstrap:**
   - Add `odds_bet365` and `parlay` to agency-nba providers

4. **Fix Freshness TTLs:**
   - OddsAPI: 120s → 60s
   - ESPN Injuries: 21600s → 3600s
   - BallDontLie Games: 600s → 60s
   - Add BallDontLie Injuries TTL: 3600s

### Create Adapter Layer (Priority)

1. **ball-dont-lie-adapter.ts**
   - Games, players, injuries, stats, odds
   - All freshness assessments
   - Circuit breaker integration

2. **odds-api-adapter.ts**
   - The Odds API v4 integration
   - Quota tracking via response headers
   - Bookmaker filtering (Bet365 primary)

3. **odds-bet365-adapter.ts**
   - Odds-API.io Bet365-specific
   - Same interface as odds-api-adapter

4. **parlay-api-adapter.ts**
   - ParlayAPI fallback integration
   - 40+ bookmaker support

5. **espn-adapter.ts**
   - Scoreboard, injuries, standings, depth charts
   - No auth required

6. **nba-api-adapter.ts**
   - Advanced stats, play-by-play
   - Proxy support for rate limits

7. **polymarket-adapter.ts**
   - Gamma API for market data
   - No trading (read-only)

### Injury Reports Priority

**Critical:** The `injury_status` capability is listed in the policy as SAFE but there is **no actual adapter** to fetch injury data.

**Minimum Implementation:**
```typescript
// BallDontLie Injuries Adapter
interface InjuryReport {
  player_id: string
  player_name: string
  team: string
  status: "Out" | "Questionable" | "Doubtful" | "Probable" | "GTD"
  injury: string
  description: string
  date: string
}

// Usage in Signal calculation:
// - Remove injured key players from model inputs
// - Reduce confidence for teams with multiple injuries
// - Flag "GTD" as higher uncertainty
```

---

## 10. Summary Findings

### What's Working ✅

- M1-M4 core architecture (schemas, policy, runtime, resilience, calibration, gates, chaos)
- KeyPool rotation for 8 providers
- Freshness TTL design
- Circuit breaker implementation
- Policy SAFE/NOTIFY/CONFIRM/DENY matrix
- Budgeting with token limits

### What's Missing ❌

1. **Schema:** `odds_bet365` not in enums
2. **Key Manager:** `ODDS_BET365` not registered
3. **Bootstrap:** `odds_bet365` and `parlay` not in providers list
4. **Adapters:** ZERO adapters implemented (critical gap)
5. **Injury Reports:** No adapter, using 6h TTL (should be 1h)
6. **Freshness:** Several TTLs incorrect based on actual API capabilities
7. **Underutilized:** 15+ valuable endpoints from BallDontLie alone

### Priority Fixes

| Priority | Task | Impact |
|----------|------|--------|
| 🔴 P0 | Create Game/Odds/Injury adapters | Enables actual data fetching |
| 🔴 P0 | Add `odds_bet365` to schema | Fixes missing Bet365 odds |
| 🟡 P1 | Update freshness TTLs | Data quality improvement |
| 🟡 P1 | Add BallDontLie ALL-STAR tier key | Enables injuries + stats |
| 🟢 P2 | Create advanced stats adapter | Improves model accuracy |
| 🟢 P2 | Add depth charts/standings | Additional signals |

---

## References

- BallDontLie Docs: https://docs.balldontlie.io/
- The Odds API v4: https://the-odds-api.com/liveapi/guides/v4/
- Odds-API.io (Bet365): https://docs.odds-api.io/
- ParlayAPI: https://parlay-api.com/
- ESPN Hidden API: https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b
- nba_api: https://github.com/swar/nba_api/
- Polymarket: https://docs.polymarket.com/
