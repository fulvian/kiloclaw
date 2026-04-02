# ADR-004: Isolation from KiloCode

> **Status**: Draft  
> **Date**: 2026-04-02  
> **Deciders**: Architect, Orchestrator

## Context

Kiloclaw is a fork of KiloCode but must operate as a fully isolated system. There must be zero operational dependencies on or contamination from the parent KiloCode installation. This includes:

- Application identity and namespace
- File system paths and data directories
- Environment variables and configuration
- Telemetry and metrics
- Provider keys and secrets
- Plugin ecosystem

## Decision

### Namespace Isolation

| Domain            | KiloCode (Legacy)              | Kiloclaw (Target) |
| ----------------- | ------------------------------ | ----------------- |
| Runtime namespace | `kilocode` / `opencode`        | `kiloclaw`        |
| Package namespace | `@kilocode/*`                  | `@kilocaw/*`      |
| Binary name       | `kilo`                         | `kiloclaw`        |
| Config prefix env | `KILO_*`, `OPENCODE_*`         | `KILOCLAW_*`      |
| Data directory    | `~/.kilocode/`, `~/.opencode/` | `~/.kiloclaw/`    |
| Config file       | `.opencode.json`               | `kiloclaw.json`   |

### Environment Variables

```typescript
// ONLY these prefixes are accepted at runtime
const ACCEPTED_ENV_PREFIXES = ["KILOCLAW_"]

// ALL legacy prefixes are explicitly ignored
const IGNORED_ENV_PREFIXES = ["KILO_", "OPENCODE_", "ARIA_"]

// Migration requires explicit tool, no automatic fallback
interface EnvMigrationResult {
  key: string
  oldValue: string
  newKey: string
  newValue: string
  status: "migrated" | "deprecated" | "blocked"
  reason?: string
}
```

### Data Directory Structure

```
~/.kiloclaw/
├── config/
│   └── kiloclaw.json          # Main configuration
├── data/
│   ├── working/               # Working memory (ephemeral)
│   ├── episodic/               # Episodic memory (30-180 days)
│   ├── semantic/              # Semantic memory (long-term)
│   └── procedural/            # Procedural memory (versioned)
├── cache/
│   └── index/                 # Vector/graph indices
├── logs/
│   └── audit/                 # Immutable audit logs
├── secrets/
│   └── vault/                 # Encrypted secret storage
└── plugins/
    └── registry/              # Plugin registry (Kiloclaw-signed)
```

### Telemetry Isolation

```typescript
interface TelemetryConfig {
  // Separate endpoints
  readonly endpoint: "https://telemetry.kiloclaw.io"

  // Separate project ID
  readonly projectId: "kiloclaw-{env}"

  // Separate API keys
  readonly apiKeySecret: "KILOCLAW_TELEMETRY_KEY"

  // Event namespace
  readonly eventPrefix: "kiloclaw"

  // No sharing with KiloCode project
  readonly isolationMode: "strict"
}
```

### Provider Key Isolation

```typescript
interface ProviderKeyConfig {
  // Keys stored in Kiloclaw-specific namespace
  readonly secretNamespace: "kiloclaw/providers"

  // No fallback to KiloCode keys
  readonly fallbackAllowed: false

  // Key rotation support
  readonly rotationPolicy: RotationPolicy

  // Audit trail for key access
  readonly accessAudit: true
}
```

### Plugin Ecosystem Isolation

```typescript
interface PluginPolicy {
  // Only signed plugins
  readonly requireSignature: true

  // Compatible signatures
  readonly acceptedSigners: ["kiloclaw", "kiloclaw-trusted"]

  // No automatic installation from KiloCode marketplace
  readonly marketplaceFallback: false

  // Legacy plugin blocking
  readonly blockLegacyPlugins: true
}
```

### Isolation Invariants

These rules are **enforced at runtime** and cannot be bypassed:

```typescript
const ISOLATION_INVARIANTS = {
  // NO reading of KiloCode data directories
  noKilocodeDataRead: {
    paths: ["~/.kilocode/", "~/.opencode/"],
    action: "block",
  },

  // NO fallback to KiloCode config on missing Kiloclaw config
  noConfigFallback: {
    missingBehavior: "use_defaults",
    fallbackToKilocode: false,
  },

  // NO telemetry to KiloCode endpoints
  noKilocodeTelemetry: {
    endpoints: ["telemetry.kilocode.ai", "telemetry.opencode.ai"],
    action: "block",
  },

  // NO plugin installation without Kiloclaw signature
  pluginSignatureRequired: {
    acceptedSignatures: ["kiloclaw-v1"],
  },
}
```

### Migration Path

```typescript
interface MigrationConfig {
  // Explicit migration tool, not automatic
  readonly migrationTool: "./tools/migrate-kilocode"

  // Required approval for each migration step
  readonly requireApproval: true

  // Report generation
  readonly generateReport: true
  readonly reportFormat: "signed_json"

  // Rollback support
  readonly rollbackSupported: true
}
```

## Consequences

### Positive

- Complete operational independence from KiloCode
- Clean brand and product identity
- No licensing or IP contamination
- Audit-friendly separation

### Negative

- No easy fallback to KiloCode functionality
- Migration effort for existing KiloCode users
- Separate plugin ecosystem requiring resigning
- Independent telemetry baseline building

### Mitigations

- Migration tooling with explicit approval workflow
- Compatibility adapter for essential integrations
- Graceful degradation messaging

## References

- KILOCLAW_BLUEPRINT.md Section 6
- KILOCLAW_FOUNDATION_PLAN.md Section "Repo Isolation"
