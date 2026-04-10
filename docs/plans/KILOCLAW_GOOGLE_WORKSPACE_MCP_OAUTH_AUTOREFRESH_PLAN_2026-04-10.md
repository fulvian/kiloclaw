---
title: "OAuth MCP"
description: "Login unico e rinnovo token trasparente"
date: "2026-04-10"
status: "proposto"
---

# Piano tecnico operativo

## 1. Delimita obiettivo

- [ ] Garantire autenticazione utente una sola volta per Google Workspace MCP.
- [ ] Rendere le credenziali disponibili da qualunque root, inclusi repo e worktree con `bun run dev`.
- [ ] Eseguire auto-verifica servizi esterni e stato auth MCP a ogni avvio chat, senza passaggi manuali.
- [ ] Eseguire refresh token automatico e fallback robusto su 401 durante tutta la sessione.
- [ ] Introdurre osservabilita, anti-regressione e rollout progressivo con kill switch.

---

## 2. Conferma RCA

- [ ] **Causa A - Store isolato per root:** `package.json` imposta `XDG_*` su `.kiloclaw-runtime`, quindi `Global.Path.data` cambia per root e `mcp-auth.json` si frammenta.
- [ ] **Causa B - Seed incompleto:** `seedMcpAuthFromUserData()` in `packages/opencode/src/cli/cmd/tui/thread.ts` copia solo da `~/.local/share/kiloclaw/mcp-auth.json` verso runtime locale, senza store canonico bidirezionale.
- [ ] **Causa C - Boot senza auth ensure:** `startIntegratedGoogleWorkspaceMcp()` e `ensureGoogleWorkspaceMcpRunning()` avviano/health-check processo ma non fanno handshake auth automatico prima della chat.
- [ ] **Causa D - Refresh token perso:** `saveTokens()` in `packages/opencode/src/mcp/oauth-provider.ts` sovrascrive `refreshToken` con `undefined` quando il token endpoint non lo restituisce, evento normale nei refresh Google.
- [ ] **Causa E - Expiry check fragile:** `McpAuth.isTokenExpired()` in `packages/opencode/src/mcp/auth.ts` usa confronto secco senza skew, con rischio race vicino a scadenza.
- [ ] **Causa F - URL matching troppo rigido:** `getForUrl()` invalida con confronto stringa esatto, quindi differenze come trailing slash, host case, `localhost`/`127.0.0.1` o path canonicale generano falsi mismatch.
- [ ] **Causa G - Gestione 401 non resiliente in-session:** su `UnauthorizedError` viene segnato `needs_auth` in `create()`, ma manca un loop strutturato di retry+refresh+reconnect per chiamate tool durante chat.

---

## 3. Definisci architettura target

- [ ] **McpAuthStore (nuovo layer):** introduce store canonico globale in home utente e mirror nel runtime XDG locale, con read-through e write-through.
- [ ] **McpAuthUrl (normalizzazione):** canonicalizza URL MCP per confronto stabile e chiave auth coerente.
- [ ] **McpAuthCoordinator (orchestratore):** espone `ensureAtSessionStart()`, `ensureServerAuth(name)`, `handleUnauthorized(name)` e centralizza policy di autenticazione.
- [ ] **McpRefreshManager (runtime):** pianifica refresh proattivo con jitter e soglia skew, evitando finestre morte vicino a expiry.
- [ ] **Retry policy MCP:** su 401 applica una sola sequenza atomica `refresh -> reconnect -> retry` per richiesta idempotente, poi degrada a `needs_auth` con toast/runbook.
- [ ] **Compatibilita OAuth spec:** usa `resource` parameter quando supportato dal transport/provider, e usa metadata discovery + `WWW-Authenticate` come da spec MCP.

---

## 4. Pianifica modifiche file

### Nuovi file

- [ ] `packages/opencode/src/mcp/auth-store.ts`  
      Store canonico+runtime, merge policy, lock file, API `get/set/update/remove/list`.
- [ ] `packages/opencode/src/mcp/auth-url.ts`  
      Canonicalizzazione URL, confronto semantico, utilita per chiavi stabili.
- [ ] `packages/opencode/src/mcp/auth-coordinator.ts`  
      Orchestrazione startup/in-session/fallback 401, policy retry, eventi bus.
- [ ] `packages/opencode/src/mcp/refresh-manager.ts`  
      Scheduler refresh con skew configurabile, jitter e backoff.
- [ ] `packages/opencode/test/mcp/auth-store.test.ts`
- [ ] `packages/opencode/test/mcp/auth-url.test.ts`
- [ ] `packages/opencode/test/mcp/auth-coordinator.test.ts`
- [ ] `packages/opencode/test/mcp/refresh-manager.test.ts`
- [ ] `packages/opencode/test/mcp/oauth-provider-refresh-token-preservation.test.ts`

### File da modificare

- [ ] `packages/opencode/src/mcp/auth.ts`  
      Delega storage al nuovo `auth-store`, mantiene API pubblica compatibile.
- [ ] `packages/opencode/src/mcp/oauth-provider.ts`  
      Preserva refresh token precedente se assente nella response, applica canonical URL.
- [ ] `packages/opencode/src/mcp/index.ts`  
      Integra coordinator in `create/connect/tools/callTool`, retry su 401 e update status coerente.
- [ ] `packages/opencode/src/cli/cmd/tui/thread.ts`  
      Sostituisce seed one-shot con `ensureAtSessionStart()` prima del render chat.
- [ ] `packages/opencode/src/cli/cmd/mcp.ts`  
      Estende `ensureGoogleWorkspaceMcpRunning()` con ensure auth opzionale/non interattivo.
- [ ] `packages/opencode/src/config/config.ts` o file config equivalente  
      Aggiunge flag feature: `mcpAuth.autoEnsure`, `mcpAuth.autoRefresh`, `mcpAuth.globalStore`.
- [ ] `packages/opencode/src/global/index.ts`  
      Espone path canonico auth in home utente indipendente da override XDG.
- [ ] `packages/opencode/test/cli/mcp.test.ts` e test TUI correlati  
      Verifica startup automatico e stato auth coerente lato CLI/TUI.

---

## 5. Disegna flussi runtime

### Startup auto-ensure

- [ ] All'avvio thread chat: `startIntegratedGoogleWorkspaceMcp()` -> health ok -> `McpAuthCoordinator.ensureAtSessionStart()`.
- [ ] `ensureAtSessionStart()` carica auth da store canonico, sincronizza mirror locale, canonicalizza URL e verifica token per ogni MCP remoto OAuth.
- [ ] Se token valido: connette MCP e marca `connected`.
- [ ] Se token scaduto con refresh token: refresh non interattivo e reconnect.
- [ ] Se manca refresh o riceve `invalid_grant`: marca `needs_auth` e notifica con comando guidato, senza bloccare l'intera sessione.

### Auto-refresh in-session

- [ ] `McpRefreshManager` pianifica refresh a `expiresAt - skew - jitter`, con default skew 120s.
- [ ] In caso di refresh riuscito salva token in write-through canonico+locale e aggiorna scheduler.
- [ ] In caso di errore temporaneo usa backoff esponenziale con cap.
- [ ] In caso di errore permanente (`invalid_grant`, `unauthorized_client`) invalida solo token del server interessato e passa a `needs_auth`.

### Fallback on 401

- [ ] Wrapper operativo intercetta 401/`UnauthorizedError` in `listTools`, `callTool`, `readResource`, `getPrompt`.
- [ ] Esegue lock per server e singola sequenza `handleUnauthorized(name)`.
- [ ] Ritenta una sola volta la richiesta originale quando il reconnect e riuscito.
- [ ] Se fallisce di nuovo, ritorna errore esplicito e stato utente azionabile.

---

## 6. Migra storage credenziali

- [ ] Definire store canonico: `~/.local/share/kiloclaw/mcp-auth.json` come source of truth per utente.
- [ ] Mantenere store runtime attuale `Global.Path.data/mcp-auth.json` come cache compatibile per root/worktree.
- [ ] Introdurre migrazione lazy: al primo accesso, merge deterministico canonico<-runtime senza perdita di token piu recenti.
- [ ] Regola merge: preferire entry con `expiresAt` maggiore o presenza `refreshToken`, preservare `clientInfo` valido.
- [ ] Applicare canonicalizzazione URL prima del confronto, con fallback ai record legacy non canonicalizzati.
- [ ] Conservare backward compatibility API `McpAuth.*`, evitando breaking change per chiamanti esistenti.

---

## 7. Struttura test anti-regressione

### Unit

- [ ] Canonicalizzazione URL: host case, trailing slash, default port, path equivalenza, mismatch reale.
- [ ] `saveTokens` preserva `refreshToken` quando `tokens.refresh_token` manca.
- [ ] `isTokenExpired` con skew e clock drift positivo/negativo.
- [ ] Merge store canonico/runtime con tie-break stabile e idempotente.

### Integration

- [ ] Startup chat da root A autentica e salva; startup da root B riusa senza login.
- [ ] Auto-refresh prima della scadenza con token ruotato e reconnect trasparente.
- [ ] 401 in chiamata tool: refresh+retry una volta e successo.
- [ ] 401 con `invalid_grant`: transizione a `needs_auth` con messaggio operativo corretto.
- [ ] URL config cambiata solo semanticamente: auth resta valida dopo canonicalizzazione.
- [ ] URL config cambiata realmente: invalidazione controllata e reauth richiesta.

### E2E

- [ ] Flusso completo `bun run dev` in due worktree diversi con unico login iniziale.
- [ ] Sessione lunga > durata access token, nessuna interruzione per agenti.
- [ ] Revoca token lato Google durante sessione, rilevazione e recovery guidata.

---

## 8. Esegui rollout e osservabilita

### Fasi

- [ ] **Fase 0 - Shadow mode:** attiva logging/metriche senza cambiare comportamento utente.
- [ ] **Fase 1 - Global store read-through:** legge da canonico e locale, scrive ancora locale.
- [ ] **Fase 2 - Write-through completo:** scrive su canonico+locale, abilita startup auto-ensure.
- [ ] **Fase 3 - Auto-refresh robusto:** abilita scheduler e fallback 401 con retry unico.
- [ ] **Fase 4 - Hardening:** rimuove seed legacy e stabilizza documentazione runbook.

### Metriche

- [ ] `mcp_auth_startup_auto_ensure_success_rate`
- [ ] `mcp_auth_reauth_prompt_rate_per_session`
- [ ] `mcp_auth_refresh_success_rate`
- [ ] `mcp_auth_401_recovery_success_rate`
- [ ] `mcp_auth_invalid_grant_rate`
- [ ] `mcp_auth_cross_root_reuse_rate`

### Runbook errori

- [ ] **invalid_grant:** invalida tokens server-specific, conserva clientInfo, mostra comando reauth mirato.
- [ ] **refresh missing:** verifica preservation logic e stato entry canonica.
- [ ] **URL mismatch:** confronta URL canonicale salvata/configurata, segnala delta semantico.
- [ ] **401 loop:** verifica lock per server e limite retry, evita tempeste di reconnect.

---

## 9. Gestisci rischi e accettazione

### Rischi e mitigazioni

- [ ] **Race condition su refresh concorrenti:** usare mutex per `mcpName`.
- [ ] **Corruzione file auth:** scrittura atomica con temp file + rename, permessi 0600.
- [ ] **Leak credenziali nei log:** mascherare token e client secret in tutti gli eventi.
- [ ] **Regressione UX startup:** time budget massimo per ensure e fallback non bloccante.
- [ ] **Dipendenza da comportamento OAuth provider:** classificare errori permanenti/transitori con mappa esplicita.

### Criteri di accettazione

- [ ] Login Google Workspace richiesto al massimo una volta per utente, non per root/worktree.
- [ ] Avvio chat verifica automaticamente processo MCP e auth, senza comando manuale quando token validi.
- [ ] Sessione lunga mantiene operativita anche oltre expiry access token.
- [ ] Su revoca refresh token, il sistema degrada in modo chiaro a `needs_auth` senza crash.
- [ ] Test unit/integration/e2e verdi sui casi limite definiti.

---

## 10. Cita riferimenti

- [ ] Google OAuth Web Server: `access_type=offline`, comportamento refresh token, gestione `invalid_grant`, storage sicuro token  
      <https://developers.google.com/identity/protocols/oauth2/web-server>
- [ ] Google OAuth Best Practices: secure token handling, revoca/invalidation, incremental scopes  
      <https://developers.google.com/identity/protocols/oauth2/resources/best-practices>
- [ ] MCP Authorization Spec: `resource` parameter, metadata discovery, gestione 401 con `WWW-Authenticate`  
      <https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization>
- [ ] RFC 6749 Sezione 6: refresh token flow e rinnovo access token  
      <https://datatracker.ietf.org/doc/html/rfc6749#section-6>
