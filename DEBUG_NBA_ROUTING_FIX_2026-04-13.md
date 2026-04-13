# NBA Routing Fix - Debug Report
**Date**: April 13, 2026
**Issue**: NBA queries were incorrectly routed to websearch instead of using NBA agency tools
**Status**: ✅ FIXED

## Root Cause Analysis

### The Problem
When users submitted queries requesting NBA analysis (games, odds, injuries, betting analysis), the system:
1. ✗ Did NOT route to `agency-nba`
2. ✗ Did NOT activate the `nba-analysis` skill
3. ✗ Fell back to pure websearch, ignoring specialized NBA tools (BallDontLie, ESPN, OddsAPI, etc.)

### Why It Happened
The semantic router's fallback layer had incomplete NBA configuration in `/packages/opencode/src/kiloclaw/agency/routing/semantic/llm-extractor.ts`:

**Missing from LLM fallback prompts:**
1. `CAPABILITY_CLASSIFICATION_PROMPT` - missing all NBA capabilities
2. `DOMAIN_CLASSIFICATION_PROMPT` - missing NBA as recognized domain
3. `classifyDomainWithLLM()` function - missing NBA keywords in domain mapping
4. `extractCapabilitiesFromKeywords()` function - missing NBA keyword-to-capability mappings

### The Symptoms
- Domain detection: Failed to recognize "nba" domain from Italian/English queries
- Capability extraction: Fell back to generic knowledge/information_gathering
- Agency routing: Routed to `agency-knowledge` instead of `agency-nba`
- Tool resolution: Used websearch/webfetch instead of specialized adapters

## The Fix

### 1. Enhanced CAPABILITY_CLASSIFICATION_PROMPT
Added 5 NBA-specific capabilities to the LLM fallback prompt:
```
- nba_analysis: Analyze NBA games, teams, players, statistics
- nba_schedule: Get NBA game schedules and fixtures
- nba_injuries: Get NBA injury reports and player status
- nba_odds: Get NBA betting odds and markets
- nba_edge_detection: Analyze value betting opportunities
```

### 2. Enhanced DOMAIN_CLASSIFICATION_PROMPT
Added NBA as recognized domain:
```
- nba: NBA games, statistics, injuries, betting analysis, odds, sports betting
```

### 3. Extended classifyDomainWithLLM() NBA Keywords
Added 50+ Italian and English NBA keywords:
- Queries: "nba", "basketball", "basket", "partita", "partite", "stagione", "playoffs", "play-in"
- Tools: "odds", "scommessa", "betting", "quote", "quota"
- Data: "roster", "infortunio", "injury", "stats", "statistiche"
- Betting: "multipla", "parlay", "acca", "handicap", "spread", "moneyline"

### 4. Extended extractCapabilitiesFromKeywords() NBA Mappings
Added 30+ keyword-to-capability mappings:
- "nba" → `["nba_analysis", "nba_schedule", "nba_injuries", "nba_odds"]`
- "odds" → `["nba_odds"]`
- "scommessa" → `["nba_odds", "nba_edge_detection"]`
- "infortuni" → `["nba_injuries"]`
- "multipla" → `["nba_odds", "nba_edge_detection"]`
- etc.

## Verification

### Test Results
All NBA semantic routing tests now correctly identify queries:

| Query | Domain | Skill | Agency |
|-------|--------|-------|--------|
| "verifica le partite NBA..." (Italian) | nba | nba-analysis | agency-nba |
| "Check NBA games tonight" (English) | nba | nba-analysis | agency-nba |
| "analizza partite... con quote scommesse" | nba | nba-analysis | agency-nba |
| "NBA betting analysis" | nba | nba-analysis | agency-nba |
| "Infortuni giocatori NBA" | nba | nba-analysis | agency-nba |
| "NBA injury report" | nba | nba-analysis | agency-nba |

### Tool Resolution
After routing to `agency-nba`, users now get access to:
- ✅ `balldontlie.getGames` - Live game data
- ✅ `balldontlie.getInjuries` - Injury reports
- ✅ `espn.getScoreboard` - ESPN data
- ✅ `nba_api.getStats` - Statistical data
- ✅ `odds_api.getOdds` - Betting odds
- ✅ `odds_bet365.getOdds` - Bet365 odds
- ✅ `parlay.getOdds` - Parlay data
- ✅ `nba-analysis` - Skill-based analysis

## Files Changed

**Modified**: `/packages/opencode/src/kiloclaw/agency/routing/semantic/llm-extractor.ts`

Changes:
- Lines 12-41: Enhanced CAPABILITY_CLASSIFICATION_PROMPT (+5 capabilities)
- Lines 44-56: Enhanced DOMAIN_CLASSIFICATION_PROMPT (+1 domain)
- Lines 178-265: Extended classifyDomainWithLLM() domainKeywords.nba mapping (+50 keywords)
- Lines 110-190: Extended keywordMap with NBA mappings (+30 keyword-to-capability pairs)

## Impact

### Before Fix
```
User query: "verifica le partite NBA per stasera"
↓
Routing: agency-knowledge
↓
Tools: websearch only
↓
Result: Generic web search results (no structured data)
```

### After Fix
```
User query: "verifica le partite NBA per stasera"
↓
Routing: agency-nba
↓
Tools: balldontlie, ESPN, OddsAPI, nba-analysis skill
↓
Result: Structured NBA data + betting analysis + injury reports
```

## Backward Compatibility
✅ No breaking changes
- Domain keywords already had NBA hints (not exposed in prompts)
- Bootstrap already had NBA agency, manifests, and adapters configured
- Only the LLM fallback layer was missing NBA configuration
- All tests pass without modification

## Rollout Notes
This fix enables the fully-configured NBA betting analysis agency to work correctly with user queries in both Italian and English languages, properly utilizing all 8 provider adapters and the nba-analysis skill.
