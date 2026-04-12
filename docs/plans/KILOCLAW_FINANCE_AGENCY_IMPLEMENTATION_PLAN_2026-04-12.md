# KILOCLAW_FINANCE_AGENCY_IMPLEMENTATION_PLAN_2026-04-12

Piano di implementazione per l'Agenzia di Analisi Finanziaria e Trading (Agency 3).
Migrazione e integrazione delle funzionalità finance di Me4BrAIn con miglioramenti basati su best practice AI/agent.

---

## Contesto e Obiettivi

### Stato Attuale
- **Implementate**: Google Workspace Agency, NBA Betting Agency, Development Agency, Knowledge Agency
- **Da implementare**: Finance Agency (analisi finanziaria e trading)
- **Repository sorgente**: funzionalità `Me4BrAIn/finance_crypto` (non più accessibile pubblicamente)

### Scope Funzionale v1
- Porting di `Me4BrAIn finance_crypto` con handler + `finance_api`
- Integrazione provider: CoinGecko, Binance, Yahoo Finance, Finnhub, FRED, SEC, Alpaca, Hyperliquid
- Copertura multi-asset: titoli azionari, ETF, criptovalute, forex, commodities
- Funzioni trading con controlli di rischio obbligatori

### Research Online - Best Practice Identificate

#### Framework Multi-Agent di Riferimento
1. **FinRobot** (AI4Finance-Foundation) - Piattaforma AI agent per analisi finanziaria con LLMs
2. **TradingAgents** (TauricResearch) - Framework multi-agent per trading finanziario
3. **ATLAS** - Sistema AI trading auto-miglarante con 25 agent
4. **Claude Trading Skills** - Skill specializzate per analisi equity/ETF/crypto

#### Provider di Dati Consigliati
| Provider | Tipo Dati | Costo | Qualità |
|----------|------------|-------|---------|
| CoinGecko | Crypto | Freemium | Alta |
| Binance | Crypto Exchange | Free tier | Molto Alta |
| Yahoo Finance | Stocks/ETF/Crypto | Free | Alta |
| Alpha Vantage | Stocks/Forex/Crypto | Free tier | Alta |
| Finnhub | Stocks/Fundamentals | Freemium | Alta |
| FRED | Macro | Free | Ufficiale |
| SEC EDGAR | Filings | Free | Ufficiale |
| Alpaca | Trading/Trading API | Freemium | Alta |
| Hyperliquid | Crypto Perpetuals | Free | Alta |

#### Pattern di Sicurezza e Rischio
- **Circuit breakers** a multipli livelli: strategia-specifico, daily loss, max drawdown
- **Position sizing**: basato su stop-loss distance e risk-per-trade (tipicamente 1-2%)
- **Stop-loss automatizzati**: trailing stops, partial take-profit
- **Correlation guard**: limita esposizione same-direction
- **Consecutive loss circuit breaker**: pausa dopo losing streaks

---

## Architettura Agency

### Gerarchia Intent → Agency → Agent → Skill → Tool

```
Intent (utente vuole analisi finanziaria)
    │
    ▼
Agency: agency-finance
    │
    ├── Agent: finance-analyst (primary)
    │   ├── Skill: market-data-ingestion
    │   ├── Skill: technical-analysis  
    │   ├── Skill: fundamental-analysis
    │   └── Skill: risk-assessment
    │
    ├── Agent: trading-advisor (secondary)
    │   ├── Skill: signal-generation
    │   ├── Skill: portfolio-analysis
    │   └── Skill: watchlist-management
    │
    └── Tool: finance-api (native adapters)
        ├── CoinGecko adapter
        ├── Binance adapter
        ├── Yahoo Finance adapter
        ├── Finnhub adapter
        └── Alpaca adapter
```

### 5 File da Modificare

#### 1. `packages/opencode/src/kiloclaw/agency/bootstrap.ts`
Aggiungere `agency-finance` in `agencyDefinitions[]`.

#### 2. `packages/opencode/src/kiloclaw/agency/routing/semantic/bootstrap.ts`
Aggiungere `bootstrapFinanceCapabilities()` e chiamarla in `bootstrapAllCapabilities()`.

#### 3. `packages/opencode/src/kiloclaw/router.ts`
Aggiungere keywords finance in `DOMAIN_KEYWORDS` e `CORE_KEYWORDS`.

#### 4. `packages/opencode/src/session/prompt.ts` (~linea 900)
Aggiungere agency context block per finance.

#### 5. `packages/opencode/src/session/tool-policy.ts`
Aggiungere `FINANCE_TOOL_ALLOWLIST` e `mapFinanceCapabilitiesToTools()`.

---

## Capability Inventory

### Data Ingestion Capabilities
| Capability | Descrizione | Provider | Policy |
|------------|-------------|----------|--------|
| `price.current` | Prezzo attuale asset | CoinGecko, Binance, Yahoo | SAFE |
| `price.historical` | Serie storiche prezzi | Yahoo, Finnhub | SAFE |
| `orderbook` | Ordini libro mercato | Binance, Alpaca | SAFE |
| `fundamentals` | Dati fondamentali societari | Finnhub, SEC EDGAR | SAFE |
| `macro` | Indicatori macroeconomici | FRED | SAFE |
| `filings` | SEC filings (10-K, 10-Q) | SEC EDGAR | SAFE |
| `news` | Notizie finanziarie | Yahoo, Finnhub | SAFE |

### Analytics Capabilities
| Capability | Descrizione | Policy |
|------------|-------------|--------|
| `technical.indicators` | RSI, MACD, MA, Bollinger | NOTIFY |
| `chart.patterns` | Pattern candlestick, Elliott Wave | NOTIFY |
| `factor.analysis` | Value, Momentum, Quality factors | NOTIFY |
| `stress.test` | Scenario stress test | NOTIFY |
| `correlation` | Correlazioni cross-asset | NOTIFY |
| `sentiment` | Analisi sentiment da news | NOTIFY |

### Trading Operations Capabilities
| Capability | Descrizione | Policy |
|------------|-------------|--------|
| `paper.trade` | Paper trading simulato | CONFIRM |
| `order.simulation` | Simulazione ordini | CONFIRM |
| `execution.assist` | Assistenza esecuzione con guardrail | CONFIRM |
| `portfolio.rebalance` | Ribilanciamento portfolio | CONFIRM |
| `alert.risk` | Alert su soglie rischio | SAFE |

### Reporting Capabilities
| Capability | Descrizione | Policy |
|------------|-------------|--------|
| `watchlist.view` | Visualizza watchlist | SAFE |
| `journal.entry` | Journal decisionale | SAFE |
| `report.generate` | Genera report analisi | SAFE |

### DENY Capabilities (Hard Block)
| Capability | Ragione |
|------------|---------|
| `real.execution` | Nessuna esecuzione reale senza HITL |
| `leverage.extreme` | Leva > 3x sempre negata |
| `risk.limit.bypass` | Non bypassare limiti rischio utente |
| `market.manipulation` | Mai manipolazione mercato |
| `insider.info` | Mai utilizzo informazioni privilegiate |

---

## Skills da Implementare

### Skill: `finance-market-data`
**Purpose**: Aggregazione dati da molteplici provider con quality scoring e fallback

**Input Schema**:
```typescript
{
  symbol: string,           // ticker crypto/stock
  assetType: "stock" | "etf" | "crypto" | "forex" | "commodity",
  dataType: "price" | "orderbook" | "fundamentals" | "news" | "filings",
  providers: string[],      // provider preferiti (opzionale)
  freshness: "realtime" | "1h" | "1d"
}
```

**Output Schema**:
```typescript
{
  data: any,
  providerUsed: string,
  quality: "high" | "medium" | "low",
  latency: number,
  fallbackChain: string[],
  errors: Record<string, string>
}
```

### Skill: `finance-technical-analysis`
**Purpose**: Calcolo indicatori tecnici e pattern recognition

**Input Schema**:
```typescript
{
  symbol: string,
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w",
  indicators: ("rsi" | "macd" | "sma" | "ema" | "bb" | "atr" | "adx")[],
  chartImage?: string  // base64 per analisi visiva
}
```

**Output Schema**:
```typescript
{
  signals: {
    indicator: string,
    value: number,
    signal: "bullish" | "bearish" | "neutral",
    strength: number  // 0-100
  }[],
  patterns: {
    type: string,
    confidence: number,
    description: string
  }[],
  summary: string
}
```

### Skill: `finance-risk-engine`
**Purpose**: Valutazione rischio per asset/portfolio con guardrail

**Input Schema**:
```typescript
{
  portfolio: {
    symbol: string,
    quantity: number,
    avgPrice: number,
    currentPrice: number
  }[],
  riskLimits: {
    maxPositionPct: number,
    maxLossDailyPct: number,
    maxDrawdownPct: number,
    maxLeverage: number
  }
}
```

**Output Schema**:
```typescript
{
  riskScore: number,        // 0-100
  var: number,             // Value at Risk
  sharpeRatio: number,
  maxDrawdown: number,
  violations: {
    limit: string,
    current: number,
    allowed: number,
    severity: "warning" | "critical"
  }[],
  recommendations: string[],
  circuitBreakerTriggered: boolean
}
```

### Skill: `finance-signal-generation`
**Purpose**: Generazione segnali trading con confidence scoring

**Input Schema**:
```typescript
{
  symbols: string[],
  strategies: ("momentum" | "mean_reversion" | "breakout" | "value")[],
  timeframes: string[],
  minConfidence: number  // 0-100
}
```

**Output Schema**:
```typescript
{
  signals: {
    symbol: string,
    direction: "long" | "short" | "neutral",
    entryPrice: number,
    stopLoss: number,
    takeProfit: number,
    confidence: number,
    edge: number,           // expected edge vs market
    riskReward: number,
    rationale: string,
    risks: string[]
  }[],
  watchlist: string[]
}
```

### Skill: `finance-portfolio-analysis`
**Purpose**: Analisi e ottimizzazione portfolio

**Input Schema**:
```typescript
{
  holdings: {
    symbol: string,
    quantity: number,
    avgPrice: number
  }[],
  targetAllocation?: Record<string, number>,
  constraints: {
    maxPerPosition: number,
    minCashPct: number,
    excludedSectors: string[]
  }
}
```

**Output Schema**:
```typescript
{
  allocation: Record<string, number>,
  performance: {
    totalReturn: number,
    dayReturn: number,
    weekReturn: number
  },
  rebalancingActions: {
    action: "buy" | "sell" | "hold",
    symbol: string,
    quantity: number,
    reason: string
  }[],
  correlationRisk: number
}
```

---

## Policy Matrix

| Operazione | Policy Level | Condizioni |
|------------|--------------|------------|
| Lettura prezzi e dati pubblici | SAFE | - |
| Analisi tecnica e fondamentale | NOTIFY | Notifica utente risultati |
| Generazione segnali e scenari | NOTIFY | Confidence >= 60% |
| Stima probabilistica e ranking asset | NOTIFY | Con incertezza esplicita |
| Paper trading e order simulation | CONFIRM | HITL per parametri > $10k |
| Generazione ordine reale | CONFIRM + HITL | Obbligatorio approvazione umana |
| Modifica leverage | CONFIRM + HITL | Leva <= 3x |
| Ribilanciamento automatico | CONFIRM | HITL per modifiche > 5% |
| Esecuzione reale senza HITL | DENY | Hard block |
| Leva extrema (>3x) | DENY | Hard block |
| Bypass risk limits | DENY | Hard block |

---

## HITL Triggers (Human-In-The-Loop)

Obbligatorio HITL per:
1. **Ordini reali** - Qualsiasi esecuzione con fondi reali
2. **Parametri rischio** - Modifica limiti di perdita o esposizione
3. **Leverage** - Qualsiasi attivazione o modifica leva
4. **Soglia violazioni** - Superamento soglie rischio configurate
5. **Asset esotici** - Derivati, options, leveraged ETFs

### Protocollo HITL
1. Genera piano azione con impatto stimato
2. Mostra diff/anteprima e rischi
3. Richiedi approvazione esplicita con ID approvatore
4. Esegui con logging completo e correlation ID
5. Genera post-action report

---

## Provider Adapter Design

### Adapter Base Interface
```typescript
interface FinanceAdapter {
  readonly id: string
  readonly supportedAssets: AssetType[]
  readonly rateLimit: { requestsPerMinute: number, dailyLimit: number }
  
  async getPrice(symbol: string, freshness: Freshness): Promise<PriceData>
  async getHistorical(symbol: string, timeframe: Timeframe, range: DateRange): Promise<PriceData[]>
  async search(query: string): Promise<SearchResult[]>
  async getMetadata(symbol: string): Promise<AssetMetadata>
  healthCheck(): Promise<HealthStatus>
}
```

### Adapter Implementations
1. **CoinGeckoAdapter** - Crypto, 10-50 req/min
2. **BinanceAdapter** - Crypto spot + perpetuals, 1200 req/min
3. **YahooFinanceAdapter** - Stocks, ETF, crypto, forex
4. **FinnhubAdapter** - Stocks fundamentals, news
5. **FredAdapter** - Macro indicators (GDP, CPI, rates)
6. **SecEdgarAdapter** - SEC filings, 10 req/sec
7. **AlpacaAdapter** - Trading, $9k/month free tier
8. **HyperliquidAdapter** - Crypto perpetuals

### Provider Fallback Chain
```
CoinGecko (primary for crypto)
    ↓ (fail/timeout)
Binance (crypto fallback)
    ↓ (fail/timeout)  
Yahoo Finance (crypto + stocks)

Finnhub (primary for stocks)
    ↓ (fail/timeout)
Yahoo Finance (stocks fallback)

SEC EDGAR (filings only)
    ↓ (fail/timeout)
Finnhub (filings fallback)
```

---

## Responsible Use Requirements

Obbligatorio per ogni output finanziario:

1. **Disclaimer visibile**:
   ```
   ⚠️ DISCLAIMER: Questo contenuto non costituisce consulenza finanziaria o promessa di rendimento.
   Le performance passate non sono indicative di risultati futuri. Investire comporta rischi di perdita.
   ```

2. **Dati da mostrare sempre**:
   - Drawdown potenziale
   - Livello di confidenza (esplicito)
   - Latenza dati (freschezza)
   - Rischio controparte
   - Incertezza della stima

3. **Circuit Breaker Automatici**:
   - Volatilità estrema (>3x deviation)
   - Feed incoerenti (provider conflicts > 2σ)
   - Rate limit raggiunto su tutti i provider
   - Soglie rischio superate

---

## Roadmap Implementazione 8 Settimane

### Settimana 1: Setup e Foundations
- [ ] Aggiungere `agency-finance` in bootstrap.ts
- [ ] Creare Domain enum in types.ts
- [ ] Aggiungere keywords finance in router.ts
- [ ] Setup provider catalog entries
- [ ] Create base adapter interface

**Gate G1**: Agency registrata correttamente, routing funziona

### Settimana 2: Data Layer
- [ ] Implement CoinGeckoAdapter
- [ ] Implement BinanceAdapter  
- [ ] Implement YahooFinanceAdapter
- [ ] Implement FinnhubAdapter
- [ ] Implement FRED adapter
- [ ] Create finance-api tool con fallback chain

**Gate G2**: Provider health checks verdi, fallback funziona

### Settimana 3: Skills Core
- [ ] Implement finance-market-data skill
- [ ] Implement finance-technical-analysis skill
- [ ] Add technical indicators (RSI, MACD, MA, EMA, Bollinger)
- [ ] Create chart pattern recognition
- [ ] Add capability allowlist in tool-policy.ts

**Gate G3**: Skills respond correctly, tool-policy aligned

### Settimana 4: Risk Engine
- [ ] Implement finance-risk-engine skill
- [ ] Add position sizing logic
- [ ] Add stop-loss calculation
- [ ] Implement circuit breaker logic
- [ ] Add portfolio VaR calculation

**Gate G4**: Risk engine blocks dangerous operations

### Settimana 5: Trading Skills
- [ ] Implement finance-signal-generation skill
- [ ] Implement finance-portfolio-analysis skill
- [ ] Add paper trading simulation
- [ ] Implement watchlist management
- [ ] Add journal functionality

**Gate G5**: Signal generation works with proper risk controls

### Settimana 6: Agency Integration
- [ ] Add finance context block in prompt.ts
- [ ] Add HITL triggers for trading ops
- [ ] Add policy enforcement for denied capabilities
- [ ] Create audit trail for financial operations
- [ ] Add telemetry for finance operations

**Gate G6**: Runtime verification con query reale (9/9 criteri)

### Settimana 7: Testing e Calibration
- [ ] Contract tests per ogni provider adapter
- [ ] Backtest deterministico su dataset congelati
- [ ] Safety tests per limiti rischio
- [ ] Chaos tests per disallineamento fonti
- [ ] Calibration monitoring per modello probabilistico

**Gate G7**: All test suite verde, backtest passato

### Settimana 8: Hardening e Rollout
- [ ] Security audit su financial operations
- [ ] Documentation completa
- [ ] Runbook operativo
- [ ] Canary 10% con monitoring
- [ ] Full rollout

**Gate G8**: Go-live autorizzato

---

## Testing Requirements

### Unit Tests
- Mapping capability → tool
- Policy gates (SAFE/NOTIFY/CONFIRM/HITL/DENY)
- Adapter interface compliance
- Risk calculation accuracy

### Integration Tests
- Provider adapters end-to-end
- Fallback chain con failure simulation
- Skill chaining (market-data → analysis → signal)

### Contract Tests
- Provider API contracts
- Telemetry event shapes
- Skill input/output schemas

### Golden Tests
- Signal generation output format
- Risk report format
- Alert message format

### Chaos Tests
- Provider timeout/failure
- Partial data corruption
- Rate limit saturation

---

## Metriche di Successo

### Performance Metrics
- `provider_latency_p50/p95`: < 500ms / < 2s
- `provider_uptime`: > 99.5%
- `fallback_success_rate`: > 95%
- `data_quality_score`: > 85%

### Routing Metrics
- `finance_intent_miss_rate`: < 2%
- `routing_confidence_avg`: > 60%
- `wrong_agency_route_rate`: < 0.5%

### Safety Metrics
- `denied_operations_blocked`: 100%
- `hitl_approval_rate`: tracked
- `risk_limit_violations`: 0
- `circuit_breaker_triggered`: tracked

### Business Metrics
- `signals_generated`: count
- `signal_accuracy`: tracked vs actual
- `user_satisfaction`: survey score > 4/5

---

## Dipendenze

- **Da Me4BrAIn**: `finance_crypto` handler e `finance_api` (porting del design)
- **Da agency-nba**: Pattern di implementazione per skills e tool
- **Da agency-gworkspace**: Pattern per provider adapter con health/check/rate-limit

---

## Riferimenti

- [FinRobot](https://github.com/AI4Finance-Foundation/FinRobot) - AI4Finance Foundation
- [TradingAgents](https://github.com/TauricResearch/TradingAgents) - Multi-agent trading framework
- [Claude Trading Skills](https://github.com/tradermonty/claude-trading-skills) - Skill-based trading
- [Awesome AI in Finance](https://github.com/georgezouq/awesome-ai-in-finance) - Resource collection
- [Alpha Vantage API](https://www.alphavantage.co/) - Free stock APIs
- [CoinGecko API](https://www.coingecko.com/en/api) - Crypto data
- [Alpaca Trading API](https://alpaca.markets/) - Trading + market data

---

## Change Log

| Data | Versione | Note |
|------|---------|------|
| 2026-04-12 | 1.0.0 | Prima stesura piano |
