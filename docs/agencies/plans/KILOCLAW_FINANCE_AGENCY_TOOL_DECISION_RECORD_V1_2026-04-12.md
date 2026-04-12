# Tool Decision Record - Finance Agency

## Caso d'Uso

### Intent
Analisi finanziaria multi-asset (stocks, ETF, crypto) con capability di:
- Market data ingestion (prezzi real-time e storici)
- Technical analysis (indicators, patterns)
- Signal generation con confidence scoring
- Risk assessment con guardrail

### Requisiti Minimi
- Copertura provider: CoinGecko, Binance, Yahoo, Finnhub, FRED
- Latenza: < 5s per query analytics
- Fallback: almeno 2 provider per tipo dato
- Safety: deny-by-default + HITL per operazioni rischioso

---

## Opzioni

### Opzione A (Native Adapters)
Implementazione di adapter nativi TypeScript per ogni provider con:
- Interface standardizzata `FinanceAdapter`
- Rate limiting integrato
- Quality scoring
- Cache locale con TTL
- Fallback chain configurabile

### Opzione B (MCP Server)
Utilizzo di MCP server esistenti:
- `@modelcontextprotocol/server-yahoo-finance`
- Binance MCP (se disponibile)
- CoinGecko MCP (se disponibile)

### Opzione C (Ibrida)
Native adapter per provider primari + MCP per gap di copertura

---

## Scorecard (1-5)

| Criterio | Peso | Native (A) | MCP (B) | Ibrida (C) |
|----------|-----:|----------:|--------:|----------:|
| **Token/Context Cost** | 0.20 | 5 | 2 | 4 |
| **Affidabilità** | 0.25 | 5 | 3 | 4 |
| **Sicurezza** | 0.30 | 5 | 4 | 5 |
| **Maintenance** | 0.10 | 4 | 3 | 4 |
| **Token Efficiency** | 0.15 | 5 | 2 | 4 |
| **SCORE TOTALE** | | **4.75** | **2.90** | **4.35** |

### Scorecard Dettagliata

#### Native Adapters (A)
- **Token/Context Cost**: 5 - Payload compatto, schema definito custom
- **Affidabilità**: 5 - Controllo diretto su retry, cache, fallback
- **Sicurezza**: 5 - Policy enforcement centralizzato, no dependency su MCP esterno
- **Maintenance**: 4 - Richiede aggiornamento manuale API specs, ma ownership chiara
- **Token Efficiency**: 5 - Schema ottimizzato per capability finance

#### MCP Server (B)
- **Token/Context Cost**: 2 - MCP overhead significativo su schema e payload
- **Affidabilità**: 3 - Dipendenza da server esterni, rate limit gestiti altrove
- **Sicurezza**: 4 - MCP gate presente ma external dependency
- **Maintenance**: 3 - Dipende da update server MCP terze parti
- **Token Efficiency**: 2 - Tool schema molto verbose

#### Ibrida (C)
- **Token/Context Cost**: 4 - Bilanciato, MCP per gap only
- **Affidabilità**: 4 - Native per critical path, MCP per overflow
- **Sicurezza**: 5 - Native con fallback MCP controllato via policy
- **Maintenance**: 4 - Majority native, gap MCP isolated
- **Token Efficiency**: 4 - Ottimizzazione selettiva

---

## Decisione

### Scelta: **Opzione A (Native Adapters)**

### Rationale
1. **Sicurezza**: Controllo diretto su policy enforcement senza dependency esterna
2. **Token efficiency**: Schema finance ottimizzato per payload minimi
3. **Affidabilità**: Cache e retry gestiti internamente con fallback configurabile
4. **Audit trail**: Metadata provider/fallback sempre presente senza overhead MCP
5. **Pattern esistente**: NBA agency ha gia implementato pattern adapter simile

### Fallback
- Se MCP server finance disponibile con schema ottimizzato, valutare come fallback per provider secondari
- Decisione rivalutata in fase G2 con benchmark reali

### Trigger Switch (da A a C ibrida)
- Se gap di copertura identificato (es. options data, rare markets)
- Se token budget constraints diventano critici
- Se provider API cambia significativamente

---

## Provider-Specific Analysis

### CoinGecko
| Aspetto | Native | MCP |
|--------|--------|-----|
| Token Cost | Basso | Alto (overhead MCP) |
| Rate Limit | 10-50/min controllato | Dipende da MCP |
| Caching | Custom TTL | Non disponibile |

### Binance
| Aspetto | Native | MCP |
|--------|--------|-----|
| Token Cost | Basso | Alto |
| Complexity | Alto (signed requests) | Gestito da MCP |
| Fallback | Custom chain | Non disponibile |

### Yahoo Finance
| Aspetto | Native | MCP |
|--------|--------|-----|
| Token Cost | Basso (yfinance) | Medio |
| Coverage | Stocks, ETF, Crypto | Dipende da MCP |
| Unofficial API | yfinance gestisce | N/A |

### Finnhub
| Aspetto | Native | MCP |
|--------|--------|-----|
| Token Cost | Basso | Alto |
| Fundamentals | Ottimo | Dipende da MCP |
| News | Buono | Dipende da MCP |

---

## Implementation Notes

### Native Adapter Interface
```typescript
interface FinanceAdapter {
  id: string
  supportedAssets: AssetType[]
  rateLimit: { rpm: number, daily: number }
  
  getPrice(symbol: string, freshness: Freshness): Promise<PriceData>
  getHistorical(symbol: string, range: DateRange): Promise<PriceData[]>
  search(query: string): Promise<SearchResult[]>
  healthCheck(): Promise<HealthStatus>
}
```

### Adapter Implementations Priority
1. **P0**: CoinGeckoAdapter (crypto primary)
2. **P0**: BinanceAdapter (crypto spot + perpetuals)
3. **P0**: YahooFinanceAdapter (stocks/ETF)
4. **P1**: FinnhubAdapter (fundamentals)
5. **P1**: FREDAdapter (macro)
6. **P2**: SecEdgarAdapter (filings)
7. **P2**: AlpacaAdapter (trading simulation)
8. **P3**: HyperliquidAdapter (perpetuals)

### Policy Alignment
- Tool policy: `FINANCE_TOOL_ALLOWLIST` include solo finance-specific tools
- No MCP tool esposti per finance senza allowlist esplicita
- Context block istruzioni CRITICAL per tool usage

---

## Stato Gate

- **G2**: GO - Native adapter confermati come approccio primario
- **Nota**: Rivalutare se benchmark MCP dimostrano superiority token efficiency

