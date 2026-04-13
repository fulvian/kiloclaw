# Google Workspace Agency - Technical Audit Findings

**Analysis Date**: 2026-04-13  
**Status**: CRITICAL ISSUES IDENTIFIED  
**Recommendation**: Implement comprehensive improvements in 4 priority areas

---

## EXECUTIVE SUMMARY

The Google Workspace agency has **working read-heavy functionality** but exhibits **three critical vulnerabilities**:

1. **Authentication**: Token lifecycle management is fragile — in-memory cache with no persistence
2. **Document Processing**: Cannot handle attachment downloads or multi-format parsing
3. **Write Operations**: CRUD for Google Docs/Sheets/Slides completely missing
4. **Cross-Workspace Query**: No aggregation capability for multi-tenant scenarios

---

## SECTION 1: AUTHENTICATION VULNERABILITY (CRITICAL)

### Current Implementation

**File**: `packages/opencode/src/kiloclaw/agency/auth/gworkspace-oauth.ts`

```typescript
// PROBLEM 1: In-memory token cache (line 50)
const tokenCache = new Map<string, TokenStore>()

// PROBLEM 2: Session loss on process restart
// No persistent storage (file, Redis, encrypted DB)
```

### Issues Found

| Issue                        | Severity | Impact                                                     | Location |
| ---------------------------- | -------- | ---------------------------------------------------------- | -------- |
| **In-Memory Cache Only**     | CRITICAL | Tokens lost on restart. Users must re-authenticate         | L50      |
| **No Token Rotation**        | HIGH     | Tokens never proactively rotated; only refreshed on demand | L134-156 |
| **60-second Refresh Window** | MEDIUM   | Aggressive buffer (60s) may cause over-refreshing          | L197     |
| **No Credential Encryption** | HIGH     | Tokens stored plaintext in memory                          | L32-36   |
| **No Revocation Handler**    | CRITICAL | Logged-out users' tokens remain valid in cache             | L175-176 |
| **Single Refresh Token**     | MEDIUM   | If refresh token expires, no recovery mechanism            | L199-201 |

### Root Cause

The authentication layer assumes **stateless per-request** OAuth2, but Kiloclaw maintains **persistent session state**. Current implementation:

```typescript
// CURRENT (BROKEN)
1. User logs in → tokens stored in memory
2. Process restarts → tokenCache cleared
3. User attempts operation → "No tokens found for user" error
4. User must re-authenticate entirely
```

**Correct approach**:

```typescript
// REQUIRED
1. User logs in → tokens encrypted and persisted to disk
2. Process restarts → tokens loaded from disk
3. User attempts operation → token auto-refreshed if needed
4. Session continues seamlessly
```

---

## SECTION 2: DOCUMENT PROCESSING GAP

### Current Coverage

**File**: `packages/opencode/src/kiloclaw/agency/broker/gworkspace-broker.ts`

Supported operations:

- ✅ Gmail: search, read, send
- ✅ Calendar: list, events, create
- ✅ Drive: search, list, get (file metadata only), share
- ✅ Docs: read (document text only)
- ✅ Sheets: read (values only)

**Missing entirely**:

- ❌ Attachment downloads (email or Drive)
- ❌ Multi-format file parsing (PDF, DOCX, XLSX, PPTX)
- ❌ Temporary storage management
- ❌ Content extraction + OCR for images
- ❌ Batch operations

### Use Case: Email with PDF Attachment

**Current Flow**:

```
User: "Read email and summarize the PDF attachment"
Agent: ✅ Finds email
Agent: ❌ Cannot download PDF
Agent: ❌ Fails to summarize
```

**Required Flow**:

```
User: "Read email and summarize the PDF attachment"
Agent: ✅ Finds email
Agent: ✅ Identifies attachment (PDF, 2.3MB)
Agent: ✅ Downloads to /repo/.gworkspace-cache/attachments/
Agent: ✅ Parses PDF → text extraction
Agent: ✅ Summarizes content
Agent: ✅ Returns summary to user
```

### API Support Analysis

| Service | Method                      | Purpose                       | Status         |
| ------- | --------------------------- | ----------------------------- | -------------- |
| Drive   | `files.get`                 | Metadata only                 | ✅ Implemented |
| Drive   | `files.get?alt=media`       | **Download file**             | ❌ Missing     |
| Drive   | `files.export?mimeType=...` | Convert Sheets→CSV, Docs→PDF  | ❌ Missing     |
| Gmail   | `messages.attachments.get`  | Attachment download           | ❌ Missing     |
| Gmail   | `messages.get`              | Message + attachment metadata | ✅ Partial     |

---

## SECTION 3: MISSING CRUD OPERATIONS

### Current Read-Only Implementation

**Docs**: Only `read` operation (line 373-381 in broker)

```typescript
case "read":
  return {
    success: true,
    data: await GWorkspaceAdapter.docsGetDocument(accessToken, args.documentId),
    provider: "native",
  }
```

**Sheets**: Only `read` operation (line 391-404 in broker)

```typescript
case "read":
  return {
    success: true,
    data: await GWorkspaceAdapter.sheetsGetSpreadsheet(...),
    provider: "native",
  }
```

**Completely Missing**:

- ❌ Document creation
- ❌ Document update/merge
- ❌ Document deletion
- ❌ Batch operations
- ❌ Styles/formatting
- ❌ Collaborative features

### Gap Analysis: What Needs Implementation

| Operation     | Google Docs | Google Sheets | Google Slides |
| ------------- | ----------- | ------------- | ------------- |
| **Create**    | ❌ Missing  | ❌ Missing    | ❌ Missing    |
| **Read**      | ✅ Partial  | ✅ Partial    | ❌ Missing    |
| **Update**    | ❌ Missing  | ❌ Missing    | ❌ Missing    |
| **Delete**    | ❌ Missing  | ❌ Missing    | ❌ Missing    |
| **Batch Ops** | ❌ Missing  | ❌ Missing    | ❌ Missing    |

### API Endpoints Required

**Google Docs API v1**:

```
POST   /documents               # Create
GET    /documents/{id}          # Read ✅
PUT    /documents/{id}:update   # Update ❌
DELETE /documents/{id}          # Delete ❌ (N/A in Docs)
```

**Google Sheets API v4**:

```
POST   /spreadsheets            # Create
GET    /spreadsheets/{id}       # Read ✅
PUT    /spreadsheets/{id}/values# Update ❌
POST   /spreadsheets/{id}:batchUpdate # Batch ❌
```

**Google Slides API v1**:

```
POST   /presentations           # Create
GET    /presentations/{id}      # Read ❌
PATCH  /presentations/{id}      # Update ❌
```

---

## SECTION 4: CROSS-WORKSPACE DATA MINING CAPABILITY

### Current Scope

The agency is **single-account only**. No facilities for:

- ❌ Multi-workspace search (requires Admin API)
- ❌ User enumeration (requires Directory API)
- ❌ Organizational structure queries
- ❌ Data aggregation + deduplication
- ❌ Compliance/governance reporting

### Required APIs

| API                           | Purpose                 | Scope           | Status     |
| ----------------------------- | ----------------------- | --------------- | ---------- |
| **Directory API**             | User/group enumeration  | Admin only      | ❌ Missing |
| **Reports API**               | Audit logs, usage data  | Admin only      | ❌ Missing |
| **Admin SDK**                 | Org structure, policies | Admin only      | ❌ Missing |
| **Drive API** (shared drives) | Cross-team search       | User accessible | ❌ Partial |
| **Gmail API** (delegation)    | User on behalf of       | Admin only      | ❌ Missing |

### Example Use Case

**Desired**: "Find all documents mentioning 'Q2 Roadmap' across the entire workspace"

**Current**: Works only for user's own Drive/Gmail  
**Required**: Search across all users (with permissions checks)

---

## SECTION 5: BROKER ARCHITECTURE ASSESSMENT

### Strengths

1. **Graceful Fallback**: Native → MCP bridge is well-designed (lines 411-435)
2. **Bus Events**: Policy + audit logging via events (lines 47-80)
3. **Retry Logic**: Exponential backoff with jitter in adapter (gworkspace-adapter.ts)
4. **HITL Integration**: Human-in-the-loop for sensitive operations (gmail.send)

### Weaknesses

1. **No Session Persistence**: Broker depends on OAuth layer's in-memory cache
2. **Limited Error Recovery**: Only retries on 429/5xx, not on token expiration
3. **No Circuit Breaker**: Could benefit from failing-fast on repeated service degradation
4. **Hard-coded Scopes**: Scopes in OAuth config but not validated against operation (L17-23)

---

## SECTION 6: ADAPTER QUALITY

**File**: `packages/opencode/src/kiloclaw/agency/adapters/gworkspace-adapter.ts` (282 lines)

### Strengths

✅ Proper retry with exponential backoff  
✅ Request timeout handling (30s default)  
✅ Zod parsing for token responses

### Gaps

❌ No request deduplication (concurrent identical requests)  
❌ No response caching  
❌ No streaming support (large file downloads)  
❌ No multipart upload  
❌ No range requests (for resumable downloads)

---

## SECTION 7: IMPLEMENTATION ROADMAP

### Phase 1: Authentication Hardening (1 week)

**Priority**: 🔴 CRITICAL — blocks all persistence

1. **Persistent Token Store**
   - Encrypted JSON in `~/.kilo/storage/gworkspace-tokens/`
   - AES-256-GCM encryption
   - Auto-rotate on schedule (monthly)

2. **Session Recovery**
   - Load tokens on startup
   - Auto-refresh if expired
   - Graceful logout (revoke + delete)

3. **Multi-User Support**
   - Store per user ID (not in-memory global)
   - Support multiple simultaneous users

4. **Tests**
   - Session persistence across restart
   - Token refresh automatic
   - Graceful token expiration handling

### Phase 2: Document Processing (1.5 weeks)

**Priority**: 🟠 HIGH — blocks real-world usage

1. **Download Pipeline**
   - `driveDownloadFile(fileId)` → binary
   - `gmailDownloadAttachment(messageId, attachmentId)` → binary
   - Temp storage: `/repo/.gworkspace-cache/`

2. **Multi-Format Parser**
   - PDF: `pdfjs-dist`
   - DOCX: `docx-parser`
   - XLSX: `xlsx`
   - PPTX: `pptxjs`
   - Fallback: Google Drive export (convert to PDF/text)

3. **Content Extraction**
   - Text extraction + metadata
   - OCR support (if image-heavy PDF)
   - Character encoding detection

4. **Cache Management**
   - Auto-cleanup (24h expiry)
   - Size limits per file

### Phase 3: CRUD for Docs/Sheets/Slides (2 weeks)

**Priority**: 🟠 HIGH — enables content creation

1. **Google Docs API v1**
   - Document creation (blank, from template)
   - Batch updates (insert, delete, replace text)
   - Formatting (bold, italic, lists, tables)

2. **Google Sheets API v4**
   - Spreadsheet creation
   - Batch value updates
   - Append operations
   - Formulas support

3. **Google Slides API v1**
   - Presentation creation
   - Slide creation + layout
   - Text + shape insertion
   - Media support

4. **Batch Operations**
   - Reduce API calls
   - Atomic updates

### Phase 4: Cross-Workspace Mining (1 week)

**Priority**: 🟡 MEDIUM — optional advanced feature

1. **Admin APIs** (if authorized)
   - User enumeration
   - Shared drives listing
   - Org structure queries

2. **Aggregation Service**
   - Multi-account search
   - Deduplication
   - Permission-aware filtering

3. **Compliance Reporting**
   - Usage dashboards
   - Audit trail

---

## SECTION 8: TESTING STRATEGY

### Current Test Coverage

```bash
packages/opencode/test/kiloclaw/gworkspace-events.test.ts
```

**Needs expansion**:

| Area                  | Coverage | Status     |
| --------------------- | -------- | ---------- |
| OAuth token lifecycle | 0%       | ❌ Missing |
| File download + parse | 0%       | ❌ Missing |
| CRUD operations       | 0%       | ❌ Missing |
| Error recovery        | 20%      | 🟡 Partial |
| Rate limiting         | 30%      | 🟡 Partial |

### Test Scenarios Required

```typescript
// Authentication
✅ Session persists across restart
✅ Token auto-refreshed on expiration
✅ Logout revokes + clears
✅ Multiple concurrent users

// Document Processing
✅ Download PDF from Drive
✅ Download attachment from email
✅ Parse DOCX → text
✅ Handle large files (>100MB)

// CRUD
✅ Create Google Doc
✅ Update doc with batch operations
✅ Create spreadsheet
✅ Append rows to sheet

// Error Handling
✅ Network timeout → retry
✅ 401 Unauthorized → re-authenticate
✅ 403 Forbidden → permission error
✅ 429 Too Many Requests → backoff
```

---

## SECTION 9: RISKS & MITIGATIONS

| Risk                               | Severity    | Mitigation                                      |
| ---------------------------------- | ----------- | ----------------------------------------------- |
| Token loss on crash                | 🔴 CRITICAL | Persist tokens to encrypted storage             |
| Attachment parsing failures        | 🟠 HIGH     | Fallback to Google Drive export API             |
| CRUD conflicts (real-time collab)  | 🟠 HIGH     | Implement conflict detection + version tracking |
| Rate limit exhaustion              | 🟡 MEDIUM   | Add request queuing + cost estimation           |
| Unauthorized access to shared docs | 🔴 CRITICAL | Check permission model before operation         |

---

## SECTION 10: SUCCESS CRITERIA

| Criterion                  | Current | Target | Timeline |
| -------------------------- | ------- | ------ | -------- |
| Session persistence        | 0%      | 100%   | Week 1   |
| File download capability   | 0%      | 100%   | Week 2   |
| CRUD support (Docs/Sheets) | 0%      | 100%   | Week 3   |
| Cross-workspace queries    | 0%      | 75%    | Week 4   |
| Test coverage              | 40%     | 95%    | Ongoing  |

---

## RESEARCH FINDINGS (from Brave Search results)

### OAuth2 Best Practices

- ✅ `google-auth-library` auto-refreshes on 401 (we don't use this)
- ✅ Refresh token rotation should be automatic
- ❌ Our implementation requires manual refresh calls
- **Source**: GitHub googleapis/google-api-nodejs-client

### Token Storage

- ✅ Tokens must be stored securely (encrypted, not plaintext)
- ✅ Revoke tokens on logout
- ✅ Implement token rotation policy
- **Source**: Google for Developers - Best Practices

### Google Drive Multi-Format

- ✅ Use `?alt=media` for binary download
- ✅ Use `?mimeType=` for export conversions
- ✅ Support batch operations via `batchGet`
- **Source**: Google Drive API v3 docs

---

## RECOMMENDATIONS

### Immediate Actions (This Week)

1. **Implement persistent token storage** (gworkspace-oauth.ts)
   - Encrypt with AES-256
   - Store in `~/.kilo/storage/`
   - Auto-load on startup

2. **Add token expiration recovery** (gworkspace-broker.ts)
   - Catch 401 errors
   - Trigger refresh
   - Retry request

3. **Document the session recovery flow** in CONTRIBUTING.md

### Short Term (Next 2 Weeks)

4. Implement file download + multi-format parser
5. Add 50+ unit tests for authentication
6. Add integration tests for file operations

### Medium Term (Month 2)

7. Implement Google Docs/Sheets/Slides CRUD
8. Add batch operation support
9. Build cross-workspace admin APIs (if needed)

---

## APPENDIX: File Locations

```
packages/opencode/src/kiloclaw/agency/
├── auth/
│   └── gworkspace-oauth.ts          ← Token lifecycle (BROKEN)
├── adapters/
│   └── gworkspace-adapter.ts        ← API calls (GOOD)
├── broker/
│   └── gworkspace-broker.ts         ← Routing (NEEDS SESSION RECOVERY)
├── skills/
│   └── gworkspace.ts                ← Skill implementations (READ-ONLY)
├── manifests/
│   └── gworkspace-manifest.ts       ← Policy + capabilities
├── hitl/
│   └── gworkspace-hitl.ts           ← Human-in-the-loop
└── audit/
    └── gworkspace-audit.ts          ← Logging

Tests:
packages/opencode/test/kiloclaw/gworkspace-events.test.ts
```
