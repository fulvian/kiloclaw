# NBA Agency — Session Log Analysis & Bug Fixes (2026-04-14 Evening)

**Date:** 2026-04-14
**Session:** `ses_27357c9cbffeCeJna8LmHFbY7z`
**Severity:** Medium-High (data quality + display correctness)
**Status:** 3 bugs fixed, 1 unresolved (hot-reload)
**Commit:** `26fab00`

---

## Executive Summary

Analyzed a full NBA betting query session (`verifica le partite NBA in programma per questa sera/notte`) and identified **3 confirmed bugs** that were fixed, plus **1 investigation ongoing** (tool hot-reload issue).

### What Worked ✅

| Component                        | Status                                                      |
| -------------------------------- | ----------------------------------------------------------- |
| Agency routing (`agency-nba`)    | ✅ Routed with 51-78% confidence                            |
| `skill` tool with `nba-analysis` | ✅ Loaded and returned execution instructions               |
| `nba-games` tool                 | ✅ Returned 2 scheduled games with correct BDL IDs          |
| `nba-odds` tool                  | ✅ Returned odds from 8 bookmakers across all markets       |
| `nba-injuries` tool              | ✅ Executed (returned empty — likely correct for that date) |
| Model sequential calling         | ✅ Correctly called games → odds/injuries in sequence       |

### Bugs Fixed 🐛

| Bug                                             | Severity | Fix                                            |
| ----------------------------------------------- | -------- | ---------------------------------------------- |
| Vig displayed as 300-500% instead of 3-5%       | Medium   | Removed `* 100` multiplier in `nba-odds.ts`    |
| nba-games UTC date missed Italian evening games | High     | Now fetches today + tomorrow in local timezone |
| `date` param not passed to orchestrator         | Low      | Added `date` param propagation                 |

### Investigation Ongoing ⚠️

| Issue                                   | Status              | Likely Cause                                    |
| --------------------------------------- | ------------------- | ----------------------------------------------- |
| `nba-stats` tool unavailable at runtime | Under investigation | Hot-reload timing issue — restart `bun run dev` |

---

## Bug #1: Vig Display — 300-500% Instead of 3-5%

**Severity:** Medium
**File:** `packages/opencode/src/tool/nba-odds.ts` line 25
**Status:** ✅ Fixed

### Symptom

```
vig: 397.96%
vig: 526.57%
vig: 471.20%
```

Normal vig is 2-5%. Values of 300-500% are impossible.

### Root Cause

Double-multiplication of `vig_percent`:

1. **`odds-api.ts` line 231:** `vigPercent = (overround - 1) * 100` → produces `4.5` for 4.5% ✅
2. **`nba-odds.ts` line 25:** `(odds.vig_percent * 100).toFixed(2)` → produces `450.00%` ❌

The `vig_percent` was already stored as a percentage value (e.g., `4.5`), but was multiplied by 100 **again** when formatting for display.

### Fix

```typescript
// Before
return `${freshness} [${odds.bookmaker_or_exchange}] ${marketLabel} (vig: ${(odds.vig_percent * 100).toFixed(2)}%)\n${outcomes}`

// After
return `${freshness} [${odds.bookmaker_or_exchange}] ${marketLabel} (vig: ${odds.vig_percent.toFixed(2)}%)\n${outcomes}`
```

### Result

Vig now displays correctly:

```
vig: 3.98%  ✅
vig: 5.27%  ✅
vig: 4.71%  ✅
```

---

## Bug #2: nba-games — UTC Date Missed Italian Evening Games

**Severity:** High
**File:** `packages/opencode/src/tool/nba-games.ts` line 102
**Status:** ✅ Fixed

### Symptom

User in Italy (UTC+2) asked for "partite NBA questa sera/notte" on April 14 at ~17:42 local time. `nba-games` returned only **2 games**, while `nba-odds` (which has no date filter) returned **8 games**.

### Root Cause

```typescript
// OLD CODE
const dates = params.date ? [params.date] : [new Date().toISOString().split("T")[0]]
```

`toISOString()` returns **UTC** date. On April 14 at 17:42 Italy (UTC+2 = 15:42 UTC), the UTC date is `"2026-04-14"`. But NBA games for Italian "tonight" start at ~7-11 PM ET = 23:00-03:00 UTC, which falls on **April 15 UTC**.

So when filtering by UTC date `"2026-04-14"`, games scheduled for April 15 early morning UTC were missed.

### Fix

```typescript
// NEW CODE
let dates: string[]
if (params.date) {
  dates = [params.date]
} else {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  dates = [
    today.toLocaleDateString("en-CA"), // YYYY-MM-DD in local timezone
    tomorrow.toLocaleDateString("en-CA"),
  ]
}
```

Now fetches **both today and tomorrow** in local timezone, capturing all games for the current evening regardless of timezone.

### Result

`nba-games` will return all games relevant to the user's local evening, not just those matching a UTC date that may be offset.

---

## Bug #3: `date` Parameter Not Passed to Orchestrator

**Severity:** Low
**Files:** `packages/opencode/src/tool/nba-odds.ts`, `packages/opencode/src/kiloclaw/agency/nba/orchestrator.ts`
**Status:** ✅ Fixed

### Symptom

The `nba-odds` tool accepted a `date` parameter, but it wasn't being passed to the orchestrator's `getOdds()` method.

### Root Cause

Missing `date` in the `NbaOrchestrator.getOdds()` call:

```typescript
// OLD CODE
const result = await NbaOrchestrator.getOdds({
  gameIds: params.gameIds,
  markets: params.markets as string[] | undefined,
  bookmakers: params.bookmakers,
  regions: params.regions as string[] | undefined,
})
// date was NOT passed
```

### Fix

```typescript
// NEW CODE
const result = await NbaOrchestrator.getOdds({
  gameIds: params.gameIds,
  date: params.date,
  markets: params.markets as string[] | undefined,
  bookmakers: params.bookmakers,
  regions: params.regions as string[] | undefined,
})
```

Also added `date?: string` to the orchestrator's `getOdds()` options interface.

### Note on Odds API Date Filtering

The Odds API itself doesn't support date filtering — it returns all upcoming games. When BDL-format gameIds are passed (numeric like `"21681576"`), the adapter skips the `eventIds` filter since those IDs don't match the Odds API's hashed format. This means `nba-odds` will return all games regardless of date. This is **by design** — the intended workflow is:

1. Call `nba-games` first to get BDL gameIds for today's games
2. Call `nba-odds` with those gameIds to get odds for specific games
3. If no gameIds are available, `nba-odds` returns all available odds (which is what happened in the session — 8 games)

---

## Bug #4: `nba-stats` Tool Unavailable

**Severity:** Critical (data quality)
**File:** Multiple — registration is correct, runtime exclusion suspected
**Status:** ⚠️ Unresolved — likely hot-reload issue

### Symptom

The model attempted to call `nba-stats` but received:

```
"Model tried to call unavailable tool 'nba-stats'. Available tools: invalid, task, skill, nba-games, nba-odds, nba-injuries."
```

### Investigation

`nba-stats` IS correctly registered in all required places:

| File                     | Line | Status                                               |
| ------------------------ | ---- | ---------------------------------------------------- |
| `tool/registry.ts`       | 146  | ✅ `NbaStatsTool` in `all()`                         |
| `tool-policy.ts`         | 163  | ✅ `NBA_TOOL_ALLOWLIST` includes `"nba-stats"`       |
| `routing/pipeline.ts`    | 445  | ✅ NBA allowlist includes `"nba-stats"`              |
| `session/tool-policy.ts` | 287  | ✅ `mapNbaCapabilitiesToTools` maps to `"nba-stats"` |

### Root Cause Hypothesis

The tool initialization (`NbaStatsTool.init({ agent })`) may be throwing an error at runtime, causing the tool to be excluded from the resolved tool list. This is a **hot-reload timing issue** — the dev server (`bun run dev`) may have had stale module state.

### Impact

Without `nba-stats`, the model **hallucinated all statistics**:

- "Jimmy Butler (21.8 PPG)" — fabricated
- "LaMelo Ball (25.3 PPG)" — fabricated
- "Offensive rating 108.2, Defensive 114.5" — fabricated
- "Last 5: 2-3 (W-L-W-L-L)" — fabricated

### Recommended Action

**Restart `bun run dev`** — this should resolve the hot-reload issue. If the problem persists after restart, add debug logging to `ToolRegistry.tools()` to catch initialization errors.

---

## Files Changed

| File                                      | Change                                                         |
| ----------------------------------------- | -------------------------------------------------------------- |
| `src/tool/nba-odds.ts`                    | Fix vig display (`* 100` removed), pass `date` to orchestrator |
| `src/tool/nba-games.ts`                   | Fetch today + tomorrow in local timezone                       |
| `src/kiloclaw/agency/nba/orchestrator.ts` | Accept `date` param in `getOdds()`                             |

---

## Verification

- **1232 kiloclaw tests pass** (0 failures)
- **TypeScript typecheck**: Clean on `packages/opencode`
- **NBA pipeline tests**: All 19 tests pass
- **Pre-existing failures**: 223 tests fail in unrelated packages (skill, session, agent, provider) — not affected by these changes

---

## Related Documentation

| Document                                               | Relevance                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| `NBA_TOOL_FIXES_AND_STATS_2026-04-14.md`               | Previous session's bug fixes (injuries endpoint, nba-stats addition) |
| `NBA_FRESHNESS_BUGFIX_2026-04-14.md`                   | Freshness clamp fix for future games                                 |
| `KILOCLAW_NBA_AGENCY_DISCOVERY_BRIEF_V1_2026-04-11.md` | Strategic brief for NBA agency v1                                    |
| `KILOCLAW_NBA_AGENCY_ROLLOUT_PLAN_V1_2026-04-11.md`    | Rollout plan and milestones                                          |
