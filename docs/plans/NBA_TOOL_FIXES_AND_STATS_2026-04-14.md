# NBA Agency — Tool Fixes & Stats Tool Addition

**Date:** 2026-04-14
**Severity:** Critical (multiple P0 bugs + missing functionality)
**Status:** Fixed
**Impact:** All NBA tools now return correct data; new stats tool provides player/team analytics

---

## Symptom

During a live NBA betting analysis session, the agent encountered multiple failures:

1. **`nba-games` without date** → "No games found" (should default to today)
2. **`nba-injuries` (any call)** → Always "No injuries found" (critical: endpoint name bug)
3. **`nba-odds` with filters** → "No odds found" when markets/regions specified
4. **Missing stats tool** → Agent had to delegate to web search subagent for player stats, team stats, H2H, recent games — data that the BallDontLie API fully supports

## Root Causes

### Bug 1: BallDontLie injuries adapter — wrong endpoint

The adapter called `/injuries` but the correct BDL v1 endpoint is `/player_injuries`. Additionally, the response parsing interface `BdlInjury` didn't match the actual BDL response format (which uses a nested `player` object, `return_date`, etc.).

**Call chain:**

```
nba-injuries tool
  → NbaOrchestrator.getInjuries()
    → BallDontLieAdapter.getInjuries()
      → fetch("/injuries")        ← WRONG: should be /player_injuries
      → response.data.map(...)    ← WRONG: response shape doesn't match BdlInjury
      → catch block → { data: null }
    → EspnAdapter.getInjuries()    ← Only runs if teamIds provided (bug #2)
  → "No injuries found"
```

### Bug 2: ESPN injuries adapter — no fallback for missing teamIds

The ESPN adapter only fetched injuries when `options.teamIds` was provided. When called without filters, it returned an empty array immediately.

### Bug 3: nba-games defaults to all history

BallDontLie API returns ALL games (paginated) when no `dates[]` parameter is provided. The tool passed `undefined` when no date was specified, causing it to fetch random historical games instead of today's.

### Bug 4: Missing regions in adapter interface

The `NbaAdapter` interface's `getOdds()` method didn't include `regions` parameter, causing TypeScript type mismatches and preventing proper region filtering from reaching the adapters.

## Fixes Applied

### Fix 1: BallDontLie injuries adapter (`balldontlie.ts`)

- Changed endpoint from `/injuries` to `/player_injuries`
- Replaced `BdlInjury` interface with `BdlPlayerInjury` matching actual API response
- Added `getTeamMap()` with caching for team name resolution
- Added `extractInjuryType()` to parse injury descriptions
- Implemented proper `teamIds` filtering via query params

### Fix 2: ESPN injuries adapter (`espn.ts`)

- When no `teamIds` provided, now fetches injuries for all 30 NBA teams
- Individual team fetch failures don't block others
- Added `getAllNbaTeamIds()` with all ESPN team IDs

### Fix 3: nba-games tool (`nba-games.ts`)

- Defaults to today's date (`new Date().toISOString().split("T")[0]`) when no date parameter provided

### Fix 4: Adapter interface (`base.ts`)

- Added `regions?: string[]` to `NbaAdapter.getOdds()` interface
- Updated `OddsBet365Adapter` and `OddsApiAdapter` to accept and forward regions

### Fix 5: New `nba-stats` tool (`nba-stats.ts`)

Implements 4 stat types via BallDontLie API:

| Type                     | BDL Endpoint                           | Description                     |
| ------------------------ | -------------------------------------- | ------------------------------- |
| `player_stats`           | `/v1/stats`                            | Per-game player box score stats |
| `player_season_averages` | `/v1/season_averages`                  | Season averages for players     |
| `team_stats`             | `/nba/v1/team_season_averages/general` | Team season statistics          |
| `recent_games`           | `/v1/games` (with end_date)            | Last N games for a team         |

### Fix 6: NBA Analysis Skill (`nba-analysis.ts`)

- Defaults to today for game fetch
- Auto-fetches injuries for teams in today's games
- Auto-fetches recent games (last 5) for form analysis
- Auto-fetches team stats for comparison

## Files Changed

| File                                     | Change                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| `nba/adapters/balldontlie.ts`            | Fix injuries endpoint, add `getStats()`, team map cache, stat type interfaces |
| `nba/adapters/espn.ts`                   | Fix injuries to fetch all teams, add `getStats()` stub                        |
| `nba/adapters/base.ts`                   | Add `regions` to `getOdds()`, add `getStats()` to interface                   |
| `nba/adapters/odds-api.ts`               | Add `getStats()` stub                                                         |
| `nba/adapters/odds-bet365.ts`            | Accept `regions` param, add `getStats()` stub                                 |
| `nba/adapters/parlay-api.ts`             | Add `getStats()` stub                                                         |
| `nba/adapters/polymarket.ts`             | Add `getStats()` stub                                                         |
| `nba/adapters/nba-api.ts`                | Add `getStats()` stub                                                         |
| `nba/orchestrator.ts`                    | Add `getStats()` method with fallback chain                                   |
| `tool/nba-games.ts`                      | Default to today's date                                                       |
| `tool/nba-stats.ts`                      | **NEW** — Player/team stats tool                                              |
| `tool/registry.ts`                       | Register `NbaStatsTool`                                                       |
| `skills/nba/nba-analysis.ts`             | Default date, auto-fetch stats/injuries/recent games                          |
| `agency/agency-definitions.ts`           | Add `nba-stats` to agent permissions                                          |
| `agency/routing/pipeline.ts`             | Add `nba-stats` + all adapter names to NBA allowlist                          |
| `session/tool-policy.ts`                 | Add `nba-stats` to NBA tool allowlist + capability mapping                    |
| `session/tool-identity-map.ts`           | Add `nba-stats` to NBA tool map                                               |
| `session/prompt.ts`                      | Add nba-stats tool description to system prompt                               |
| `test/kiloclaw/nba-pipeline-e2e.test.ts` | Update test to include all authorized tools                                   |

## Verification

- **90 NBA tests pass** (15 test files, 0 failures, 273 assertions)
- **TypeScript typecheck clean** (0 NBA-related errors)
- **E2E pipeline**: All 12 authorized NBA tools resolve correctly
- **Tool registration**: `nba-stats` registered in all policy/routing/identity layers

## Related

- Builds on freshness fix from `NBA_FRESHNESS_BUGFIX_2026-04-14.md`
- Provider architecture verified in `NBA_AGENCY_PROVIDER_VERIFICATION_2026-04-11.md`
- BallDontLie API docs: https://docs.balldontlie.io/
