# Google Workspace Agency Implementation - Task Plan

**Created**: 2026-04-09
**Status**: Phase F1-F2 (Discovery + Research)
**Target**: 8-week delivery

---

## Executive Summary

Implementation of the first Google Workspace Agency with `hybrid` approach (native-first with MCP fallback). The agency covers Gmail, Calendar, Drive, Docs, and Sheets with SAFE/NOTIFY/CONFIRM/DENY policy matrix.

---

## Research Findings (April 2026)

### Google Workspace MCP Landscape

| Server                               | Language       | Features                                                         | Auth                 |
| ------------------------------------ | -------------- | ---------------------------------------------------------------- | -------------------- |
| `taylorwilsdon/google_workspace_mcp` | TypeScript     | Gmail, Calendar, Drive, Docs, Sheets, Slides, Chat, Forms, Tasks | OAuth 2.0 multi-user |
| `aaronsb/google-workspace-mcp`       | Rust (gws CLI) | Full Workspace API coverage                                      | OAuth 2.0            |
| `j3k0/mcp-google-workspace`          | Node.js        | Gmail + Calendar focused                                         | OAuth 2.0            |
| `dguido/google-workspace-mcp`        | TypeScript     | Drive, Docs, Sheets, Slides, Calendar, Gmail                     | OAuth 2.0            |

### Key Patterns Identified

1. **OAuth 2.1**: Many implementations are aligning with OAuth 2.1 guidance (PKCE mandatory)
2. **Credential Storage**: Abstract credential store API with multiple backends (file, vault)
3. **Tool Tiers**: Similar to our T0-T3 classification (read → write → high-impact)
4. **Stateless Mode**: Support for serverless/cloud deployment

### Google API Best Practices

- **Rate Limiting**: Exponential backoff with jitter (500ms base, 32s max, 5 retries)
- **Sync Tokens**: Handle `410 Gone` for calendar/drive sync with full resync
- **Push Notifications**: Channel expiration management for Drive changes
- **Quota Management**: Token bucket per service per user

---

## Phase Gate Status

| Gate | Name                 | Status         | Evidence                                                                |
| ---- | -------------------- | -------------- | ----------------------------------------------------------------------- |
| G1   | Discovery Brief      | ✅ Complete    | `KILOCLAW_GOOGLE_WORKSPACE_AGENCY_IMPLEMENTATION_PLAN_V1_2026-04-09.md` |
| G2   | Tool Decision Record | 🔄 In Progress | This document                                                           |
| G3   | Agency Manifest      | ⏳ Pending     | -                                                                       |
| G4   | Build Complete       | ⏳ Pending     | -                                                                       |
| G5   | Verification         | ⏳ Pending     | -                                                                       |
| G6   | Rollout Ready        | ⏳ Pending     | -                                                                       |

---

## Implementation Phases

### Phase F1: Discovery ✅

**Status**: Complete
**Output**: `KILOCLAW_GOOGLE_WORKSPACE_AGENCY_IMPLEMENTATION_PLAN_V1_2026-04-09.md`

### Phase F2: Research & Tool Decision

**Status**: In Progress

#### Work Items

- [x] Online research on Google Workspace MCP patterns
- [x] OAuth 2.1 security best practices research
- [x] Google API rate limiting patterns research
- [ ] Tool Decision Record formalization
- [ ] Scorecard validation against findings

#### Tool Decision (from plan)

| Option       | Score    | Decision     |
| ------------ | -------- | ------------ |
| Native-first | 4.35     | -            |
| MCP-first    | 2.75     | -            |
| **Hybrid**   | **3.95** | **SELECTED** |

**Rationale**: Hybrid provides best balance of security (native), coverage (MCP fallback), and maintainability.

### Phase F3: Architecture & Manifest

**Status**: Pending

#### Work Items

- [ ] Define agency manifest schema
- [ ] Design adapter architecture (native Google APIs)
- [ ] Design MCP fallback mechanism
- [ ] Define policy matrix (SAFE/NOTIFY/CONFIRM/DENY)
- [ ] Design HITL protocol
- [ ] Session isolation design
- [ ] Audit trail schema

#### Architecture Components

```
Intent → Agency(gworkspace) → DomainAgent → Skill(capability) → Tool(native|mcp)
```

| Component           | Responsibility                   | File                   |
| ------------------- | -------------------------------- | ---------------------- |
| Intent router       | Classify intent + risk           | `routing/`             |
| Agency orchestrator | Select agent + phase-gate        | `agency-gworkspace.ts` |
| Domain agent        | Execute per-service capability   | `agents/gworkspace/`   |
| Skill runtime       | Reusable capability bundles      | `skills/gworkspace/`   |
| Tool broker         | Route native/MCP + retry         | `broker/`              |
| Policy engine       | Enforce SAFE/NOTIFY/CONFIRM/DENY | `policy/`              |
| Session guard       | Session + tenant isolation       | `session-guard.ts`     |
| Audit sink          | Critical event persistence       | `audit/`               |

### Phase F4: Build (Implementation)

**Status**: Pending

#### Milestone M1: Gmail + Calendar Read Path

| Task                                          | File                               | Dependencies |
| --------------------------------------------- | ---------------------------------- | ------------ |
| Gmail adapter (search, read, thread)          | `adapters/gmail.ts`                | None         |
| Calendar adapter (list, events, availability) | `adapters/calendar.ts`             | None         |
| OAuth integration                             | `auth/gworkspace-oauth.ts`         | None         |
| Contract tests                                | `test/gworkspace/gmail.test.ts`    | M1           |
| Contract tests                                | `test/gworkspace/calendar.test.ts` | M1           |

#### Milestone M2: Drive/Docs/Sheets Core

| Task                                       | File                            | Dependencies |
| ------------------------------------------ | ------------------------------- | ------------ |
| Drive adapter (search, list, permissions)  | `adapters/drive.ts`             | M1           |
| Docs adapter (read, append, update blocks) | `adapters/docs.ts`              | M1           |
| Sheets adapter (read ranges, update)       | `adapters/sheets.ts`            | M1           |
| Policy matrix enforcement                  | `policy/matrix.ts`              | M1           |
| Contract tests                             | `test/gworkspace/drive.test.ts` | M2           |

#### Milestone M3: Write Path + HITL + Audit

| Task                                    | File                             | Dependencies |
| --------------------------------------- | -------------------------------- | ------------ |
| Write operations (send, create, update) | `adapters/*write*.ts`            | M2           |
| HITL protocol implementation            | `hitl/protocol.ts`               | M2           |
| Audit trail                             | `audit/trail.ts`                 | M2           |
| Policy tests                            | `test/gworkspace/policy.test.ts` | M3           |

#### Milestone M4: MCP Fallback + Resilience

| Task                         | File                                 | Dependencies |
| ---------------------------- | ------------------------------------ | ------------ |
| MCP fallback broker          | `broker/mcp-fallback.ts`             | M3           |
| Retry/backoff implementation | `broker/retry.ts`                    | M3           |
| Circuit breaker              | `broker/circuit-breaker.ts`          | M3           |
| Resilience tests             | `test/gworkspace/resilience.test.ts` | M4           |

### Phase F5: Verification

**Status**: Pending

#### Test Coverage Requirements

| Category    | Coverage                | Command                                             |
| ----------- | ----------------------- | --------------------------------------------------- |
| Unit        | >= 85% line coverage    | `bun test --cwd packages/opencode test/gworkspace/` |
| Contract    | 100% capability mapping | Contract tests per adapter                          |
| Integration | 30 scenarios            | `test/gworkspace/integration/`                      |
| Resilience  | 20 fault injection      | `test/gworkspace/resilience/`                       |
| Security    | 0 high findings         | Security review                                     |

### Phase F6: Rollout

**Status**: Pending

#### Rollout Stages

| Stage    | Traffic | Duration | Exit Criteria     |
| -------- | ------- | -------- | ----------------- |
| Shadow   | 0%      | 1 week   | Delta errors < 2% |
| Canary 1 | 5%      | 1 week   | No P1 for 7 days  |
| Canary 2 | 25%     | 1 week   | SLO in threshold  |
| GA       | 100%    | Ongoing  | G6 GO signed      |

---

## Capability Taxonomy (v1)

| Service  | Read Capabilities                   | Write Capabilities         | Default Tier |
| -------- | ----------------------------------- | -------------------------- | ------------ |
| Gmail    | search, thread, message, labels     | draft, send, apply_labels  | T0-T2        |
| Calendar | list, events, availability          | create, update, RSVP       | T0-T2        |
| Drive    | search, list, metadata, permissions | move, copy, share_internal | T0-T2        |
| Docs     | read_structure, extract_sections    | append_block, replace_text | T0-T2        |
| Sheets   | read_ranges, metadata               | append_rows, update_ranges | T0-T2        |

---

## Policy Matrix

| Service       | Operation                  | Policy       | Enforcement                 |
| ------------- | -------------------------- | ------------ | --------------------------- |
| Gmail         | messages.get, threads.list | SAFE         | Redaction optional          |
| Gmail         | drafts.create              | NOTIFY       | Preview body                |
| Gmail         | messages.send              | CONFIRM      | Confirm recipients          |
| Gmail         | bulk send >50              | DENY         | Hard block v1               |
| Calendar      | events.list                | SAFE         | Time window filter          |
| Calendar      | events.insert (internal)   | CONFIRM      | Preview participants        |
| Calendar      | update >20 attendees       | CONFIRM+HITL | Organizational risk         |
| Drive         | files.list/get             | SAFE         | ACL check first             |
| Drive         | share same domain          | CONFIRM      | Group check                 |
| Drive         | share public               | DENY         | No-go v1                    |
| Docs/Sheets   | read                       | SAFE         | Data masking where required |
| Docs/Sheets   | update                     | CONFIRM      | Diff required               |
| Cross-service | summarization              | NOTIFY       | Provenance list             |
| Any           | permanent delete           | DENY         | v2 with governance          |

---

## HITL Triggers

### Hard Triggers (Immediate HITL)

- External email outside domain
- File sharing to external users
- Bulk modifications to calendars/docs/sheets
- Any action with declared economic/legal impact

### HITL Sequence

1. Generate execution plan with impacts
2. Show preview/diff and risk
3. Request approval with approver ID
4. Execute within TTL (15 min)
5. Register post-action report

---

## File Structure

```
packages/opencode/src/kiloclaw/agency/
├── agents/
│   └── gworkspace/                    # Google Workspace domain agents
│       ├── index.ts
│       ├── gmail-agent.ts
│       ├── calendar-agent.ts
│       ├── drive-agent.ts
│       └── docs-agent.ts
├── skills/
│   └── gworkspace/                    # Google Workspace skills
│       ├── index.ts
│       ├── gmail-skills.ts
│       ├── calendar-skills.ts
│       └── drive-skills.ts
├── adapters/                          # Native Google API adapters
│   ├── gmail-adapter.ts
│   ├── calendar-adapter.ts
│   ├── drive-adapter.ts
│   ├── docs-adapter.ts
│   └── sheets-adapter.ts
├── broker/                            # Tool routing + fallback
│   ├── gworkspace-broker.ts
│   ├── native-tool.ts
│   ├── mcp-fallback.ts
│   ├── retry.ts
│   └── circuit-breaker.ts
├── policy/                            # Policy engine
│   ├── gworkspace-policy.ts
│   ├── matrix.ts
│   └── hitl/
│       ├── protocol.ts
│       └── approval.ts
├── auth/                              # OAuth integration
│   ├── gworkspace-oauth.ts
│   └── token-store.ts
├── audit/                             # Audit trail
│   └── gworkspace-audit.ts
└── session-guard.ts                   # Session isolation

packages/opencode/src/kiloclaw/agency/manifests/
└── gworkspace-manifest.ts             # Agency manifest
```

---

## SLOs

| SLO                              | Target  | Error Budget  |
| -------------------------------- | ------- | ------------- |
| Availability read path           | 99.5%   | 3h 36m/month  |
| Availability write path          | 99.0%   | 7h 12m/month  |
| Latency p95 read                 | <= 2.5s | -             |
| Latency p95 write (no HITL wait) | <= 6s   | -             |
| Policy enforcement correctness   | 99.99%  | 4.3 min/month |

---

## Risk Register

| Risk                      | Severity | Probability | Mitigation                          | Limit                           |
| ------------------------- | -------- | ----------- | ----------------------------------- | ------------------------------- |
| OAuth scope creep         | High     | Medium      | Least privilege + scope review gate | No go-live without scope review |
| Unauthorized write        | High     | Low         | Policy matrix + HITL + audit        | Auto-block                      |
| Calendar/Drive sync drift | Medium   | Medium      | Sync token handling + full resync   | Retry backlog <= 15 min         |
| API quota saturation      | High     | Medium      | Backoff + queueing + token bucket   | Error budget <= 1%              |
| Cross-tenant data leakage | Critical | Low         | Session isolation + tenant guard    | P1 = immediate rollback         |

---

## Decisions Log

| Date       | Decision                     | Rationale                                           |
| ---------- | ---------------------------- | --------------------------------------------------- |
| 2026-04-09 | Hybrid native-first approach | Best security/coverage balance (score 3.95)         |
| 2026-04-09 | Tool tiers T0-T3             | Aligned with MCP patterns and plan                  |
| 2026-04-09 | HITL TTL 15 min              | From plan section 8                                 |
| 2026-04-09 | MCP fallback triggers        | native_unsupported, provider_degraded, feature_flag |

---

## Next Steps

1. **Immediate**: Create agency manifest and schema
2. **Week 1**: Implement Gmail + Calendar adapters (M1)
3. **Week 2**: Implement Drive/Docs/Sheets adapters (M2)
4. **Week 3**: Write path + HITL + audit (M3)
5. **Week 4**: MCP fallback + resilience (M4)
6. **Week 5-6**: Testing + hardening
7. **Week 7-8**: Shadow → Canary → GA rollout

---

## Dependencies

| Block              | Dependency                   | Mitigation              |
| ------------------ | ---------------------------- | ----------------------- |
| OAuth verification | Brand asset + privacy policy | Start early in W1       |
| Quota tuning       | Real traffic baseline        | Shadow telemetry in W4  |
| DWD approval       | Admin domain policy          | Dedicated admin runbook |
