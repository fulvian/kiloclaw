# Kiloclaw Isolation Plan

> **Status**: Implemented  
> **Date**: 2026-04-02  
> **Last Updated**: 2026-04-03
> **Scope**: Complete isolation from KiloCode runtime, config, and telemetry

## Overview

Kiloclaw must operate as a fully autonomous system with zero dependencies on or contamination from KiloCode. This document defines the technical isolation requirements and implementation checklist.

## Isolation Domains

### 1. Namespace Isolation

| Aspect            | KiloCode                | Kiloclaw        | Status  |
| ----------------- | ----------------------- | --------------- | ------- |
| Package namespace | `@kilocode/*`           | `@kiloclaw/cli` | ✅ Done |
| Runtime namespace | `kilocode` / `opencode` | `kiloclaw`      | ✅ Done |
| Binary name       | `kilo`, `kilocode`      | `kiloclaw`      | ✅ Done |
| Config prefix     | `KILO_*`, `OPENCODE_*`  | `KILOCLAW_*`    | ✅ Done |

### 2. Environment Variables

```typescript
// ACCEPTED prefixes (runtime)
const KILOCLAW_ACCEPTED_PREFIXES = [
  "KILOCLAW_",
  "KILOCLAW_APP_",
  "KILOCLAW_CORE_",
  "KILOCLAW_AGENCY_",
  "KILOCLAW_MEMORY_",
  "KILOCLAW_TOOL_",
  "KILOCLAW_SCHED_",
  "KILOCLAW_PROACTIVE_",
  "KILOCLAW_GUARDRAILS_",
]

// BLOCKED prefixes (never read)
const KILOCLAW_BLOCKED_PREFIXES = ["KILO_", "OPENCODE_", "ARIA_", "_KILO", "_OPENCODE"]
```

### 3. Data Directory Structure

```
~/.kiloclaw/                    # Primary data directory (CREATE NEW)
├── config/
│   └── kiloclaw.json          # Main configuration file
├── data/
│   ├── working/               # Working memory (ephemeral)
│   ├── episodic/               # Episodic memory (30-180 days retention)
│   ├── semantic/              # Semantic memory (long-term)
│   └── procedural/            # Procedural memory (versioned registry)
├── cache/
│   └── index/                 # Vector/graph search indices
├── logs/
│   └── audit/                 # Immutable audit logs with correlation IDs
├── secrets/
│   └── vault/                 # Encrypted secret storage (AES-256)
└── plugins/
    └── registry/              # Plugin registry (Kiloclaw-signed only)
```

**Kiloclaw MUST NOT access:**

- `~/.kilocode/`
- `~/.opencode/`
- `~/.config/kilocode/`
- Any path containing `kilocode` or `opencode` in data directories

### 4. Telemetry Isolation

```typescript
interface TelemetryIsolation {
  // Separate telemetry endpoint
  endpoint: "https://telemetry.kiloclaw.io"

  // Separate project ID
  projectId: "kiloclaw-{environment}"

  // Separate API keys
  apiKeyEnv: "KILOCLAW_TELEMETRY_KEY"

  // Event namespace isolation
  eventPrefix: "kiloclaw"

  // Block telemetry to KiloCode endpoints
  blockedEndpoints: ["telemetry.kilocode.ai", "telemetry.opencode.ai", "api.opencode.ai"]
}
```

### 5. Provider Keys Isolation

```typescript
interface ProviderKeyIsolation {
  // Keys stored in Kiloclaw-specific namespace
  secretNamespace: "kiloclaw/providers"

  // NO fallback to KiloCode provider keys
  fallbackAllowed: false

  // Key rotation support with audit
  rotationPolicy: {
    autoRotate: true
    rotationPeriodDays: 90
    auditTrail: true
  }

  // Supported providers
  supportedProviders: ["openai", "anthropic", "google-vertex", "aws-bedrock", "perplexity", "groq", "cerebras"]
}
```

### 6. Plugin Ecosystem Isolation

```typescript
interface PluginIsolation {
  // Required signature for all plugins
  requireSignature: true

  // Accepted signatures
  acceptedSigners: ["kiloclaw", "kiloclaw-trusted"]

  // NO automatic installation from KiloCode marketplace
  marketplaceFallback: false

  // Block legacy plugins
  blockLegacyPlugins: true

  // Plugin validation
  validatePlugin: (plugin: PluginManifest) => ValidationResult
}
```

## Isolation Invariants (Enforced at Runtime)

These rules are **ABSOLUTE** and cannot be disabled:

```typescript
const ISOLATION_INVARIANTS = {
  // Rule 1: No reading KiloCode data directories
  noKilocodeDataRead: {
    forbiddenPaths: ["~/.kilocode/", "~/.opencode/", "~/.config/kilocode/"],
    action: "block_and_audit",
    severity: "critical",
  },

  // Rule 2: No fallback to KiloCode config on missing Kiloclaw config
  noConfigFallback: {
    behavior: "use_secure_defaults",
    fallbackToKilocode: false,
    logFallbackAttempt: true,
  },

  // Rule 3: No telemetry to KiloCode endpoints
  noKilocodeTelemetry: {
    blockedDomains: ["telemetry.kilocode.ai", "telemetry.opencode.ai"],
    action: "block_and_alert",
  },

  // Rule 4: No plugin installation without valid signature
  pluginSignatureRequired: {
    acceptedSignatures: ["kiloclaw-v1"],
    action: "reject_and_log",
  },

  // Rule 5: No env var reading from legacy prefixes
  noLegacyEnvRead: {
    blockedPrefixes: ["KILO_", "OPENCODE_", "ARIA_"],
    action: "ignore_and_log",
  },
}
```

## Implementation Checklist

### Phase 1: Foundation

- [x] **DONE** Create isolated directory structure under `~/.kiloclaw/`
- [x] **DONE** Define blocked environment variable prefixes
- [x] **DONE** Document telemetry isolation requirements
- [x] **DONE** Document provider key isolation requirements
- [x] **DONE** Document plugin isolation requirements

### Phase 2: Core Runtime

- [x] **DONE** Implement config loader with prefix filtering
- [x] **DONE** Implement path validation to block KiloCode directories
- [x] **DONE** Implement telemetry endpoint validation
- [x] **DONE** Implement secret namespace isolation
- [x] **DONE** Add integration tests for isolation invariants

### Phase 3: Memory

- [ ] Implement `~/.kiloclaw/data/` layer storage
- [ ] Configure retention policies per layer
- [ ] Test no-cross-contamination between layers

### Phase 4: Agency Migration

- [ ] Migrate agencies to isolated data directories
- [ ] Verify no shared state with KiloCode

## Verification Tests

```typescript
// Test 1: Verify KiloCode paths are blocked
async function testKilocodePathIsolation() {
  const forbiddenPaths = ["~/.kilocode/data", "~/.opencode/config"]

  for (const path of forbiddenPaths) {
    const result = await kiloclaw.pathValidator.check(path)
    expect(result.allowed).toBe(false)
  }
}

// Test 2: Verify legacy env vars are ignored
async function testLegacyEnvIsolation() {
  process.env["KILO_API_KEY"] = "secret"
  process.env["KILOCLAW_API_KEY"] = "kilokey"

  const config = await kiloclaw.config.load()

  expect(config.apiKey).toBe("kilokey")
  expect(process.env["KILO_API_KEY"]).toBeUndefined()
}

// Test 3: Verify telemetry goes to correct endpoint
async function testTelemetryIsolation() {
  const event = { type: "test" }

  await kiloclaw.telemetry.record(event)

  expect(telemetryMock.lastEndpoint).toContain("kiloclaw.io")
  expect(telemetryMock.lastEndpoint).not.toContain("opencode")
}
```

## Rollback Prevention

If any isolation invariant is violated:

1. System logs the violation with full context
2. Alert is sent to audit system
3. Action is blocked (or sandboxed if possible)
4. Incident is recorded for post-mortem

## References

- ADR-004: Isolation from KiloCode
- KILOCLAW_BLUEPRINT.md Section 6
- KILOCLAW_FOUNDATION_PLAN.md Section "Repo Isolation"
