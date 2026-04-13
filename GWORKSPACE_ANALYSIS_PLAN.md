# Google Workspace Agency - Comprehensive Analysis Plan

**Date**: 2026-04-13  
**Status**: In Progress  
**Objective**: Deep technical audit + improvement roadmap

---

## Phase 0: Reconnaissance (Current)

### A. Authentication Issues (CRITICAL)

- [ ] **R1**: Analyze OAuth2 token lifecycle in `gworkspace-oauth.ts`
- [ ] **R2**: Review token refresh logic and expiration handling
- [ ] **R3**: Document session state management in `gworkspace-broker.ts`
- [ ] **R4**: Research best practices for token persistence + rotation
- [ ] **R5**: Check for credential leak surfaces

### B. Document Handling Gaps

- [ ] **D1**: Audit current attachment processing in `gworkspace.ts` skills
- [ ] **D2**: Identify which Google document types are unsupported (Docs, Sheets, Slides)
- [ ] **D3**: Research Google Drive API integration patterns
- [ ] **D4**: Design download-to-repo + parse flow
- [ ] **D5**: Check multi-format parsing capability (PDF, DOCX, XLSX, etc.)

### C. Missing CRUD Operations

- [ ] **C1**: Map current API coverage (read-only vs. full CRUD)
- [ ] **C2**: Research Google Docs API (v1) best practices
- [ ] **C3**: Research Google Sheets API (v4) best practices
- [ ] **C4**: Research Google Slides API (v1) best practices
- [ ] **C5**: Find open-source agent examples with CRUD support

### D. Cross-Workspace Data Mining

- [ ] **S1**: Research skills/tools for workspace-wide queries
- [ ] **S2**: Find agents with multi-workspace aggregation capability
- [ ] **S3**: Identify data governance + privacy patterns
- [ ] **S4**: Document API rate limits + pagination strategies

---

## Phase 1: Code Audit

### Codebase Map

**Location**: `packages/opencode/src/kiloclaw/agency/`

- `gworkspace-oauth.ts` - OAuth2 implementation
- `gworkspace-adapter.ts` - Service adapter
- `gworkspace.ts` - Skills/tools definition
- `gworkspace-broker.ts` - State management
- `gworkspace-hitl.ts` - Human-in-the-loop
- `gworkspace-audit.ts` - Audit logging
- `gworkspace-manifest.ts` - API surface definition

### Audit Checkpoints

- [ ] Token lifecycle: creation → refresh → expiration
- [ ] Error handling: permission denied, rate limit, network failure
- [ ] Credential storage: env vars, session store, file system
- [ ] Attachment support: formats, max size, parsing
- [ ] API coverage: which endpoints implemented, which missing

---

## Phase 2: Research & Best Practices

### Search Topics (Tavily + Perplexity)

1. **OAuth2 Token Management for Google Workspace**
   - Token refresh strategies
   - Credential rotation best practices
   - Session recovery patterns
   - Off-line access vs. online access tokens

2. **Google Drive Document Download & Parsing**
   - Multi-format export strategies
   - Batch download patterns
   - Temporary file handling
   - Character encoding + OCR for images

3. **Google Docs/Sheets/Slides API (CRUD)**
   - Document creation patterns
   - Batch updates best practices
   - Conflict resolution
   - Real-time collaboration implications

4. **Cross-Workspace Data Mining**
   - Admin APIs for organizational data
   - Multi-account OAuth patterns
   - Privacy + compliance constraints
   - Aggregation + deduplication patterns

5. **Agent Patterns for Google Services**
   - Open-source agents (LangChain, AutoGPT integrations)
   - Failure recovery strategies
   - Rate-limiting + backoff patterns
   - Resumable operations

---

## Phase 3: Implementation Roadmap

### Priority 1: Authentication Hardening

- [ ] Implement robust token refresh with expiration hooks
- [ ] Add graceful session recovery after token expiration
- [ ] Centralize credential lifecycle (encrypt at rest, rotate on schedule)
- [ ] Add token revocation on logout
- [ ] Tests for expiration scenarios

### Priority 2: Document Processing

- [ ] Add Google Drive file download capability
- [ ] Implement multi-format parser (PDF, DOCX, XLSX, PPTX)
- [ ] Temp file management in repo structure
- [ ] Content extraction + summarization
- [ ] Attachment metadata indexing

### Priority 3: CRUD Operations

- [ ] Implement Google Docs creation + modification
- [ ] Implement Google Sheets creation + modification
- [ ] Implement Google Slides creation + modification
- [ ] Batch operation support
- [ ] Conflict detection + resolution

### Priority 4: Data Mining

- [ ] Workspace-wide search capability
- [ ] User/group enumeration (for authorized users)
- [ ] Content aggregation + tagging
- [ ] Dashboard/reporting views
- [ ] Privacy-aware access patterns

---

## Findings

### Current State

- Location: `packages/opencode/src/kiloclaw/agency/`
- Main files: 7 TypeScript modules
- Status: Partial implementation (read-heavy)

### Known Issues

1. Token refresh mechanism unclear
2. No document download/parse support
3. No CRUD for Google documents
4. Limited cross-workspace querying

### Opportunities

1. Implement resilient OAuth2 with automatic retry
2. Add document download + parsing pipeline
3. Build CRUD wrappers around Google APIs
4. Create workspace aggregation service

---

## Timeline

| Phase                   | Target  | Effort         |
| ----------------------- | ------- | -------------- |
| Phase 1: Code Audit     | 2 hours | Read + analyze |
| Phase 2: Research       | 3 hours | Web research   |
| Phase 3: Design         | 2 hours | Architecture   |
| Phase 4: Implementation | 4 weeks | Development    |
| Phase 5: Testing        | 1 week  | Verification   |

---

## Success Criteria

- [ ] Authentication: Zero unplanned session drops in production
- [ ] Documents: Can download + read any Google doc type within 30s
- [ ] CRUD: Full create/read/update/delete for Docs/Sheets/Slides
- [ ] Querying: Workspace-wide search returns results in <2s
- [ ] Tests: 100% coverage of new code paths
