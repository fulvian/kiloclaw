# Discovery Brief - Finance Agency

## Contesto

### Problema Operativo
Gli utenti necessitano di un sistema AI agent specializzato per analisi finanziaria e trading assistito che fornisca:
- Analisi in tempo reale di titoli azionari, ETF, criptovalute
- Generazione di segnali trading con valutazione del rischio
- Assistenza al trading con guardrail di sicurezza
- Reportistica e watchlist management

### Utenti Coinvolti
- Investitori retail che desiderano supporto decisionale
- Trader semi-professionali che cercano analisi automatizzata
- Utenti interessati a portfolio tracking e alerting

### Processo Attuale
- Utilizzo di Me4BrAIn finance_crypto (standalone, non integrato)
- Ricerca manuale di dati su provider multipli
- Assenza di guardrail strutturati per operazioni financiali

---

## Obiettivi

### Obiettivo 1: Integrazione Platform
Portare le funzionalità di Me4BrAIn finance_crypto nel sistema KiloClaw come agency specializzata con routing intent dedicato.

### Obiettivo 2: Multi-Provider Data Layer
Creare adapter per CoinGecko, Binance, Yahoo Finance, Finnhub, FRED, SEC EDGAR, Alpaca con fallback chain e quality scoring.

### Obiettivo 3: Analytics e Risk Engine
Implementare skill per analisi tecnica (RSI, MACD, MA), analisi fondamentale, e risk engine con circuit breaker.

### Obiettivo 4: Trading Assistito Sicuro
Fornire capability di paper trading, signal generation e portfolio analysis con HITL obbligatorio per operazioni ad alto rischio.

---

## Scope

### In Scope
- **Asset classes**: Stocks, ETF, Crypto, Forex, Commodities
- **Data providers**: CoinGecko, Binance, Yahoo Finance, Finnhub, FRED, SEC EDGAR, Alpaca, Hyperliquid
- **Capability**: Market data ingestion, Technical analysis, Fundamental analysis, Signal generation, Portfolio analysis, Risk assessment, Watchlist management, Journal
- **Guardrail**: Policy matrix (SAFE/NOTIFY/CONFIRM/HITL/DENY), Circuit breakers, Position sizing, Stop-loss

### Out of Scope
- **Esecuzione reale** (solo paper trading assistito)
- **Options/Derivatives** complessi (solo underlying assets)
- **Options strategies** advanced (solo basic)
- **High-frequency trading** (no HFT)
- **Social trading** (no copy trading)

---

## KPI

### KPI 1: Routing Accuracy
- **Formula**: `(finance queries correctly routed / total finance queries) × 100`
- **Baseline**: 0% (agency non esistente)
- **Target**: > 98% con confidence > 60%
- **Finestra misura**: 30 giorni post-launch

### KPI 2: Data Quality
- **Formula**: `(provider data quality score weighted by freshness)`
- **Baseline**: N/A
- **Target**: Quality score > 85% su dati freschi < 1h
- **Finestra misura**: Continuous

### KPI 3: Safety Compliance
- **Formula**: `(operations correctly blocked or flagged / total risky operations) × 100`
- **Baseline**: N/A
- **Target**: 100% dei tentativi DENY bloccati, 100% HITL richiesti
- **Finestra misura**: Continuous

### KPI 4: User Engagement
- **Formula**: `(finance queries / total queries) × 100`
- **Baseline**: 0% (no finance agency)
- **Target**: > 5% delle query dopo 90 giorni
- **Finestra misura**: 90 giorni

### KPI 5: Signal Accuracy (backtest)
- **Formula**: `(correct direction predictions / total predictions) × 100`
- **Baseline**: N/A
- **Target**: > 55% accuracy su backtest storico 1 anno
- **Finestra misura**: Backtest pre-launch

---

## Vincoli

### Tecnici
- Rate limiting: max 60 req/min per CoinGecko, 1200/min per Binance
- Latenza massima risposta: < 5s per query analytics
- Context window: < 4000 token per payload finance tool
- Cache TTL: 5min per price data, 1h per fundamentals

### Operativi
- Nessuna esecuzione reale di ordini (paper trading only per v1)
- HITL obbligatorio per qualsiasi operazione con fondi reali
- API keys gestite centralmente in `~/.local/share/kiloclaw/.env`

### Sicurezza
- deny-by-default su capability non allowlisted
- Audit trail completo per operazioni financiali
- Policy enforcement hard (non prompt-based)
- No utilizzo informazioni privilegiate

### Legali
- Disclaimer obbligatorio su ogni output finanziario
- Nessuna promessa di rendimento o garanzia di vincita
- Responsabilità utente per proprie decisioni di investimento

---

## Rischi

### Rischio: Allucinazioni Dati Finanziari
- **Severità**: CRITICAL
- **Probabilità**: Alta (LLM senza vincoli)
- **Mitigazione**: deny-by-default + tool policy allineata + contest block con istruzioni CRITICAL
- **Limite hard**: Qualsiasi dato fittizio deve essere bloccato a livello tool

### Rischio: Bypass HITL per Trading
- **Severità**: CRITICAL
- **Probabilità**: Media (utente potrebbe tentare)
- **Mitigazione**: Policy hard DENY senza eccezioni + audit trail
- **Limite hard**: Zero tolerance per esecuzione senza HITL

### Rischio: Provider Failure Cascade
- **Severità**: Alta
- **Probabilità**: Media (dipendenza da API esterne)
- **Mitigazione**: Fallback chain multi-livello + circuit breaker + cache locale
- **Limite hard**: Mostra "dato non disponibile" dopo fallback chain

### Rischio: Overconfidence in Segnali
- **Severità**: Alta
- **Probabilità**: Alta (bias conferma)
- **Mitigazione**: Mostrare sempre confidence score e uncertainty + disclaimer
- **Limite hard**: Confidence < 60% richiede HITL

### Rischio: Market Manipulation Perception
- **Severità**: Media
- **Probabilità**: Bassa
- **Mitigazione**: Nessuna capability di market manipulation + disclaimer
- **Limite hard**: DENY capability `market.manipulation`

### Rischio: Data Freshness Confusion
- **Severità**: Media
- **Probabilità**: Alta (crypto 24/7 markets)
- **Mitigazione**: Mostrare sempre timestamp e freshness del dato
- **Limite hard**: Warning visivo se dato > 1h per realtime

---

## Decisione Gate

### Stato G1: PENDING
- [x] Requisiti non ambigui definiti
- [x] KPI con formula, baseline, target, finestra di misura
- [x] Limiti rischio e confini legali firmati
- [ ] Piano implementazione approvato
- [ ] Owner assegnato

### Owner: 
### Reviewer:
### Data Target Go-Live: 2026-05-10 (8 settimane da approvazione)

---

## Appendix: Provider API Keys Requirements

| Provider | Key Type | Rate Limits | Cost |
|----------|----------|-------------|------|
| CoinGecko | API Key (optional) | 10-50/min | Free tier / $50+/mo |
| Binance | API Key + Secret | 1200/min | Free |
| Yahoo Finance | Via yfinance | - | Free |
| Finnhub | API Key | 60/min free | $50+/mo |
| FRED | API Key | - | Free |
| SEC EDGAR | - | 10/sec | Free |
| Alpaca | API Key + Secret | - | Free tier |
| Hyperliquid | API Key | - | Free |

**Nota**: Usare unico file `~/.local/share/kiloclaw/.env` per tutte le chiavi.
