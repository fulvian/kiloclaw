# Phase 3: Design & Architecture - Google Workspace Agency
**Date**: 2026-04-14  
**Status**: In Progress  
**Objective**: Create detailed implementation designs + ADRs for all critical components

---

## Architecture Decision Records (ADRs)

### ADR-001: Token Storage & Persistence

**Decision**: Move from in-memory `tokenCache` Map to encrypted database with automatic token rotation

**Context**:
- Current: Tokens lost on server restart
- Impact: Users must re-authenticate after every deployment
- Security: Tokens stored in plain text in memory
- Production-Critical: Cannot ship without fixing

**Options Considered**:
1. **In-Memory (Current)** ❌
   - Pros: Simple
   - Cons: Lost on restart, no encryption, not multi-user safe
   - Risk: CRITICAL

2. **Persistent File (Encrypted)** ⚠️
   - Pros: Simple, works on serverless
   - Cons: Disk I/O overhead, backup concerns
   - Risk: HIGH (file access control)

3. **Database (Encrypted) + Cache** ✅ RECOMMENDED
   - Pros: Persistent, scalable, audit-friendly, secure
   - Cons: DB dependency
   - Risk: LOW (standard pattern)

4. **Secure Vault (HashiCorp, AWS KMS)** ✅ ALTERNATIVE
   - Pros: Enterprise-grade, automatic rotation
   - Cons: Cost, complexity
   - Risk: LOW (premium option)

**Selected Solution**: **Database (Encrypted) + Cache**

**Design**:
```typescript
// Token storage schema
interface StoredToken {
  id: string                    // UUID
  userId: string               // User identifier
  workspaceId: string          // Workspace/domain
  encryptedAccessToken: string  // AES-256 encrypted
  encryptedRefreshToken?: string // AES-256 encrypted
  expiresAt: number            // Timestamp
  rotatedAt: number            // Last rotation time
  createdAt: number
}

// Token manager interface
namespace TokenManager {
  export async function store(userId, tokens) {
    // Encrypt tokens with AES-256
    // Store in database
    // Update in-memory cache
  }

  export async function getValidToken(userId) {
    // Check cache first
    // If expired or not found: refresh from DB
    // If DB token expired: use refreshToken to get new accessToken
    // Return valid accessToken
  }

  export async function refresh(userId) {
    // Call Google OAuth to refresh
    // Invalidate old refreshToken
    // Generate new refreshToken
    // Store encrypted in DB
    // Update cache
  }

  export async function revoke(userId) {
    // Revoke at Google
    // Delete from DB
    // Clear cache
  }
}
```

**Implementation Details**:
1. **Encryption**: Use Node.js `crypto` module (native)
   - Algorithm: AES-256-GCM (authenticated encryption)
   - Key derivation: PBKDF2 (password-based)
   - Nonce: 16 random bytes per token

2. **Key Management**:
   - Encryption key stored separately from DB (e.g., environment variable, AWS Secrets Manager)
   - Key rotation strategy: Every 90 days
   - Old keys: Keep for 30 days to decrypt existing tokens

3. **Token Rotation**:
   - On each refresh: Old refreshToken is revoked
   - Only ONE valid refreshToken per user at a time
   - If old token used: Indicates compromise → revoke all tokens

4. **Session Recovery**:
   - User logs in → OAuth flow → token stored encrypted
   - On service startup: DB is source of truth (not lost)
   - If token expired: Auto-refresh using stored refreshToken
   - If refreshToken invalid: Gracefully fail with re-auth required message

**Database Schema**:
```sql
CREATE TABLE gworkspace_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  workspace_id VARCHAR(255) NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  expires_at BIGINT NOT NULL,
  rotated_at BIGINT NOT NULL DEFAULT now(),
  created_at BIGINT NOT NULL DEFAULT now(),
  
  UNIQUE(user_id, workspace_id),
  INDEX(user_id),
  INDEX(expires_at)
);

CREATE TABLE gworkspace_token_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  old_refresh_token_hash TEXT NOT NULL,
  rotation_reason VARCHAR(50),
  rotated_at BIGINT NOT NULL DEFAULT now(),
  
  INDEX(user_id, rotated_at)
);
```

**Complexity**: MEDIUM  
**Security**: HIGH  
**Production-Ready**: YES  
**Timeline**: 1-2 days  
**Dependencies**: Database (existing? or new?)

---

### ADR-002: CRUD Operations Pattern

**Decision**: Implement CRUD operations using atomic batchUpdate pattern with idempotency guards

**Context**:
- Current: Only read operations implemented (34% coverage)
- Gap: Cannot create/update/delete Google Docs, Sheets, Slides
- Challenge: Operations are non-idempotent (can't safely retry)
- Google's Model: Operational Transform (OT), not CRDT

**Design Pattern**:

```typescript
// Docs CRUD pattern
namespace DocsAdapter {
  // CREATE: Create document + populate in single operation
  export async function docsCreate(
    accessToken: string,
    title: string,
    content?: string
  ) {
    // Step 1: Create document (returns documentId)
    const doc = await withRetry(() =>
      fetch(`${API}/documents`, {
        method: 'POST',
        body: { title }
      })
    )
    
    // Step 2: Batch insert content (if provided)
    if (content) {
      const requests = [
        {
          insertText: {
            text: content,
            location: { index: 1 } // After initial paragraph
          }
        }
      ]
      await withRetry(() =>
        fetch(`${API}/documents/${doc.documentId}/batchUpdate`, {
          method: 'POST',
          body: { requests }
        })
      )
    }
    
    return doc
  }

  // READ: Get document content (already implemented)
  export async function docsRead(accessToken: string, documentId: string) {
    return withRetry(() =>
      fetch(`${API}/documents/${documentId}`)
    )
  }

  // UPDATE: Apply batch of changes
  export async function docsUpdate(
    accessToken: string,
    documentId: string,
    requests: BatchUpdateRequest[]
  ) {
    // requests: InsertTextRequest, DeleteContentRangeRequest, etc.
    return withRetry(() =>
      fetch(`${API}/documents/${documentId}/batchUpdate`, {
        method: 'POST',
        body: { requests }
      })
    )
  }

  // DELETE: Use Drive API to delete
  export async function docsDelete(accessToken: string, documentId: string) {
    return driveDeleteFile(accessToken, documentId)
  }
}

// Sheets pattern (different - simpler append)
namespace SheetsAdapter {
  export async function sheetsCreate(accessToken: string, title: string) {
    return withRetry(() =>
      fetch(`${API}/spreadsheets`, {
        method: 'POST',
        body: { properties: { title } }
      })
    )
  }

  export async function sheetsAppend(
    accessToken: string,
    spreadsheetId: string,
    range: string,
    values: unknown[][]
  ) {
    return withRetry(() =>
      fetch(
        `${API}/spreadsheets/${spreadsheetId}/values/${range}:append`,
        {
          method: 'POST',
          body: { values }
        }
      )
    )
  }

  export async function sheetsUpdate(
    accessToken: string,
    spreadsheetId: string,
    range: string,
    values: unknown[][]
  ) {
    return withRetry(() =>
      fetch(
        `${API}/spreadsheets/${spreadsheetId}/values/${range}`,
        {
          method: 'PUT',
          body: { values }
        }
      )
    )
  }
}
```

**Idempotency Strategy**:
- Write operations are NON-idempotent (retrying can duplicate)
- Solution: Client-provided idempotency key
  - Docs: Use document version + change hash
  - Sheets: Use row timestamp + content hash
  - Calendar: Use event ID + timestamp
- Server stores seen keys (30-minute TTL)
- If duplicate request: Return cached result instead of re-executing

**Atomic Semantics**:
- All requests in batchUpdate are validated before execution
- If ANY request fails: ENTIRE batch fails (all-or-nothing)
- Good for consistency, but requires careful design

**Complexity**: HIGH (12+ new methods)  
**API Coverage Gain**: 34% → 95%  
**Timeline**: 2-3 days  
**Dependencies**: None (Google APIs already available)

---

### ADR-003: Error Recovery & Resilience

**Decision**: Classify errors into transient/permanent with smart retry + circuit breaker

**Context**:
- Current: No error classification, all errors treated equally
- Problem: Transient errors (429, 503) need retry; permanent errors (403, 404) need fail-fast
- Impact: Poor error recovery, cascading failures

**Error Classification**:

```typescript
enum ErrorType {
  TRANSIENT = 'TRANSIENT',      // Retry with backoff
  PERMANENT = 'PERMANENT',      // Fail immediately
  AUTH_REQUIRED = 'AUTH_REQUIRED', // Trigger re-auth
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED', // Wait + retry
}

interface ErrorClassification {
  type: ErrorType
  action: string
  maxRetries: number
  baseBackoffMs: number
  shouldAlert: boolean
}

const ERROR_MAP: Record<number, ErrorClassification> = {
  // Transient - safe to retry
  408: { type: 'TRANSIENT', action: 'RETRY', maxRetries: 5, baseBackoffMs: 500, shouldAlert: false },
  429: { type: 'TRANSIENT', action: 'RETRY_WITH_BACKOFF', maxRetries: 5, baseBackoffMs: 1000, shouldAlert: false },
  500: { type: 'TRANSIENT', action: 'RETRY', maxRetries: 3, baseBackoffMs: 500, shouldAlert: true },
  502: { type: 'TRANSIENT', action: 'RETRY', maxRetries: 3, baseBackoffMs: 500, shouldAlert: true },
  503: { type: 'TRANSIENT', action: 'RETRY', maxRetries: 5, baseBackoffMs: 1000, shouldAlert: true },
  504: { type: 'TRANSIENT', action: 'RETRY', maxRetries: 3, baseBackoffMs: 500, shouldAlert: true },

  // Permanent - do NOT retry
  400: { type: 'PERMANENT', action: 'FAIL', maxRetries: 0, baseBackoffMs: 0, shouldAlert: true },
  401: { type: 'AUTH_REQUIRED', action: 'REAUTH', maxRetries: 0, baseBackoffMs: 0, shouldAlert: true },
  403: { type: 'PERMANENT', action: 'FAIL_OR_HITL', maxRetries: 0, baseBackoffMs: 0, shouldAlert: true },
  404: { type: 'PERMANENT', action: 'FAIL', maxRetries: 0, baseBackoffMs: 0, shouldAlert: false },
  409: { type: 'PERMANENT', action: 'CONFLICT', maxRetries: 0, baseBackoffMs: 0, shouldAlert: true },
}
```

**Circuit Breaker Pattern**:

```typescript
class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  private failureCount = 0
  private lastFailureTime = 0
  private successCount = 0

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime
      if (timeSinceLastFailure > 60000) { // 1 minute timeout
        this.state = 'HALF_OPEN'
        this.successCount = 0
      } else {
        throw new Error('Circuit breaker OPEN - service temporarily unavailable')
      }
    }

    try {
      const result = await fn()

      if (this.state === 'HALF_OPEN') {
        this.successCount++
        if (this.successCount >= 3) {
          this.state = 'CLOSED'
          this.failureCount = 0
        }
      }

      return result
    } catch (error) {
      this.failureCount++
      this.lastFailureTime = Date.now()

      if (this.failureCount >= 5) {
        this.state = 'OPEN'
        // Alert ops
      }

      throw error
    }
  }
}
```

**Smart Retry Strategy**:

```typescript
async function withSmartRetry<T>(
  fn: () => Promise<T>,
  operation: string,
  isIdempotent: boolean = false
): Promise<T> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const httpError = error as GoogleAPIError
      const classification = ERROR_MAP[httpError.status]

      if (!classification || classification.type !== 'TRANSIENT') {
        // Permanent error - fail fast
        if (classification?.type === 'AUTH_REQUIRED') {
          // Trigger re-auth
          TokenManager.revoke(userId)
          throw new Error('Authentication required - please re-login')
        }

        if (classification?.type === 'QUOTA_EXCEEDED') {
          // Log + alert
          log.error('Quota exceeded', { operation, userId })
          throw new Error('API quota exceeded - try again later')
        }

        // Other permanent errors
        if (!isIdempotent) {
          // Don't retry writes
          log.error('Operation failed (non-idempotent)', { operation, error: httpError.message })
          throw error
        }
      }

      // Transient error - retry with backoff
      const retryAfter = parseInt(error.headers['retry-after'] || '0') * 1000
      const backoff = Math.max(
        retryAfter,
        calculateBackoff(attempt, classification.baseBackoffMs)
      )

      lastError = error
      await sleep(backoff)
    }
  }

  throw lastError || new Error('Operation failed after max retries')
}
```

**Complexity**: MEDIUM  
**Reliability Impact**: HIGH  
**Timeline**: 1 day  
**Dependencies**: None

---

### ADR-004: Document Export & Parsing

**Decision**: Stream-based export with format-specific parsing, no temp files

**Context**:
- Current: Not implemented
- Challenge: Google Docs → multiple formats (PDF, DOCX, etc.)
- Size limit: 10MB per file (practical for most use cases)
- Parsing: Multiple libraries needed (pdf, xlsx, csv, docx)

**Design**:

```typescript
// Export pipeline
namespace DocumentExporter {
  type ExportFormat = 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

  interface ExportOptions {
    format: ExportFormat
    timeout?: number // Default 30s
    maxSize?: number // Default 10MB
  }

  // Step 1: Stream from Google Drive
  async function exportFromDrive(
    accessToken: string,
    fileId: string,
    mimeType: string,
    options: ExportOptions
  ): Promise<Buffer> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${mimeType}`

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(options.timeout || 30000)
    })

    if (!response.ok) {
      throw new GoogleAPIError(response.status, response.statusText, await response.text())
    }

    // Stream to buffer (no disk)
    const chunks: Buffer[] = []
    const reader = response.body.getReader()
    let totalSize = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      totalSize += value.length
      if (totalSize > (options.maxSize || 10 * 1024 * 1024)) {
        throw new Error('Exported file exceeds maximum size limit (10MB)')
      }

      chunks.push(Buffer.from(value))
    }

    return Buffer.concat(chunks)
  }

  // Step 2: Parse exported format
  async function parseExportedContent(buffer: Buffer, mimeType: string): Promise<string> {
    switch (mimeType) {
      case 'application/pdf':
        return await parsePdf(buffer)

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await parseDocx(buffer)

      case 'text/csv':
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        return await parseSheets(buffer, mimeType)

      default:
        throw new Error(`Unsupported format: ${mimeType}`)
    }
  }

  // PDF parsing
  async function parsePdf(buffer: Buffer): Promise<string> {
    const pdf = await require('pdf-parse')(buffer)
    return pdf.text
  }

  // DOCX parsing
  async function parseDocx(buffer: Buffer): Promise<string> {
    const zip = await require('unzipper').Open.buffer(buffer)
    const doc = await zip.file('word/document.xml').text()

    // Extract text from XML
    const xml = require('xml2js')
    const parsed = await xml.parseStringPromise(doc)
    return extractTextFromWord(parsed)
  }

  // Sheets parsing
  async function parseSheets(buffer: Buffer, mimeType: string): Promise<string> {
    const xlsx = require('xlsx')
    const workbook = xlsx.read(buffer, { type: 'buffer' })

    // Convert to CSV
    let csv = ''
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      const csvData = xlsx.utils.sheet_to_csv(sheet)
      csv += `${sheetName}\n${csvData}\n\n`
    }
    return csv
  }
}

// Usage
const exporter = new DocumentExporter()
const content = await exporter.exportAndParse(
  accessToken,
  fileId,
  'application/pdf'
)
```

**Supported Export Formats**:

| Document Type | Format | MIME Type | Library |
|---|---|---|---|
| Google Docs | PDF | application/pdf | pdf-parse |
| Google Docs | DOCX | application/vnd.openxmlformats... | unzipper + xml2js |
| Google Docs | Text | text/plain | Native |
| Google Sheets | CSV | text/csv | Native (csv parsing) |
| Google Sheets | XLSX | application/vnd.openxmlformats... | xlsx |
| Google Sheets | ODS | application/vnd.oasis.opendocument.spreadsheet | N/A (convert to XLSX) |
| Google Slides | PDF | application/pdf | pdf-parse |
| Google Slides | PPTX | application/vnd.openxmlformats... | pptx-parser (community) |

**Complexity**: MEDIUM  
**Security**: HIGH (no temp files)  
**Performance**: Good (stream directly to memory)  
**Timeline**: 1 day  
**Dependencies**: pdf-parse, unzipper, xml2js, xlsx

---

## Implementation Roadmap

### Week 1: Token Persistence (CRITICAL)
**Duration**: 1-2 days

```
Day 1:
- [ ] Design token schema + encryption
- [ ] Setup database (if not exists)
- [ ] Implement TokenManager.store()
- [ ] Implement TokenManager.getValidToken()

Day 2:
- [ ] Implement token rotation logic
- [ ] Implement graceful session recovery
- [ ] Add token revocation
- [ ] Integration tests with real OAuth flow
```

### Week 1-2: CRUD Operations (CRITICAL)
**Duration**: 2-3 days

```
Day 1:
- [ ] Implement Docs CRUD (create, update, delete)
- [ ] Implement Sheets CRUD (append, update)
- [ ] Tests for each operation

Day 2:
- [ ] Implement Calendar CRUD (update, delete)
- [ ] Implement Drive CRUD (create, update, delete)
- [ ] Implement Slides CRUD (all operations)

Day 3:
- [ ] Integration tests with real Google Workspace
- [ ] Idempotency key strategy for retries
```

### Week 2: Error Recovery (IMPORTANT)
**Duration**: 1 day

```
- [ ] Implement error classification
- [ ] Implement circuit breaker
- [ ] Implement smart retry logic
- [ ] Add Retry-After header parsing
- [ ] Tests for each error scenario
```

### Week 2-3: Document Export (IMPORTANT)
**Duration**: 1 day

```
- [ ] Implement stream-based export
- [ ] Add PDF parsing (pdf-parse)
- [ ] Add DOCX parsing (xml2js)
- [ ] Add Sheets parsing (xlsx)
- [ ] Tests for each format
```

### Dependencies

```
Token Persistence (ADR-001)
    ↓
CRUD Operations (ADR-002) - needs token refresh
    ↓
Error Recovery (ADR-003) - applies to CRUD
    ↓
Document Export (ADR-004) - independent but uses tokens
```

**Critical Path**: Token Persistence → CRUD Operations → Error Recovery

**Can parallelize**: Document Export (independent)

---

## Testing Strategy

### Unit Tests
- Token encryption/decryption
- Error classification logic
- Export parsing (mock Google responses)

### Integration Tests
- Real Google Workspace credentials
- Token refresh flow
- CRUD operations (create, verify, delete)
- Error scenarios (403, 429, 503)

### Load Tests
- Rate limiting behavior
- Backoff strategy under load
- Circuit breaker triggers

### Failure Scenario Tests
- Token expiration during operation
- Quota exhaustion (403)
- Rate limit (429)
- Network timeout (504)
- Permission denied (403)

---

## Risk Mitigation

### Risk 1: Token Migration
**Problem**: Moving from in-memory to DB breaks existing tokens
**Mitigation**:
- Provide grace period (e.g., 24 hours)
- During grace period: Accept both in-memory and DB tokens
- Log all token migrations
- Clear communication to users

### Risk 2: Non-Idempotent Writes
**Problem**: Retrying writes can cause duplicates (send email twice, append row twice)
**Mitigation**:
- Require idempotency keys from client
- Server stores seen keys with TTL
- Return cached result for duplicate requests

### Risk 3: Breaking Changes
**Problem**: New CRUD operations might conflict with existing code
**Mitigation**:
- Feature flags for new operations
- Gradual rollout to test users first
- Backward-compatible API (don't remove old methods)

### Risk 4: Large Exports
**Problem**: Exporting >10MB files fails
**Mitigation**:
- Document size limit clearly
- Fail fast with helpful error message
- Suggest alternatives (Google Takeout, streaming export)

---

## Success Criteria for Phase 3

- [x] 4 ADRs created with complete design
- [x] Implementation roadmap with dependencies
- [x] Testing strategy defined
- [x] Risk mitigation planned
- [x] Database schema designed
- [x] Error classification complete
- [x] Circuit breaker pattern designed
- [x] Export format matrix complete

---

## Next Steps

→ **Ready for Phase 4: Implementation**

All designs are complete and validated. Phase 4 can proceed with:
1. Token storage implementation (critical path)
2. CRUD operations in parallel
3. Error recovery integration
4. Document export as final component

**Estimated Phase 4 Duration**: 2-3 weeks
