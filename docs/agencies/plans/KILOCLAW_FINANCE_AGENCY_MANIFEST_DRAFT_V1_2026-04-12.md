# Agency Manifest Draft - Finance Agency

## Informazioni Base

- **Agency ID**: `agency-finance`
- **Domain**: `finance`
- **Version**: 1.0.0
- **Data Creazione**: 2026-04-12
- **Owner**: TBD
- **Status**: G1-G2 Complete, Ready for G3

---

## Mapping

### Intent Pattern
```
User Query: "analizza AZM for trading opportunity" / "cos'è meglio BTC o ETH" / "come si è comportato SPY questa settimana"
    ↓
Intent Classification: type="query", risk="medium", domain="finance"
    ↓
Agency Routing: agency-finance (confidence target > 60%)
    ↓
Capability Detection: L1 capabilities match
    ↓
Agent Selection: finance-analyst (primary) → trading-advisor (if trading ops)
    ↓
Skill Chain: market-data → analysis → signal/risk
    ↓
Tool Execution: finance-api native adapters
```

### Provider Mapping
| Intent | Primary Provider | Fallback | Trigger |
|--------|------------------|----------|---------|
| Crypto price | CoinGecko | Binance | timeout, error |
| Stock price | Yahoo Finance | Finnhub | timeout, error |
| Crypto historical | Binance | CoinGecko | timeout |
| Stock historical | Yahoo Finance | Finnhub | timeout |
| Fundamentals | Finnhub | SEC EDGAR | timeout |
| Macro data | FRED | - | - |
| News | Finnhub | Yahoo Finance | timeout |

---

## Policy

### Deny-by-Default
```
enabled: true
enforcement: HARD (runtime, not prompt-based)
```

### Policy Level Standard

| Level | Operazioni | Esempi |
|-------|------------|--------|
| **SAFE** | Read-only, no side effect | Price read, watchlist view |
| **NOTIFY** | Side effect reversible | Alert creation, journal entry |
| **CONFIRM** | Impact significativo | Signal generation, paper trade |
| **HITL** | Irreversibile, alto rischio | Real orders, risk limit changes |
| **DENY** | Mai consentito | Auto-trade, leverage > 3x |

### Policy Matrix

| Capability | Policy | Conditions |
|------------|--------|------------|
| `price.current` | SAFE | - |
| `price.historical` | SAFE | - |
| `orderbook` | SAFE | - |
| `fundamentals` | SAFE | - |
| `macro` | SAFE | - |
| `filings` | SAFE | - |
| `news` | SAFE | - |
| `technical.indicators` | NOTIFY | Show confidence |
| `chart.patterns` | NOTIFY | With uncertainty |
| `factor.analysis` | NOTIFY | Show methodology |
| `stress.test` | NOTIFY | Show scenarios |
| `correlation` | NOTIFY | With data quality |
| `sentiment` | NOTIFY | Show sources |
| `signal.generation` | NOTIFY + HITL | Confidence >= 60% |
| `paper.trade` | CONFIRM | HITL per > $10k |
| `order.simulation` | CONFIRM | With limits |
| `execution.assist` | CONFIRM + HITL | Mandatory approval |
| `portfolio.rebalance` | CONFIRM | HITL per > 5% |
| `alert.risk` | SAFE | - |
| `watchlist.view` | SAFE | - |
| `journal.entry` | SAFE | - |
| `report.generate` | SAFE | - |
| `real.execution` | DENY | Hard block |
| `leverage.extreme` | DENY | > 3x always denied |
| `risk.limit.bypass` | DENY | Hard block |
| `market.manipulation` | DENY | Hard block |

---

## Provider

### Primary Providers
| Provider | Asset Type | API Key Required | Rate Limit |
|----------|------------|------------------|------------|
| CoinGecko | Crypto | Optional | 10-50/min |
| Binance | Crypto | Yes | 1200/min |
| Yahoo Finance | Stocks/ETF/Crypto | No (yfinance) | - |
| Finnhub | Stocks | Yes (free tier) | 60/min |

### Fallback Providers
| Provider | Asset Type | Trigger | Fallback For |
|----------|------------|---------|-------------|
| Binance | Crypto | CoinGecko fail | Crypto prices |
| Finnhub | Stocks | Yahoo fail | Stock prices |
| SEC EDGAR | Filings | Finnhub fail | SEC filings |
| FRED | Macro | - | GDP, CPI, rates |

### Retry Policy
```
maxRetries: 3
retryDelay: 1000ms (exponential backoff: 1s, 2s, 4s)
timeout: 5000ms per request
circuitBreakerThreshold: 5 failures in 1 min
```

### Provider Health Metrics
- Uptime target: > 99.5%
- Latency p95: < 2000ms
- Error rate: < 1%
- Data freshness: < 5 min for realtime

---

## Capability Registry

### Finance Domain Capabilities
```typescript
// In bootstrapFinanceCapabilities()

const capabilities = [
  // Data Ingestion
  { id: "price_current", domain: "finance", policy: "SAFE", providers: ["coingecko", "binance"] },
  { id: "price_historical", domain: "finance", policy: "SAFE", providers: ["yahoo", "binance"] },
  { id: "orderbook", domain: "finance", policy: "SAFE", providers: ["binance", "alpaca"] },
  { id: "fundamentals", domain: "finance", policy: "SAFE", providers: ["finnhub", "sec_edgar"] },
  { id: "macro", domain: "finance", policy: "SAFE", providers: ["fred"] },
  { id: "filings", domain: "finance", policy: "SAFE", providers: ["sec_edgar"] },
  { id: "news", domain: "finance", policy: "SAFE", providers: ["finnhub", "yahoo"] },
  
  // Analytics
  { id: "technical_analysis", domain: "finance", policy: "NOTIFY" },
  { id: "pattern_recognition", domain: "finance", policy: "NOTIFY" },
  { id: "factor_analysis", domain: "finance", policy: "NOTIFY" },
  { id: "stress_test", domain: "finance", policy: "NOTIFY" },
  { id: "correlation_analysis", domain: "finance", policy: "NOTIFY" },
  { id: "sentiment_analysis", domain: "finance", policy: "NOTIFY" },
  
  // Trading
  { id: "signal_generation", domain: "finance", policy: "CONFIRM" },
  { id: "paper_trade", domain: "finance", policy: "CONFIRM" },
  { id: "order_simulation", domain: "finance", policy: "CONFIRM" },
  { id: "execution_assist", domain: "finance", policy: "CONFIRM+HITL" },
  { id: "portfolio_rebalance", domain: "finance", policy: "CONFIRM" },
  
  // Risk (DENY capabilities never exposed to model)
  { id: "real_execution", domain: "finance", policy: "DENY", hidden: true },
  { id: "extreme_leverage", domain: "finance", policy: "DENY", hidden: true },
  { id: "risk_limit_bypass", domain: "finance", policy: "DENY", hidden: true },
]
```

---

## Context Footprint

### Tool Esposti per Agency
```
finance-api (primary - all finance operations via single unified tool)
skill (for finance-specific skills: market-data, technical-analysis, risk-engine, signal-generation)
websearch (only for news aggregation, NOT for market data)
webfetch (only for SEC filings scraping if needed)
```

### Schema Dimensioni
- `finance-api` tool payload: ~500-1500 token (context budget managed)
- `skill` loading: ~200 token overhead
- Total agency context: ~2000-4000 token target

### Lazy-Loading Strategy
1. Carica `finance-api` tool con schema minimo iniziale
2. Idrata schema completo on-demand per query specifica
3. Rilascia context non necessario dopo ogni query
4. Cache localStorage per watchlist e preferenze

### Budget Context per Step
```
Step 1 (market data): 1000 token budget
Step 2 (analysis): 1500 token budget  
Step 3 (signal/risk): 500 token budget
Total per run: 3000 token target
```

---

## 5 File da Modificare

- [ ] `bootstrap.ts`: agencyDefinitions[] - add agency-finance
- [ ] `semantic/bootstrap.ts`: bootstrapFinanceCapabilities() - add capability registry
- [ ] `router.ts`: DOMAIN_KEYWORDS + CORE_KEYWORDS - add finance domain keywords
- [ ] `prompt.ts`: agency context block - add finance agency block
- [ ] `tool-policy.ts`: FINANCE_TOOL_ALLOWLIST + mapFinanceCapabilitiesToTools()

---

## Skills

### Primary Skills
| Skill | Purpose | Input | Output |
|-------|---------|-------|--------|
| `finance-market-data` | Data aggregation | symbol, assetType, dataType | data, providerUsed, quality |
| `finance-technical-analysis` | Technical indicators | symbol, timeframe, indicators | signals, patterns |
| `finance-risk-engine` | Risk assessment | portfolio, riskLimits | riskScore, violations |
| `finance-signal-generation` | Signal generation | symbols, strategies | signals, watchlist |

### Secondary Skills
| Skill | Purpose |
|-------|---------|
| `finance-portfolio-analysis` | Portfolio optimization |
| `finance-watchlist-management` | Watchlist CRUD |
| `finance-journal` | Decision journaling |

---

## Test Obbligatori

### Routing Tests
- [ ] Query "analizza AZM" → agency-finance con confidence >= 60%
- [ ] Query " BTC prezzo" → agency-finance con confidence >= 60%
- [ ] Query "crypto trading" → agency-finance con confidence >= 60%
- [ ] Query non-finance → NON agency-finance

### Tool Allowlist Tests
- [ ] allowedTools contiene solo [finance-api, skill, websearch, webfetch]
- [ ] blockedTools NON contiene strumenti non finance
- [ ] DENY capabilities non esposte nel context

### Policy Tests
- [ ] read operations pass (SAFE)
- [ ] signal generation shows NOTIFY and requires confirmation
- [ ] real execution attempt blocked by policy DENY
- [ ] leverage > 3x blocked by policy DENY

### Integration Tests
- [ ] CoinGecko adapter returns valid price data
- [ ] Fallback to Binance when CoinGecko fails
- [ ] Yahoo Finance returns valid historical data
- [ ] Risk engine correctly identifies violations

---

## State Gate

| Gate | Status | Date | Notes |
|------|--------|------|-------|
| G1 | COMPLETE | 2026-04-12 | Discovery brief approved |
| G2 | COMPLETE | 2026-04-12 | Tool decision record - Native adapters |
| G3 | PENDING | - | Ready for review |
| G4 | PENDING | - | - |
| G5 | PENDING | - | - |
| G6 | PENDING | - | - |

---

## Telemetry Requirements

### Events to Emit
```typescript
// Finance-specific telemetry events
FinanceDataEvent {
  provider: string,
  symbol: string,
  latencyMs: number,
  quality: "high" | "medium" | "low",
  fromCache: boolean
}

SignalGeneratedEvent {
  symbol: string,
  direction: "long" | "short" | "neutral",
  confidence: number,
  edge: number,
  hitlRequired: boolean
}

RiskViolationEvent {
  type: "limit_exceeded" | "circuit_breaker",
  details: object,
  action: "blocked" | "warning"
}
```

### Metrics to Track
- `finance_provider_latency_p50/p95`
- `finance_fallback_rate`
- `finance_data_quality_score`
- `finance_signals_generated`
- `finance_signals_accepted`
- `finance_hitl_approval_rate`
- `finance_risk_violations_blocked`

---

## Responsible Use Compliance

### Required Disclaimers
```
⚠️ DISCLAIMER: Questo contenuto non costituisce consulenza finanziaria.
Le performance passate non sono indicative di risultati futuri.
Investire comporta rischi di perdita. L'utente è responsabile delle proprie decisioni.
```

### Required Data Transparency
- Confidence score always visible
- Data freshness timestamp always shown
- Provider used always disclosed
- Uncertainty ranges always provided

### Circuit Breaker Requirements
- Automatic pause on: volatility spike, provider failure cascade, risk limit breach
- User notification on: circuit breaker trigger, significant drawdown
