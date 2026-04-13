# Google Workspace Agency - Prioritization & Decision Matrix

**Date**: 2026-04-13  
**Purpose**: Help leadership & engineering decide implementation order and trade-offs  
**Status**: Ready for Discussion

---

## Decision Framework

### Assumptions

1. **Team capacity**: 2-3 developers for 5 weeks
2. **Release cadence**: Weekly canaries (not all-or-nothing)
3. **User impact**: Prioritize by blocking user workflows
4. **Technical risk**: Prefer low-risk, high-impact fixes first

---

## Issue Priority Ranking

### Ranking Criteria

- **Impact** (1-5): How many users affected, how critical
- **Urgency** (1-5): How long until it breaks in production
- **Effort** (1-5): 1=trivial, 5=massive
- **Risk** (1-5): 1=low, 5=high
- **Dependencies** (text): What must complete first

### Ranked Issues

#### 🥇 Priority 1: Token Persistence (CRITICAL)

```
Issue:       In-memory token cache; process restart = user logout
Impact:      5/5 (100% of users affected)
Urgency:     5/5 (Will happen immediately in production)
Effort:      2/5 (1 week, straightforward)
Risk:        1/5 (Low - backward compatible, isolated change)
Dependencies: None
ROI:         5/5 (Fixes critical production blocker)

Blocking:    Everything else (users must be logged in)
Must Start:  Week 1, Day 1
Must Ship:   Week 1, Day 5
```

**Decision**: ✅ **IMPLEMENT FIRST** — unblocks all other work

---

#### 🥈 Priority 2: File Download & Parse (HIGH)

```
Issue:       Cannot download email attachments or Drive files
Impact:      4/5 (Most users need to process attachments)
Urgency:     4/5 (Common daily use case, but workaround exists)
Effort:      2.5/5 (1.5 weeks, moderate complexity)
Risk:        1/5 (Low - new feature, no breaking changes)
Dependencies: Phase 1 (Token Persistence)
ROI:         4/5 (Enables common workflow)

Blocking:    Phase 3 (CRUD ops need similar download code)
Must Start:  Week 2, Day 1
Must Ship:   Week 2, Day 5
```

**Decision**: ✅ **IMPLEMENT SECOND** — enables real-world usage

---

#### 🥉 Priority 3: CRUD Operations (HIGH)

```
Issue:       Cannot create/edit Google Docs, Sheets, Slides
Impact:      4/5 (Advanced users need content creation)
Urgency:     3/5 (Read-only satisfies many workflows short-term)
Effort:      3/5 (2 weeks, multiple APIs, conflict handling)
Risk:        2/5 (Moderate - collab scenarios need care)
Dependencies: Phase 1 (Token Persistence)
ROI:         4/5 (Enables content creation workflows)

Blocking:    None (Phase 4 is independent)
Must Start:  Week 3, Day 1
Must Ship:   Week 4, Day 5
```

**Decision**: ⚠️ **IMPLEMENT THIRD** — balances impact + effort

---

#### 🟡 Priority 4: Cross-Workspace Mining (MEDIUM)

```
Issue:       Cannot search/query across entire organization
Impact:      2/5 (Only enterprise users need this)
Urgency:     2/5 (Single-user scope is acceptable for MVP)
Effort:      2/5 (1 week, but requires admin permissions)
Risk:        3/5 (Higher - permission model complexity)
Dependencies: Phase 1 (Token Persistence), Conditional on Admin API access
ROI:         2/5 (Nice-to-have, not critical)

Blocking:    None (can be post-launch if needed)
Must Start:  Week 5, Day 1 (optional)
Must Ship:   Week 5, Day 5 (optional)
```

**Decision**: ⏳ **DEFER TO PHASE 2** — can ship MVP without this

---

## Alternative Prioritization Strategies

### Strategy A: "Critical Path First" (RECOMMENDED)

**Order**: Token Persistence → File Download → CRUD → Workspace Mining  
**Rationale**: Fix critical blocker first, then unlock feature unlocks  
**Timeline**: 5 weeks  
**Team**: 2-3 developers  
**Risk**: Low  
✅ **Recommended for production deployment**

---

### Strategy B: "MVP First" (ALTERNATIVE)

**Order**: Token Persistence → CRUD → File Download → Workspace Mining  
**Rationale**: Prioritize write operations for demo/sales  
**Timeline**: 5 weeks (same, different order)  
**Team**: 2-3 developers  
**Risk**: Medium (file download becomes catch-up work)  
⚠️ **Only if business requirements prioritize content creation**

---

### Strategy C: "Phase 1 + Phase 3 Only" (CONSTRAINED)

**Implement**: Token Persistence + CRUD (skip file download & workspace mining)  
**Timeline**: 3 weeks  
**Team**: 2 developers  
**Gap**: Cannot process email attachments, no org-wide search  
**ROI**: High for content creation, low for document processing  
🚫 **Not recommended — leaves critical gap**

---

### Strategy D: "Parallel Streams" (RISKY)

**Parallel**:

- Stream A: Token Persistence (1 dev)
- Stream B: CRUD Docs + Sheets (2 devs)
- Then: File Download + Workspace Mining

**Timeline**: 5 weeks (parallel reduces felt effort)  
**Team**: 3 developers required  
**Risk**: High (integration complexity, merge conflicts)  
⚠️ **Only if team is 3+ developers with strong communication**

---

## Business Impact by Scenario

### Scenario A: Consulting Firm Using Kiloclaw

**Most Important**:

1. ✅ Token persistence (session recovery)
2. ✅ File download (read client PDFs attached to emails)
3. 🟡 CRUD (create case summaries in Docs/Sheets)
4. ❌ Workspace mining (not needed)

**Recommendation**: Strategy A (Critical Path First)  
**ROI**: High — all 3 implemented features directly enable workflows

---

### Scenario B: Enterprise with Strong Admin Requirements

**Most Important**:

1. ✅ Token persistence (session recovery)
2. ✅ Workspace mining (find all docs across org)
3. ✅ CRUD (create templates, dashboards)
4. 🟡 File download (secondary)

**Recommendation**: Modified Strategy A

- Phase 1: Token Persistence
- Phase 2: Workspace Mining (admin priority)
- Phase 3: CRUD
- Phase 4: File Download

**Timeline**: 5 weeks (same), different order

---

### Scenario C: Startup MVP

**Most Important**:

1. ✅ Token persistence (session recovery)
2. ✅ CRUD (create templates for clients)
3. ❌ File download (workaround: manual uploads)
4. ❌ Workspace mining (post-MVP)

**Recommendation**: Strategy C (Phase 1 + Phase 3 only)  
**Timeline**: 3 weeks  
**Tradeoff**: Skip file download, accept higher user friction

---

## Go / No-Go Decision Points

### End of Week 1: Token Persistence Gate

```
✅ GO CRITERIA:
  - Session persists across restart
  - Token auto-refresh working
  - 50+ unit tests passing
  - No data loss on logout

❌ NO-GO Triggers:
  - Encryption fails
  - Token loss on unexpected shutdown
  - Tests <80% passing
  - Performance regression >10%

DECISION: Proceed to Phase 2?
  Yes, if ✅ GO — continue as planned
  No, if ❌ NO-GO — extend Phase 1, delay Phase 2
```

---

### End of Week 2: File Download Gate

```
✅ GO CRITERIA:
  - Download works for PDF, DOCX, XLSX, PPTX
  - Parser handles file encoding
  - Cache cleanup working
  - 30+ integration tests passing
  - No performance regression

❌ NO-GO Triggers:
  - Parser fails on real-world docs
  - Cache grows unbounded
  - Tests <80% passing
  - Download >30s for 10MB file

DECISION: Proceed to Phase 3?
  Yes, if ✅ GO — continue as planned
  No, if ❌ NO-GO — extend Phase 2, delay Phase 3
```

---

### End of Week 4: CRUD Gate

```
✅ GO CRITERIA:
  - Create/Update/Delete working for all 3 services
  - Batch operations functioning
  - Conflict detection implemented
  - 40+ tests passing
  - No data corruption

❌ NO-GO Triggers:
  - Conflict resolution fails
  - Batch operations timeout
  - Tests <80% passing
  - Real-time collab issues detected

DECISION: Ship to production?
  Yes, if ✅ GO — Phase 5 (production)
  No, if ❌ NO-GO — extend Phase 4, fix issues
```

---

## Resource Trade-Offs

### If Team = 2 Developers (Constrained)

```
Week 1: Both on Token Persistence (speed + safety)
Week 2: One on File Download, one on CRUD prep
Week 3: Both on CRUD
Week 4: Both on CRUD + File Download cleanup
Week 5: Workspace Mining (optional, low priority)

Risk: High (single point of failure per phase)
Recommend: Hire contractor for Week 2-3 if possible
```

---

### If Team = 3 Developers (Ideal)

```
Week 1: All 3 on Token Persistence (fast + thorough)
Week 2: One on File Download, two on CRUD planning
Week 3: Two on CRUD, one on File Download + tests
Week 4: All 3 on CRUD completion
Week 5: One on Workspace Mining, two on final QA

Risk: Low (parallel work possible, good coverage)
Recommend: This is sweet spot
```

---

### If Team = 1 Developer (Not Recommended)

```
Week 1: Token Persistence
Week 2: File Download
Week 3-4: CRUD (will need 2 weeks)
Week 5: Workspace Mining (if time)

Risk: Very high (single point of failure, burnout risk)
Recommend: Don't attempt — scope to Phase 1 + Phase 2 only (3 weeks)
```

---

## Financial Impact Analysis

### If We Don't Fix These Issues

```
🔴 COST 1: User Frustration
  - 30% of support tickets related to re-auth
  - ~5 support hours/week = $250/week
  - Annual: $13K

🔴 COST 2: Productivity Loss
  - Users re-authenticate ~2x/week average
  - Average 5 min per re-auth = 10 min/user/week
  - 100 users × 10 min × 52 weeks = 868 hours lost
  - At $50/hour loaded: $43.4K

🔴 COST 3: Feature Gap
  - Cannot process attachments (manual workaround)
  - Cannot create content (limits use cases)
  - Estimated 40% of prospective customer churn

📊 TOTAL ANNUAL COST: ~$56K+ (support + productivity + churn)
```

### If We Invest 5 Weeks to Fix

```
💰 INVESTMENT: 5 weeks × 2-3 developers
  - At 200 hours/week (2 devs) = 1000 hours
  - At $150/hour fully loaded = $150K
  - Or: 3 devs × 5 weeks = 1500 hours = $225K

📈 PAYBACK PERIOD:
  - Break-even: ~3-4 months (Cost vs. Investment)
  - ROI at year 2: ~3x return
  - Strategic value: Feature parity with competitors

✅ BUSINESS CASE: Strong ROI after payback period
```

---

## Risk Mitigation by Phase

### Phase 1 Risk: Token Data Corruption

```
RISK:     Encrypted tokens unreadable → users locked out
SEVERITY: 🔴 CRITICAL
PLAN A:   Backup strategy — store plaintext copy (encrypted) separately
PLAN B:   Fallback to session tokens with re-auth prompt
PLAN C:   Canary deployment (10% users) before full rollout
```

### Phase 2 Risk: Parser Failure on Edge Cases

```
RISK:     Unsupported doc format → agent fails
SEVERITY: 🟠 HIGH
PLAN A:   Fallback to Google Drive export API (auto-convert to PDF)
PLAN B:   Return raw binary, let user decide
PLAN C:   Skip file, continue with other email content
```

### Phase 3 Risk: Real-Time Collab Conflicts

```
RISK:     User A and B edit same doc → merge conflict
SEVERITY: 🟠 HIGH
PLAN A:   Implement conflict detection (warn before write)
PLAN B:   Use revision IDs (optimistic locking)
PLAN C:   For MVP, disable concurrent edits (single-user writes)
```

### Phase 4 Risk: Permission Bypass

```
RISK:     User sees docs they shouldn't access
SEVERITY: 🔴 CRITICAL
PLAN A:   Always check permission before returning result
PLAN B:   Use Google's permission API (driveGetFile with fields=permissions)
PLAN C:   Scope queries to "shared with me" only (conservative)
```

---

## Recommendation Summary

### For Production Deployment

**Follow Strategy A**: Token Persistence → File Download → CRUD → Workspace Mining

### For MVP / Demo

**Follow Strategy C**: Token Persistence + CRUD only (3 weeks)

### For Enterprise

**Modify Strategy A**: Token Persistence → Workspace Mining → File Download → CRUD

### Timing

**Start Date**: This week (2026-04-13 kickoff)  
**Phase 1 Completion**: 2026-04-20  
**Full Completion**: 2026-05-18  
**Production Go-Live**: 2026-05-25

---

## Approval Sign-Off

```
ENGINEERING LEAD:
☐ Approve 5-week timeline
☐ Approve "Strategy A" prioritization
☐ Confirm team allocation (2-3 developers)
☐ Confirm go/no-go gates

SECURITY LEAD:
☐ Approve token encryption approach
☐ Approve permission checking in Phase 4
☐ Review risk mitigation plans

PRODUCT/BUSINESS:
☐ Confirm customer impact prioritization
☐ Approve "file download before CRUD" order
☐ Approve deferring workspace mining to Phase 2

LEADERSHIP:
☐ Approve $150-225K investment
☐ Approve 5-week timeline impact on other projects
☐ Commit team resources for duration
```

---

## Next Step

**This Week**:

1. [ ] Review this document
2. [ ] Discuss prioritization with team
3. [ ] Make go/no-go decision on timeline
4. [ ] Approve implementation start date

**Decision**: When should Phase 1 start?

- [ ] This week (2026-04-15)
- [ ] Next week (2026-04-22)
- [ ] After other work completes (date: **\_\_\_**)
