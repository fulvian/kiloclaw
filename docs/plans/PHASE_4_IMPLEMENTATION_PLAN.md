# Phase 4: Implementation Plan - Google Workspace Agency
**Date**: 2026-04-14  
**Status**: Ready for Implementation  
**Duration**: 2-3 weeks (15-20 working days)  
**Priority**: CRITICAL (blocking production deployment)

---

## Work Breakdown Structure (WBS)

### Epic 1: Token Persistence (Days 1-2) 🔴 CRITICAL
**Priority**: HIGHEST  
**Blocking**: All other work  
**Goal**: Move from in-memory to encrypted database

#### Task 1.1: Database Setup
- [ ] Create `gworkspace_tokens` table (schema in PHASE_3_DESIGN.md)
- [ ] Create `gworkspace_token_rotations` audit table
- [ ] Add indexes for performance (user_id, expires_at)
- [ ] Create migrations (if using Flyway/Liquibase)
- **Effort**: 2-4 hours
- **Owner**: DB team or DevOps

#### Task 1.2: Token Encryption Layer
- [ ] Implement AES-256-GCM encryption
  - [ ] Use Node.js crypto module
  - [ ] Generate random nonce per token
  - [ ] Serialize nonce + ciphertext + tag
- [ ] Implement PBKDF2 key derivation
- [ ] Key management strategy (env vars or Secrets Manager)
- [ ] Unit tests for encrypt/decrypt
- **Effort**: 4-6 hours
- **Owner**: Security engineer or senior dev

#### Task 1.3: TokenManager Implementation
- [ ] Implement `TokenManager.store(userId, tokens)`
  - [ ] Encrypt tokens
  - [ ] Save to database
  - [ ] Update in-memory cache
- [ ] Implement `TokenManager.getValidToken(userId)`
  - [ ] Check cache first
  - [ ] If expired/missing: fetch from DB
  - [ ] If DB token expired: auto-refresh
  - [ ] Return valid accessToken
- [ ] Implement `TokenManager.refresh(userId)`
  - [ ] Call Google OAuth endpoint
  - [ ] Invalidate old refreshToken (revoke)
  - [ ] Store new tokens encrypted
- [ ] Implement `TokenManager.revoke(userId)`
  - [ ] Call Google revocation endpoint
  - [ ] Delete from DB
  - [ ] Clear cache
- [ ] Unit tests for all methods
- **Effort**: 8-12 hours
- **Owner**: Senior dev (critical path)

#### Task 1.4: Broker Integration
- [ ] Update `GWorkspaceBroker` to use TokenManager
  - [ ] Remove hardcoded `config.accessToken`
  - [ ] Call TokenManager.getValidToken() before each request
  - [ ] Wrap in try/catch for re-auth errors (401)
- [ ] Update skill definitions
  - [ ] Pass userId to broker methods
  - [ ] Remove token passing from skill layer
- [ ] Integration tests (mock Google OAuth)
- **Effort**: 4-6 hours
- **Owner**: Dev

#### Task 1.5: Migration Strategy
- [ ] Create migration script
  - [ ] Export in-memory tokens (if any)
  - [ ] Encrypt + store in DB
  - [ ] Log migration events
- [ ] Graceful degradation (accept both in-memory + DB for 24h)
- [ ] Documentation for deployment team
- **Effort**: 2-4 hours
- **Owner**: Dev + DevOps

**Epic 1 Total**: ~20-30 hours (2-3 days)

---

### Epic 2: CRUD Operations (Days 3-5) 🔴 CRITICAL
**Priority**: HIGHEST  
**Blocking**: Core functionality  
**Goal**: 95% API coverage (add 23 endpoints)

#### Task 2.1: Google Docs CRUD (1.5 days)
- [ ] `docsCreate(accessToken, title, content?)`
  - [ ] Create document
  - [ ] Optionally populate content via batchUpdate
  - [ ] Return documentId
- [ ] `docsUpdate(accessToken, documentId, requests)`
  - [ ] Accept array of batchUpdate requests
  - [ ] Handle text position indices (UTF-16)
  - [ ] Return result with revision ID
- [ ] `docsDelete(accessToken, documentId)`
  - [ ] Use Drive API to delete file
- [ ] `docsBatchInsert(accessToken, requests)`
  - [ ] Create multiple documents
  - [ ] Return documentIds
- [ ] Adapter methods for Docs API
- [ ] Skill definitions (DocsSkills.create, update, delete)
- [ ] Tests for each operation
- **Effort**: 12-16 hours
- **Owner**: Dev

#### Task 2.2: Google Sheets CRUD (1 day)
- [ ] `sheetsCreate(accessToken, title, worksheets?)`
  - [ ] Create spreadsheet
  - [ ] Optionally create worksheets
- [ ] `sheetsAppend(accessToken, spreadsheetId, range, values)`
  - [ ] Append rows to sheet
  - [ ] Auto-increment range if needed
- [ ] `sheetsUpdate(accessToken, spreadsheetId, range, values)`
  - [ ] Update range with values
- [ ] `sheetsClear(accessToken, spreadsheetId, range)`
  - [ ] Clear range
- [ ] `sheetsDelete(accessToken, spreadsheetId)`
  - [ ] Use Drive API to delete
- [ ] Adapter methods for Sheets API
- [ ] Skill definitions (SheetsSkills.append, update, clear)
- [ ] Tests for each operation
- **Effort**: 8-12 hours
- **Owner**: Dev

#### Task 2.3: Google Slides CRUD (1 day)
- [ ] `slidesCreate(accessToken, title)`
  - [ ] Create presentation
- [ ] `slidesRead(accessToken, presentationId)`
  - [ ] Get presentation (already partially implemented)
- [ ] `slidesAddSlide(accessToken, presentationId, layout)`
  - [ ] Add slide to presentation
- [ ] `slidesUpdate(accessToken, presentationId, requests)`
  - [ ] Batch update slides
- [ ] `slidesDelete(accessToken, presentationId)`
  - [ ] Use Drive API to delete
- [ ] Adapter methods for Slides API
- [ ] Skill definitions (SlidesSkills.create, add, update)
- [ ] Tests for each operation
- **Effort**: 8-12 hours
- **Owner**: Dev

#### Task 2.4: Calendar + Drive CRUD (1.5 days)
- [ ] Calendar: update, delete events (create/read exists)
- [ ] Drive: create, update, delete files (search/share exists)
- [ ] Adapter methods
- [ ] Skill definitions
- [ ] Tests
- **Effort**: 8-12 hours
- **Owner**: Dev

#### Task 2.5: Idempotency Implementation
- [ ] Design idempotency key strategy
  - [ ] Client-provided keys OR
  - [ ] Content hash-based keys
- [ ] Implement idempotency key store
  - [ ] Database table: `gworkspace_idempotency_keys`
  - [ ] TTL: 30 minutes (configurable)
- [ ] Update broker to check for duplicate requests
- [ ] Integration tests
- **Effort**: 8-12 hours
- **Owner**: Dev

**Epic 2 Total**: ~44-64 hours (5-7 days)**

---

### Epic 3: Error Recovery (Day 6) ⚠️ HIGH
**Priority**: HIGH  
**Blocking**: Reliability  
**Goal**: Smart retry + circuit breaker

#### Task 3.1: Error Classification
- [ ] Implement ErrorClassification type + map
  - [ ] Transient: 408, 429, 5xx
  - [ ] Permanent: 4xx (except 429, 408)
  - [ ] Auth: 401
  - [ ] Quota: 403 (distinguish from permission)
- [ ] Implement error parsing
  - [ ] Extract status code from Google response
  - [ ] Parse error message
  - [ ] Detect "Quota exceeded" vs "Permission denied"
- [ ] Unit tests
- **Effort**: 4-6 hours
- **Owner**: Dev

#### Task 3.2: Smart Retry Logic
- [ ] Implement `withSmartRetry<T>(fn, operation, isIdempotent)`
  - [ ] Check error classification
  - [ ] Only retry transient errors
  - [ ] Check Retry-After header (priority)
  - [ ] Fall back to exponential backoff
  - [ ] Max 5 retries (configurable)
  - [ ] Max backoff 60 seconds
- [ ] Integrate with existing `withRetry()` function
- [ ] Update adapter methods to use withSmartRetry
- [ ] Unit tests
- **Effort**: 6-8 hours
- **Owner**: Dev

#### Task 3.3: Circuit Breaker Pattern
- [ ] Implement CircuitBreaker class
  - [ ] States: CLOSED, OPEN, HALF_OPEN
  - [ ] Failure threshold: 5 consecutive failures
  - [ ] Recovery timeout: 60 seconds
  - [ ] Success threshold in HALF_OPEN: 3 successes
- [ ] Integrate with broker
  - [ ] One circuit breaker per service (Gmail, Drive, Calendar, etc.)
- [ ] Alerting on state changes (CLOSED → OPEN)
- [ ] Unit tests
- **Effort**: 6-8 hours
- **Owner**: Dev

#### Task 3.4: Auth Error Handling
- [ ] Detect 401 errors (token expired/invalid)
- [ ] Trigger token refresh via TokenManager
- [ ] If refresh fails: Return clear error message
  - [ ] "Authentication required - please re-login"
- [ ] Update skills to handle auth errors
- [ ] Integration tests
- **Effort**: 4-6 hours
- **Owner**: Dev

#### Task 3.5: Quota Handling
- [ ] Detect 403 "Quota exceeded" errors
- [ ] Distinguish from permission denied
- [ ] Return clear error message
  - [ ] "API quota exceeded - try again later"
- [ ] Log quota exhaustion events
- [ ] Optional: Check Google Quota API before operations
- **Effort**: 4-6 hours
- **Owner**: Dev

**Epic 3 Total**: ~24-34 hours (3 days)**

---

### Epic 4: Document Export (Days 7-8) ✅ MEDIUM
**Priority**: MEDIUM  
**Goal**: Stream-based export + parsing

#### Task 4.1: Export Infrastructure
- [ ] Implement `exportAndParse(accessToken, fileId, format)`
  - [ ] Stream from Google Drive API
  - [ ] No temp files (direct to buffer)
  - [ ] Size limit check (10MB)
  - [ ] Timeout: 30 seconds
- [ ] Add export format mapping
  - [ ] Docs → PDF, DOCX, text
  - [ ] Sheets → CSV, XLSX
  - [ ] Slides → PDF
- [ ] Unit tests
- **Effort**: 4-6 hours
- **Owner**: Dev

#### Task 4.2: PDF Parsing
- [ ] Add `pdf-parse` library
- [ ] Implement `parsePdf(buffer)`
  - [ ] Extract text
  - [ ] Handle metadata
- [ ] Tests (mock PDF)
- **Effort**: 2-3 hours
- **Owner**: Dev

#### Task 4.3: DOCX Parsing
- [ ] Add `unzipper` + `xml2js` libraries
- [ ] Implement `parseDocx(buffer)`
  - [ ] Unzip DOCX (it's ZIP)
  - [ ] Parse word/document.xml
  - [ ] Extract text with formatting preserved (optional)
- [ ] Tests (real DOCX sample)
- **Effort**: 2-3 hours
- **Owner**: Dev

#### Task 4.4: Sheets Parsing
- [ ] Add `xlsx` library
- [ ] Implement `parseSheets(buffer, format)`
  - [ ] Handle XLSX (office format)
  - [ ] Convert to CSV
  - [ ] Include sheet names
- [ ] Tests (mock Sheets)
- **Effort**: 2-3 hours
- **Owner**: Dev

#### Task 4.5: Skills Integration
- [ ] Add `DocsSkills.read()` enhancement
  - [ ] Option to export as PDF/DOCX
  - [ ] Return parsed content
- [ ] Add `SheetsSkills.read()` enhancement
  - [ ] Option to export as CSV/XLSX
  - [ ] Return parsed content
- [ ] Tests
- **Effort**: 2-4 hours
- **Owner**: Dev

**Epic 4 Total**: ~14-22 hours (2 days)**

---

### Epic 5: Testing & Integration (Days 9-10) ✅ HIGH
**Priority**: HIGH  
**Goal**: Comprehensive testing + integration validation

#### Task 5.1: Unit Tests
- [ ] Token encryption/decryption
- [ ] Token manager methods
- [ ] Error classification
- [ ] Circuit breaker logic
- [ ] Export parsers (with mock data)
- **Effort**: 8-12 hours
- **Owner**: QA + Dev

#### Task 5.2: Integration Tests
- [ ] Real Google Workspace account (test workspace)
- [ ] OAuth flow (code exchange, token refresh)
- [ ] CRUD operations (create, read, update, delete)
- [ ] Error scenarios (403, 429, 503)
- [ ] Document export + parsing
- **Effort**: 12-16 hours
- **Owner**: QA + Senior Dev

#### Task 5.3: Load Tests
- [ ] Rate limiting behavior
- [ ] Backoff strategy under concurrent load
- [ ] Circuit breaker activation
- **Effort**: 6-8 hours
- **Owner**: Performance Eng

#### Task 5.4: Documentation
- [ ] API documentation (new CRUD operations)
- [ ] Token management docs
- [ ] Error codes + recovery strategies
- [ ] Deployment guide
- **Effort**: 6-8 hours
- **Owner**: Tech Writer

**Epic 5 Total**: ~32-44 hours (4-5 days)**

---

## Timeline & Milestones

### Week 1: Foundation (Days 1-3)
```
Monday:
- [x] Epic 1: Token Persistence setup
- [x] Database creation
- [ ] Token encryption implementation
- [ ] TokenManager basic methods

Tuesday:
- [ ] TokenManager.refresh() + rotation
- [ ] Broker integration
- [ ] Migration strategy
- [x] Epic 1 COMPLETE

Wednesday:
- [ ] Epic 2.1: Docs CRUD (create, update, delete)
- [ ] Docs tests
- [ ] Status: 50% Epic 2 done
```

### Week 2: Core Functionality (Days 4-7)
```
Thursday:
- [ ] Epic 2.2: Sheets CRUD (append, update)
- [ ] Epic 2.3: Slides CRUD (create, update)
- [ ] Status: 75% Epic 2 done

Friday:
- [ ] Epic 2.4: Calendar + Drive CRUD
- [ ] Epic 2.5: Idempotency implementation
- [ ] Status: Epic 2 COMPLETE

Monday (Week 2):
- [ ] Epic 3: Error Recovery (classification, retry, circuit breaker)
- [ ] Epic 3 COMPLETE

Tuesday:
- [ ] Epic 4: Document Export (infrastructure, parsing)
- [ ] Epic 4 COMPLETE
```

### Week 3: Testing & Polish (Days 8-10)
```
Wednesday:
- [ ] Epic 5: Unit tests
- [ ] Epic 5: Integration tests (partial)

Thursday:
- [ ] Epic 5: Load tests
- [ ] Epic 5: Documentation

Friday:
- [ ] Bug fixes + polish
- [ ] Final integration tests
- [ ] Ready for Phase 5
```

---

## Critical Dependencies

```
Token Persistence (Epic 1) ← CRITICAL PATH
    ↓ (required by everything)
CRUD Operations (Epic 2)
    ↓
Error Recovery (Epic 3)
    ↓
Testing (Epic 5)

Document Export (Epic 4) ← Can parallelize from start
    ↓
Testing (Epic 5)
```

**Critical Path**: Days 1-5 (Token + CRUD ops)  
**Parallel Path**: Days 1-8 (Document export)

---

## Resource Allocation

### Required Skills
- **Senior Backend Dev**: Lead Token Persistence + CRUD ops (critical path)
  - FTE: 1.0 (full-time)
  - Days: 10-14

- **Backend Dev**: CRUD + Error Recovery + Export
  - FTE: 0.5-1.0 (shared or parallel)
  - Days: 10-14

- **QA/Test Engineer**: Integration + load tests
  - FTE: 0.5
  - Days: 5-10

- **DB/DevOps**: Database setup + migrations
  - FTE: 0.25
  - Days: 1-2

- **Tech Writer**: Documentation
  - FTE: 0.25
  - Days: 5-8

### Total Person-Hours
- **Senior Dev**: 80-112 hours
- **Dev**: 60-100 hours
- **QA**: 40-56 hours
- **DB/Ops**: 8-12 hours
- **Writer**: 20-32 hours

**Total**: 208-312 hours (5-8 dev-weeks)

---

## Success Criteria

### Functionality
- [x] Token storage: Persistent + encrypted + rotated
- [x] CRUD ops: 23 new endpoints implemented
- [x] Error recovery: Smart retry + circuit breaker
- [x] Document export: Supports PDF, DOCX, CSV, XLSX

### Quality
- [x] Unit test coverage: >90%
- [x] Integration test coverage: All happy path + error paths
- [x] Load test: Rate limiting verified
- [x] No known security issues

### Performance
- [x] Token refresh: <500ms (cached)
- [x] CRUD ops: <1s per operation
- [x] Export: <10s for 10MB file
- [x] Error recovery: Fail-fast for permanent errors (<100ms)

### Production Readiness
- [x] Database migrations ready
- [x] Deployment guide complete
- [x] Rollback plan documented
- [x] Monitoring + alerts configured

---

## Risk Mitigation During Implementation

### Risk 1: Token Migration Issues
- **Mitigation**: Create comprehensive migration test
- **Rollback**: Keep in-memory fallback for 48 hours
- **Monitoring**: Alert on failed token lookups

### Risk 2: Breaking Existing Skills
- **Mitigation**: New CRUD skills, don't modify existing ones
- **Rollback**: Feature flag for new operations
- **Testing**: Run existing tests against both old + new code

### Risk 3: Google API Rate Limiting
- **Mitigation**: Test with realistic load before go-live
- **Rollback**: Circuit breaker prevents cascading failures
- **Monitoring**: Alert when circuit opens

### Risk 4: Database Performance
- **Mitigation**: Add proper indexes (already in schema)
- **Monitoring**: Track token query latency
- **Rollback**: Cache can serve for 1 hour if DB is down

---

## Deployment Strategy

### Phase 4 Deployment (Production)

**Pre-deployment**:
1. Database migrations (run before code deployment)
2. Encryption key rotation (new key in Secrets Manager)
3. Feature flags: CRUD ops OFF by default, Error Recovery OFF
4. Monitoring + alerts enabled

**Deployment**:
1. Blue-green deployment (0 downtime)
2. Gradual rollout: 10% → 50% → 100% (by user pool)
3. Monitor error rates + latency at each step

**Post-deployment**:
1. Enable feature flags gradually
2. Monitor token usage patterns
3. Verify circuit breaker not triggering
4. Validate CRUD ops with test users

**Rollback Plan** (if needed):
1. Disable feature flags (ops are off by default)
2. Use blue-green to revert to previous version
3. Token database preserved (no rollback needed)
4. Clear cache + reset circuit breakers

---

## Definition of Done (DoD)

For each epic/task:
- [ ] Code written + peer reviewed
- [ ] Unit tests written (>90% coverage)
- [ ] Integration tests passing
- [ ] Documentation updated
- [ ] No breaking changes to existing code
- [ ] Performance benchmarks met
- [ ] Security review passed (for token mgmt)
- [ ] Merged to main branch

---

## Next Steps

→ **Phase 4 Ready to Start**

All designs complete. Can begin implementation immediately with Epic 1 (Token Persistence) on critical path.

**Estimated Completion**: 2-3 weeks from start date
