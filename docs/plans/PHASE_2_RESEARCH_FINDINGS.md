# Phase 2: Research & Best Practices - Google Workspace Agency
**Date**: 2026-04-14  
**Status**: In Progress  
**Duration**: Estimated 4-6 hours

This document tracks research findings for 6 critical areas identified in Phase 1 audit.

---

## R1: OAuth2 Token Persistence & Rotation

### Research Topics
- [ ] Production token storage patterns (DB vs vault vs encrypted file)
- [ ] Token rotation best practices
- [ ] Multi-user token isolation
- [ ] Session recovery strategies
- [ ] Credential security standards

### Key Questions to Answer
1. Should we store tokens in database, Redis, encrypted filesystem, or cloud vault?
2. How often should refresh tokens be rotated?
3. What encryption standards are recommended for token-at-rest?
4. How do we recover sessions after token loss?
5. How to prevent token leakage in logs/memory dumps?

### Findings

**CRITICAL: In-Memory Storage is UNSAFE for Production**

1. **Server-Side Token Encryption** (RECOMMENDED)
   - Encrypt tokens at rest using AES-256 encryption standard
   - Store in secure database with restricted access (no DBAs, no devs)
   - Encryption keys must NOT be in source control, stored separately
   - Source: [Token Storage - Auth0 Docs](https://auth0.com/docs/secure/security-guidance/data-security/token-storage)

2. **Token Rotation (CRITICAL SECURITY)**
   - Each refresh must generate NEW refresh token and invalidate old one
   - Only ONE valid refresh token per client at any time
   - If old refresh token is presented → indicates compromise → revoke entire token family
   - Source: [Refresh Token Security - Obsidian Security](https://www.obsidiansecurity.com/blog/refresh-token-security-best-practices)

3. **Encryption Standards**
   - Use AES encryption, NOT just hashing
   - Separate encryption keys from database
   - Rotate encryption keys periodically
   - Source: [RFC 9700 - Best Current Practice for OAuth 2.0 Security](https://datatracker.ietf.org/doc/rfc9700/)

4. **Multi-User Token Management**
   - Current `tokenCache.get(userId)` is insufficient for production
   - Need isolated token store per user + workspace
   - Token loss during restart should trigger graceful re-auth

### Recommended Pattern

**Server-Side Encrypted Storage Pattern** (Most Secure):
```
User OAuth → exchange code → encrypt token(AES-256) → store in DB
on token use → decrypt + check expiry → auto-refresh if needed
on refresh → new token → invalidate old → store both encrypted
on logout → revoke token + delete from DB
on server restart → tokens persist in DB, no re-auth needed
```

**Complexity**: Medium (need crypto lib + DB)  
**Security**: High  
**Production-Ready**: Yes

---

## R2: Google Document Download & Export

### Research Topics
- [ ] Google Drive Files.export() API capabilities
- [ ] Export formats per document type (Docs → PDF/DOCX, Sheets → XLSX/CSV, Slides → PDF/PPTX)
- [ ] Parsing libraries (pdfjs, csv-parser, xlsx)
- [ ] Batch download strategies
- [ ] Temp file management + cleanup
- [ ] Rate limiting for large downloads

### Key Questions to Answer
1. What export mimeTypes are available for each Google document type?
2. Can we export directly or do we need to download + parse?
3. What parsing libraries work best for multi-format input?
4. How to handle large files (>100MB)?
5. Should temp files be in memory, disk, or repo?

### Findings

**Google Drive Files.export() API (NATIVE SUPPORT)**

1. **Export MIME Types Available** (Official API)
   - Docs → PDF, DOCX, RTF, EPUB, ODT, ZIP
   - Sheets → XLSX, ODS, CSV, XLSX (with formulas)
   - Slides → PDF, PPTX, ODT
   - Source: [Files.export API Reference](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export)

2. **API Usage Pattern**
   ```
   GET /drive/v3/files/{fileId}/export?mimeType={mimeType}
   Authorization: Bearer {accessToken}
   Response: Binary file content (up to 10MB limit)
   ```
   - Source: [Download and export files - Google Drive API Guide](https://developers.google.com/workspace/drive/api/guides/manage-downloads)

3. **Size Limitations**
   - Export limited to 10MB per file
   - For larger files: may need to export in chunks or use Google Takeout
   - Source: [Files.export Method](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/export)

4. **Parsing Libraries (TypeScript/Node.js)**
   - **PDF**: `pdfjs-dist`, `pdf-parse` for text extraction
   - **XLSX**: `xlsx` library (most popular)
   - **CSV**: Built-in CSV parsing, `papaparse`
   - **DOCX**: `unzipper` (DOCX is ZIP) + `xml2js`
   - Source: [GitHub - google-drive-export tool](https://github.com/ericwastaken/google-drive-export)

5. **Temp File Management**
   - Store in `/tmp` with automatic cleanup
   - Use Node.js `os.tmpdir()` + unique file names (UUID)
   - OR stream directly to memory buffer (recommended for <10MB)
   - Source: [PDF Template Engine example - Medium](https://cgarethc.medium.com/using-google-docs-and-drive-as-a-pdf-template-engine-with-node-js-on-google-cloud-functions-b2ab9155e308)

### Recommended Implementation

**Native Export + Stream Pattern**:
```typescript
// No temp files needed - stream directly
const buffer = await fetch(`${googleAPI}/files/${id}/export?mimeType=application/pdf`, {
  headers: { Authorization: `Bearer ${token}` }
}).then(r => r.arrayBuffer())

// Parse in memory
const text = await extractPdfText(buffer) // <10MB fits in memory
```

**Benefits**:
- No disk I/O
- No cleanup logic
- Works with serverless (Cloud Functions, Lambda)
- Ideal for <10MB files

**Complexity**: Low (just wrapper around export API)  
**Security**: High (no temp files exposed)  
**Performance**: Good (stream directly to parser)

---

## R3: CRUD Operations for Docs/Sheets/Slides

### Research Topics
- [ ] Google Docs API document creation + batchUpdate
- [ ] Google Sheets API values.append() vs values.update() patterns
- [ ] Google Slides API slide creation + content insertion
- [ ] Batch operation limits (max requests, max size)
- [ ] Revision history + conflict resolution
- [ ] Real-time collaboration implications

### Key Questions to Answer
1. What's the maximum batch size for Docs batchUpdate?
2. Can we append to Sheets without knowing the exact range?
3. What's the rate limit for CRUD operations vs read?
4. How does collaborative editing interact with our writes?
5. Can we detect + merge conflicting updates?

### Findings

**Google Docs API batchUpdate (ATOMIC OPERATIONS)**

1. **Document Creation + Content Flow**
   - Step 1: Call `documents.create()` → returns `documentId`
   - Step 2: Call `documents.batchUpdate(documentId)` → insert content
   - NO direct parameter to create + populate in one call
   - Source: [documents.batchUpdate Reference](https://developers.google.com/workspace/docs/api/reference/rest/v1/documents/batchUpdate)

2. **Atomic Execution (Important!)**
   - All requests in a batchUpdate are validated first
   - If ANY request is invalid → ENTIRE batch fails, nothing applied
   - Guarantees atomicity (all-or-nothing semantics)
   - Source: [Docs API Examples](https://www.mikesallese.me/blog/google-docs-api-examples/)

3. **Operational Transform Model**
   - Google Docs use OT (not CRDT like Google Sheets)
   - Cannot directly "update" a document
   - Must express changes as INSERT/DELETE operations on text ranges
   - Positions specified in UTF-16 code units (important for emoji/special chars)
   - Source: [Insert, delete, move text - Google Docs API](https://developers.google.com/workspace/docs/api/how-tos/move-text)

4. **Batch Request Best Practice**
   - Combine multiple operations into single batchUpdate call
   - Reduces API call overhead
   - More efficient than sequential calls
   - BUT: watch total request size (Google has limits)
   - Source: [Google Docs API How-Tos](https://developers.google.com/workspace/docs/api/how-tos/merge)

5. **Sheets API (Different Pattern)**
   - Sheets use `values.append()` (simpler than Docs)
   - Can append without knowing exact row
   - Also supports `values.update()` for range replacement
   - Supports batch updates: `values.batchUpdate()`
   - Source: Inferred from Google Sheets API (similar Google service)

### API Coverage Roadmap

**Currently Implemented** (from Phase 1 audit):
- ✅ Docs: read (docsGetDocument)
- ✅ Sheets: read (sheetsGetSpreadsheet)

**MUST Implement** (Priority 1):
- ❌ Docs: create (documents.create)
- ❌ Docs: update (documents.batchUpdate with InsertTextRequest)
- ❌ Sheets: append (values.append)
- ❌ Sheets: update (values.update)
- ❌ Slides: read (presentations.get)
- ❌ Slides: create (presentations.create)

**Implementation Pattern**:
```typescript
// Docs: Create + populate
const doc = await adapter.docsCreate(accessToken, { title: "My Doc" })
await adapter.docsBatchUpdate(accessToken, doc.documentId, [
  { insertText: { text: "Hello", location: { index: 1 } } }
])

// Sheets: Append row
await adapter.sheetsAppend(accessToken, spreadsheetId, "Sheet1!A:Z", [
  ["cell1", "cell2", "cell3"]
])
```

**Complexity**: Medium (new adapter methods needed)  
**API Quota Impact**: HIGH (each batchUpdate counts as 1 call but may contain 100+ operations)  
**Atomic Guarantee**: YES (all-or-nothing)

---

## R4: Rate Limiting & Exponential Backoff

### Research Topics
- [ ] Google Workspace per-service rate limits (Gmail, Calendar, Drive, Docs, Sheets)
- [ ] Quota API for monitoring usage
- [ ] Retry-After header parsing + usage
- [ ] Exponential backoff algorithms (jitter, max wait)
- [ ] Circuit breaker implementation
- [ ] Detecting quota exhaustion vs rate limit

### Key Questions to Answer
1. What are the exact QPS limits for each service?
2. Does Google use Retry-After header or custom headers?
3. Should backoff be per-operation or per-user?
4. How to differentiate "rate limit" (429) vs "quota exceeded"?
5. What's the right circuit breaker threshold?

### Findings

**Google Workspace API Rate Limits (Per-Service)**

1. **Gmail API Limits**
   - Per-project limit: 250 requests per second (general)
   - Per-user limit: Varies by workspace admin quota settings
   - Batch operations: 1 batch = 1 API call (can contain 100+ individual operations in batchUpdate)
   - Source: [Gmail API Quota Reference](https://developers.google.com/workspace/gmail/api/reference/quota)

2. **Google Docs API Limits**
   - Per-project: Not explicitly stated, but implied to be same as other Google services
   - batchUpdate calls: Each call counts as 1 API call regardless of operation count
   - Document size: Soft limit ~20MB, hard limit varies
   - Source: [Docs API Usage Limits](https://developers.google.com/workspace/docs/api/limits)

3. **Google Sheets API Limits**
   - 500 requests per 100 seconds per user
   - batchUpdate: 1 call = 1 API call (can contain hundreds of operations)
   - Largest Sheets: 10 million cells per sheet
   - Source: [Google Workspace Events API Limits](https://developers.google.com/workspace/events/guides/limits)

4. **Error Response**
   - **429: Too Many Requests** → rate limited
   - **403: Forbidden** → quota exceeded or permission denied
   - Google may include `Retry-After` header with seconds to wait
   - Source: [API usage limits - Admin console](https://developers.google.com/workspace/admin/groups-settings/limits)

5. **Quota vs Rate Limit Difference**
   - **Rate Limit**: Requests per second (429 Too Many Requests)
   - **Quota**: Total daily/monthly allocation (403 Forbidden)
   - Both are enforced separately

### Recommended Backoff Strategy

**Truncated Exponential Backoff with Jitter**:
```typescript
function calculateBackoff(attempt: number, baseMs = 500, maxMs = 32000) {
  const exponential = Math.min(baseMs * Math.pow(2, attempt), maxMs)
  const jitter = exponential * (0.1 + Math.random() * 0.1) // 10-20% jitter
  return exponential + jitter
}

// Apply max 5 retries with backoff
for (let attempt = 0; attempt < maxRetries; attempt++) {
  try {
    return await googleApiCall()
  } catch (err) {
    if (err.status === 429) {
      const retryAfter = parseInt(err.headers['retry-after'] || '0') * 1000
      const backoff = Math.max(retryAfter, calculateBackoff(attempt))
      await sleep(backoff)
    } else {
      throw err
    }
  }
}
```

**Key Points**:
- Check `Retry-After` header first (explicit guidance from Google)
- Use exponential backoff as fallback
- Max 5 retries (most transient errors resolve within 2-3 attempts)
- Jitter prevents thundering herd (all clients retrying at same time)
- Source: [Retry strategy - Cloud Storage](https://docs.cloud.google.com/storage/docs/retry-strategy)

**Complexity**: Low (already implemented in gworkspace-adapter.ts, just needs Retry-After header parsing)  
**Effectiveness**: High (prevents cascading failures)  
**Production-Ready**: YES (this is standard Google Cloud pattern)

---

## R5: Error Recovery & Resilience

### Research Topics
- [ ] Google API error codes classification (transient vs permanent)
- [ ] Timeout strategies per operation type
- [ ] Idempotent request handling
- [ ] Graceful degradation (fallback to read-only, MCP, cached data)
- [ ] Circuit breaker patterns
- [ ] Observability + alerting for failures

### Key Questions to Answer
1. Which error codes are safe to retry? (e.g., 500, 503, 429 vs 403, 404)
2. What's the right timeout for document operations? (read: 30s, write: 60s?)
3. Are Google's APIs idempotent? (can we safely retry writes?)
4. When should we fall back to MCP?
5. How to detect cascading failures?

### Findings

**Transient vs Permanent Errors (Google APIs)**

1. **RETRYABLE Errors (Transient)**
   - **408**: Request Timeout
   - **429**: Too Many Requests (rate limited)
   - **500**: Internal Server Error
   - **502**: Bad Gateway
   - **503**: Service Unavailable
   - **504**: Gateway Timeout
   - Source: [Retry strategy - Vertex AI](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/retry-strategy)

2. **NON-RETRYABLE Errors (Permanent)**
   - **400**: Bad Request (invalid syntax)
   - **401**: Unauthorized (bad/expired token)
   - **403**: Forbidden (permission denied or quota exceeded)
   - **404**: Not Found (resource doesn't exist)
   - **405**: Method Not Allowed
   - Source: [API Retry Mechanism - BoldSign Blog](https://boldsign.com/blogs/api-retry-mechanism-how-it-works-best-practices/)

3. **Idempotency Requirements**
   - **Idempotent operations**: Safe to retry (GET, HEAD, PUT with same data)
   - **Non-idempotent operations**: NOT safe to retry (POST, DELETE, PATCH that mutate state)
   - Google Docs `batchUpdate`: Non-idempotent (each call modifies document)
   - Gmail `messages.send`: Non-idempotent (each call sends email)
   - Sheets `values.append`: Append position changes (non-idempotent)
   - Source: [API Retry Mechanism Best Practices](https://boldsign.com/blogs/api-retry-mechanism-how-it-works-best-practices/)

4. **Retry Strategy Constraints**
   - Max attempts: 4-5 (most transient issues resolve within 2-3 attempts)
   - Max backoff: 60-120 seconds (avoid cascading failures)
   - Max total time: 2-5 minutes (don't hang forever)
   - Only retry on 408, 429, 5xx
   - Source: [Cloud Storage Retry Strategy](https://docs.cloud.google.com/storage/docs/retry-strategy)

### Error Recovery Roadmap

**Classification Map** (for our broker):
```typescript
const ErrorClassification = {
  // Transient - safe to retry
  408: { type: 'TRANSIENT', action: 'RETRY', maxAttempts: 5 },
  429: { type: 'TRANSIENT', action: 'RETRY_WITH_BACKOFF', maxAttempts: 5 },
  500: { type: 'TRANSIENT', action: 'RETRY', maxAttempts: 3 },
  502: { type: 'TRANSIENT', action: 'RETRY', maxAttempts: 3 },
  503: { type: 'TRANSIENT', action: 'RETRY', maxAttempts: 5 },
  504: { type: 'TRANSIENT', action: 'RETRY', maxAttempts: 3 },

  // Permanent - do NOT retry
  400: { type: 'PERMANENT', action: 'FAIL_IMMEDIATELY', cause: 'INVALID_REQUEST' },
  401: { type: 'PERMANENT', action: 'REAUTH_REQUIRED', cause: 'TOKEN_EXPIRED' },
  403: { type: 'PERMANENT', action: 'FAIL_OR_HITL', cause: 'PERMISSION_DENIED' },
  404: { type: 'PERMANENT', action: 'FAIL_IMMEDIATELY', cause: 'NOT_FOUND' },
  409: { type: 'PERMANENT', action: 'FAIL_OR_FALLBACK', cause: 'CONFLICT' }, // Docs/Sheets versioning
}
```

**Implementation for Broker**:
1. Check if error is retryable (408, 429, 5xx only)
2. If retryable: attempt exponential backoff + retry
3. If NOT retryable: check if write operation
   - Write ops: Log + suggest HITL/audit review
   - Read ops: Fail with clear error message
4. Circuit breaker: After 5 consecutive 503s, open circuit for 1 minute

**Complexity**: Medium (classification logic + state tracking)  
**Effectiveness**: High (prevents cascading failures, improves resilience)  
**Production-Ready**: YES (this is Google Cloud standard pattern)

---

## R6: Open-Source Reference Implementations

### Research Topics
- [ ] LangChain Google Workspace agent integration
- [ ] AutoGPT Gmail/Drive integration
- [ ] Open-source Node.js Google API wrappers
- [ ] TypeScript Google Workspace client libraries
- [ ] Agent patterns for CRUD operations
- [ ] Error handling + resilience patterns in production

### Key Questions to Answer
1. How do LangChain agents structure Google Workspace integration?
2. Are there existing CRUD implementations we can reference?
3. What patterns do production systems use?
4. How do they handle authentication + token management?
5. Are there TypeScript libraries that save us re-implementing basics?

### Findings

**LangChain + Google Workspace Integration (Reference Patterns)**

1. **LangChain Gmail Tools (Native)**
   - Official LangChain tools for Gmail in TypeScript
   - Accepts `accessToken` via OAuth2 token exchange
   - Handles token expiry + validation within tool layer
   - Supports: create, view, send messages
   - Source: [Gmail integration - LangChain Docs](https://docs.langchain.com/oss/javascript/integrations/tools/google_gmail)

2. **Composio MCP Approach (Most Comprehensive)**
   - 500+ apps integrated via Model Context Protocol
   - Google Super agent includes: Gmail, Drive, Sheets, Calendar, Docs
   - Pattern: Tool Router + LangChain Agent
   - Natural language commands translate to structured API calls
   - Source: [Composio LangChain Integration](https://composio.dev/toolkits/composio/framework/langchain)

3. **LangChain Google Drive MCP**
   - Google Drive operations via MCP protocol
   - Supports: create folder, share file, add comment
   - Pattern: Stream response back to user
   - Source: [Google Drive MCP Integration - Composio](https://composio.dev/toolkits/googledrive/framework/langchain)

4. **Open-Source Reference Implementations**
   - GitHub: `google-drive-export` tool (Docs/Sheets/Slides export, batch operations)
   - GitHub: `google-drive-api-doc-to-pdf-nodejs` (PDF conversion example)
   - Medium: PDF template engine (Google Docs as document generation)
   - Source: [google-drive-export GitHub](https://github.com/ericwastaken/google-drive-export)

5. **Key Patterns Observed**
   - Separation of concerns: Auth layer → API adapter → Skills layer
   - Broker pattern for native vs fallback providers (we already have this!)
   - Token management abstracted from business logic
   - Structured error classification (transient vs permanent)

### Reusable Patterns We Can Adopt

1. **Composio's Tool Router Pattern** (Applicable to our broker)
   ```
   Natural Language → Intent Classification → Skill Selection → Broker Routing
   (This is what we're building with Kiloclaw!)
   ```

2. **Atomic CRUD Operations**
   - Batch operations in single API call (reduce overhead)
   - All-or-nothing semantics (good for consistency)
   - Example: Docs batchUpdate, Sheets batchUpdate

3. **Token Management Abstraction**
   - Credentials object that can be string or function
   - Function allows lazy token refresh on each call
   - Cleaner than manual refresh management
   - We should adapt this pattern

4. **Export First, Parse Second Pattern**
   - Get file → Export to standard format → Parse locally
   - Offload parsing to client (reduces server load)
   - Works well for <10MB files

**Complexity Score Analysis**:
- LangChain Gmail: Low complexity (already built)
- Composio MCP: Medium complexity (requires MCP server)
- Our broker pattern: Medium complexity (good fit for our architecture)

**Production Readiness**:
- LangChain: ✅ Yes (used in production)
- Composio: ✅ Yes (enterprise customers)
- Our pattern: ✅ Should be (matches industry standard)

---

## Research Method

### Tools & Sources
- **WebSearch**: Current Google API documentation, blog posts, GitHub discussions
- **GitHub**: Reference implementations (LangChain, AutoGPT, node-google-api, etc.)
- **Stack Overflow**: Common patterns, error handling, debugging
- **Google Cloud Documentation**: Official API reference, quotas, limits
- **Enterprise Software**: Best practices from production systems

### Validation
For each finding:
- ✅ Verify against official Google documentation
- ✅ Check implementation date (ensure 2025-2026 patterns)
- ✅ Evaluate trade-offs (complexity vs security vs performance)
- ✅ Identify gaps in the pattern
- ✅ Cross-reference with 2+ sources

---

## Status Tracker

| Research Area | Status | Priority | ETA |
|---------------|--------|----------|-----|
| R1: Token Storage | 🔄 Starting | CRITICAL | ~1h |
| R2: Document Export | 🔄 Starting | CRITICAL | ~1.5h |
| R3: CRUD Operations | 🔄 Starting | CRITICAL | ~1.5h |
| R4: Rate Limiting | 🔄 Starting | HIGH | ~1h |
| R5: Error Recovery | 🔄 Starting | HIGH | ~1h |
| R6: Reference Impl | 🔄 Starting | MEDIUM | ~1h |

**Total Estimated Duration**: 6-7 hours

---

## Key Metrics to Track

For each research area, we need:
- **Complexity Score** (1-5): Implementation difficulty
- **Security Score** (1-5): Security impact if done wrong
- **Performance Impact** (low/medium/high): Latency/throughput implications
- **Risk Level** (low/medium/high): Adoption risk in production
- **Recommendation Strength** (strong/moderate/conditional): Confidence in recommendation

---

## Notes

- All findings should include specific code examples or links to production implementations
- Trade-offs should be clearly documented (don't just recommend the "best" option)
- Focus on 2026 patterns, not legacy approaches
- Identify gaps in research (things we can't find good examples for)
- Prepare list of follow-up questions for Phase 3 design
