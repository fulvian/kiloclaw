# NBA Agency — Negative Freshness Bug Fix

**Date:** 2026-04-14
**Severity:** Critical (P0)
**Status:** Fixed
**Impact:** All NBA tools returned empty results for today's games

---

## Symptom

When calling `nba-games` with today's date (`2026-04-14`), the tool returned "No games found" despite the BallDontLie API returning valid data (confirmed via `curl`). Historical dates (e.g., `2025-10-22`) worked correctly.

## Root Cause

The `freshness_seconds` field is computed as `Math.floor((now - gameDate) / 1000)` in every adapter. For **future games** (games scheduled tonight that haven't started yet), `now < gameDate`, producing a **negative** value.

The Zod schema `freshness_seconds: z.number().int().nonnegative()` in `schema.ts` rejects negative values. When `GameSchema.parse()` fails, the adapter's catch block returns `{ data: null }`, and the orchestrator reports "No games found."

### Why It Only Affected Today's Games

- Historical dates: games already completed → `gameDate < now` → positive freshness → works
- Today's date at ~08:30 UTC: most games scheduled for 23:00+ UTC → `gameDate > now` → negative freshness → Zod rejects → empty result
- After games start: `gameDate < now` again → works (but by then the user already saw "No games found")

### Call Chain

```
nba-games tool
  → NbaOrchestrator.getGames()
    → BallDontLieAdapter.getGames()
      → response.data.map(g => {
          const freshnessSeconds = Math.floor((now - gameDate) / 1000)  // NEGATIVE for future games
          GameSchema.parse({ freshness_seconds: freshnessSeconds, ... })  // THROWS
        })
      → catch block → { data: null, error: ... }
    → orchestrator sees no data → "No games found"
```

## Fix

Applied `Math.max(0, ...)` clamp at every freshness calculation site, plus a defense-in-depth clamp in `assessFreshness()`.

### Files Changed (8 files)

| File                          | Change                                                                             |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `nba/adapters/balldontlie.ts` | `getGames()` + `getInjuries()`: `Math.floor(...)` → `Math.max(0, Math.floor(...))` |
| `nba/adapters/espn.ts`        | `getGames()` + `getInjuries()`: same fix                                           |
| `nba/adapters/odds-api.ts`    | `getOdds()`: same fix                                                              |
| `nba/adapters/odds-bet365.ts` | `getOdds()`: same fix                                                              |
| `nba/adapters/parlay-api.ts`  | `getOdds()`: same fix                                                              |
| `nba/adapters/polymarket.ts`  | `getOdds()`: same fix                                                              |
| `nba/resilience.ts`           | `assessFreshness()`: defense-in-depth with `Math.max(0, Math.floor(ageSeconds))`   |

### Semantic Meaning of 0 Freshness for Future Games

For future games, `freshness_seconds = 0` means "data is as fresh as possible" — the game data was collected before the game started, which is the ideal state for pre-game analysis. The `freshness_state` will be `"fresh"` (since `0 <= maxAgeSeconds` for all sources), which is correct.

## Verification

- TypeScript compilation: passes (no new errors)
- Pattern audit: `rg "Math.floor((now -"` in `nba/` returns 0 unprotected matches
- All 8 freshness calculation sites now use `Math.max(0, ...)`

## Related

- Part of the broader NBA Agency tool integration (see `NBA_AGENCY_PROVIDER_VERIFICATION_2026-04-11.md`)
- Follows the freshness TTL architecture defined in `resilience.ts`
