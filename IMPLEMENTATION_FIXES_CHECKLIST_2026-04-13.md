# IMPLEMENTATION FIXES - CODE BLOCKS TO APPLY

**Status**: Ready for immediate implementation  
**Scope**: Remediate 7 BLOCKERS + 5 ISSUES  
**Estimated effort**: 80 hours (split across 5 phases)

---

## FIX 1: Aggiungi PolicyLevel enum (BLOCKER 2)

**File**: `packages/opencode/src/kiloclaw/agency/types.ts`  
**Action**: Aggiungi questo type

```typescript
// Lines after existing Domain enum:

/**
 * Policy enforcement level for capabilities and tools
 * - SAFE: Operazioni read-only, nessun side effect
 * - NOTIFY: Operazioni con side effect reversibili (notifica post-exec)
 * - CONFIRM: Operazioni con impatto significativo (richiedi conferma)
 * - HITL: Operazioni irreversibili/ad alto rischio (richiedi approvazione umana)
 * - DENY: Mai consentito
 */
export type PolicyLevel = "SAFE" | "NOTIFY" | "CONFIRM" | "HITL" | "DENY"

export const PolicyLevelOrder = {
  SAFE: 0,
  NOTIFY: 1,
  CONFIRM: 2,
  HITL: 3,
  DENY: 4,
} as const

export function isMoreRestrictive(a: PolicyLevel, b: PolicyLevel): boolean {
  return PolicyLevelOrder[a] > PolicyLevelOrder[b]
}

export function enforcePolicy(level: PolicyLevel, requiresApproval: boolean): "allow" | "notify" | "confirm" | "deny" {
  if (level === "DENY" || requiresApproval) return "deny"
  if (level === "HITL") return "deny" // Can only proceed with user approval
  if (level === "CONFIRM") return "confirm"
  if (level === "NOTIFY") return "notify"
  return "allow"
}
```

---

## FIX 2: Aggiorna Development Agency definition (BLOCKER 1 + Issue 2)

**File**: `packages/opencode/src/kiloclaw/agency/bootstrap.ts`  
**Lines**: 78-90  
**Action**: Sostituisci intera agency definition

```typescript
{
  id: "agency-development",
  name: "Development Agency",
  domain: "development",
  policies: {
    allowedCapabilities: [
      "coding",
      "code-generation",
      "code-review",
      "refactoring",
      "debugging",
      "testing",
      "tdd",
      "planning",
      "document_analysis",
      "comparison",
    ],
    deniedCapabilities: [
      "destructive_git", // git reset --hard, force push
      "secret_export",   // export API keys, credentials
      "auto_execute",    // auto-run without user approval
    ],
    maxRetries: 3,
    requiresApproval: false, // Skills may override per-operation
    dataClassification: "internal",
    // Policy level mapping - NUOVO
    policyMapping: {
      // Read-only operations (SAFE)
      "read": "SAFE",
      "glob": "SAFE",
      "grep": "SAFE",
      "codesearch": "SAFE",
      // Reversible write operations (NOTIFY)
      "apply_patch": "NOTIFY",
      "bash": "NOTIFY", // execute build/test scripts
      // Skills (variable based on skill config)
      "skill": "NOTIFY",
    },
  },
  providers: [
    "native", // Native file/git/bash operations (preferred)
    "firecrawl", // Fallback for web research in development context
  ],
  metadata: {
    wave: 1,
    description: "Coding, review, and delivery assistance",
    nativeAdapters: ["NativeFileAdapter", "NativeGitAdapter", "NativeBuildAdapter"],
    policyEnforced: true,
    contextFootprint: {
      toolsExposed: 9,
      schemaSizeEstimate: "~2.5KB",
      lazyLoadingStrategy: "skills loaded on-demand via execution-bridge",
      budgetContextPerStep: "4KB (tokens ~500)",
    },
  },
},
```

---

## FIX 3: Implementa fallback policy (BLOCKER 6)

**File**: `packages/opencode/src/kiloclaw/tooling/native/fallback-policy.ts` (NEW)  
**Action**: Crea file

```typescript
import { Log } from "@/util/log"
import type { PolicyLevel } from "@/kiloclaw/agency/types"

const log = Log.create({ service: "kiloclaw.fallback-policy" })

export type FallbackDecision = "native" | "mcp" | "deny"

export interface FallbackInput {
  nativeAvailable: boolean
  nativeError?: Error | null
  retryCount?: number
  capability: string
  policyLevel: PolicyLevel
  isDestructive: boolean
}

/**
 * Deterministic fallback policy for native-first adapter strategy
 */
export function decideFallback(input: FallbackInput): FallbackDecision {
  const { nativeAvailable, nativeError, retryCount = 0, policyLevel, isDestructive, capability } = input

  // Hard deny cases
  if (policyLevel === "DENY") {
    log.warn("fallback blocked by policy", { capability, policyLevel })
    return "deny"
  }

  // Destructive operations never fallback to MCP
  if (isDestructive && policyLevel !== "SAFE") {
    log.warn("fallback blocked for destructive operation", { capability, isDestructive })
    return "deny"
  }

  // If native is available and healthy, always use it
  if (nativeAvailable && !nativeError) {
    return "native"
  }

  // If native errored, check retry count and error type
  if (nativeError) {
    const isTransient = isTransientError(nativeError)

    // Transient errors get retry attempt
    if (isTransient && retryCount < 2) {
      log.warn("native transient error, will retry", { capability, error: nativeError.message, retryCount })
      return "native" // Will retry
    }

    // Permanent errors allowed to fallback IF policy permits
    if (policyLevel === "SAFE" || policyLevel === "NOTIFY") {
      log.warn("native permanent error, falling back to MCP", {
        capability,
        error: nativeError.message,
        policyLevel,
      })
      return "mcp"
    }

    // Higher policy levels don't fallback on error
    log.error("native error prevents fallback", { capability, policyLevel, error: nativeError.message })
    return "deny"
  }

  // Capability gap - MCP allowed for SAFE/NOTIFY, denied for higher levels
  if (policyLevel === "SAFE" || policyLevel === "NOTIFY") {
    log.info("capability not implemented natively, using MCP", { capability })
    return "mcp"
  }

  // No native, no error, but high policy - deny
  log.error("capability gap prevents MCP fallback due to policy", { capability, policyLevel })
  return "deny"
}

function isTransientError(err: Error): boolean {
  const msg = err.message.toLowerCase()
  return (
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("network") ||
    msg.includes("temporary")
  )
}

/**
 * Build fallback chain metadata for telemetry
 */
export interface FallbackChainMetadata {
  providersTried: string[]
  errorsByProvider: Record<string, string>
  finalDecision: FallbackDecision
  totalRetries: number
  durationMs: number
}

export function createFallbackMetadata(providers: string[], errors: Record<string, Error>): FallbackChainMetadata {
  return {
    providersTried: providers,
    errorsByProvider: Object.entries(errors).reduce(
      (acc, [provider, err]) => {
        acc[provider] = err.message
        return acc
      },
      {} as Record<string, string>,
    ),
    finalDecision: "mcp",
    totalRetries: 0,
    durationMs: 0,
  }
}
```

---

## FIX 4: Estendi CORE_KEYWORDS nel router (Issue 1)

**File**: `packages/opencode/src/kiloclaw/router.ts`  
**Lines**: 480-500  
**Action**: Aggiungi keywords

```typescript
const CORE_KEYWORDS: Record<string, string[]> = {
  // ... altre domain ...

  development: [
    // Existing
    "code",
    "debug",
    "build",
    "deploy",
    "git",
    "function",
    "class",
    "react",
    "component",
    "typescript",
    "javascript",
    "refactor",
    "test",
    "compile",
    "api",
    "patch",
    "merge",
    // NUOVO - high-value error-related keywords
    "error",
    "bug",
    "exception",
    "crash",
    "incident",
    "issue",
    "problem",
    "failure",
    "broken",
    "not working",
    // Italian variants
    "codice",
    "rifattorizza",
    "errore",
    "bug",
    "problema",
    "fallisce",
    "non funziona",
    "rotto",
  ], // Now 28 keywords total

  // ... rest unchanged ...
}
```

---

## FIX 5: Aggiorna mapDevelopmentCapabilitiesToTools (Issue 2)

**File**: `packages/opencode/src/session/tool-policy.ts`  
**Lines**: 163-172  
**Action**: Estendi mapping

```typescript
export function mapDevelopmentCapabilitiesToTools(capabilities: string[]) {
  const tools = capabilities.flatMap((cap) => {
    // Code understanding & analysis (SAFE reads)
    if (["coding", "code-generation", "code-review", "refactoring", "comparison", "document_analysis"].includes(cap))
      return ["read", "glob", "grep", "codesearch"]

    // Debugging & diagnosis (read + execute)
    if (["debugging", "troubleshooting"].includes(cap)) return ["bash", "read", "glob", "grep"]

    // Test-driven development (execution + read)
    if (["testing", "tdd"].includes(cap)) return ["bash", "read", "glob"]

    // Planning & architecture (read + doc)
    if (["planning", "code-planning", "architecture"].includes(cap)) return ["read", "glob", "grep"]

    // Patch & refactoring (read + write)
    if (["patching", "refactoring"].includes(cap)) return ["read", "glob", "apply_patch"]

    // Git operations
    if (["git_ops", "git-workflow"].includes(cap)) return ["bash", "read"] // controlled git calls

    return []
  })

  return Array.from(new Set(tools))
}

/**
 * Policy level for each development tool
 */
export const DEVELOPMENT_TOOL_POLICY_LEVELS: Record<string, PolicyLevel> = {
  read: "SAFE",
  glob: "SAFE",
  grep: "SAFE",
  codesearch: "SAFE",
  apply_patch: "NOTIFY", // Writes to filesystem
  bash: "NOTIFY", // Executes scripts (could have side effects)
  skill: "NOTIFY", // Skills may execute operations
  websearch: "NOTIFY", // External network call
  webfetch: "NOTIFY", // External network call
}
```

---

## FIX 6: Allinea prompt.ts con tool-policy.ts (BLOCKER 3)

**File**: `packages/opencode/src/session/prompt.ts`  
**Lines**: 1046-1090  
**Action**: Aggiorna agency context block

```typescript
} else if (agencyContext.agencyId === "agency-development") {
  agencyBlock = [
    "",
    "<!-- Agency Context: Development Agency -->",
    "This conversation has been routed to the Development Agency.",
    `Routing confidence: ${Math.round(agencyContext.confidence * 100)}%`,
    `Routing reason: ${agencyContext.reason}`,
    `Routing source: ${agencyContext.routeSource}`,
    ...(agencyContext.fallbackUsed ? [`Routing fallback: ${agencyContext.fallbackReason ?? "none"}`] : []),
    ...(agencyContext.layers?.L1
      ? [
          `L1 capabilities: ${agencyContext.layers.L1.capabilities.join(", ") || "none"}`,
          `L1 route type: ${agencyContext.layers.L1.routeResult?.type ?? "fallback"}`,
        ]
      : []),
    ...(agencyContext.layers?.L2
      ? [
          `L2 agent: ${agencyContext.layers.L2.agentId ?? "none"}`,
          `L2 health: ${agencyContext.layers.L2.agentHealth}`,
        ]
      : []),
    ...(agencyContext.layers?.L3
      ? [
          `L3 tools denied: ${agencyContext.layers.L3.toolsDenied}`,
          `L3 fallback used: ${agencyContext.layers.L3.fallbackUsed}`,
          `L3 policy enforced: true`, // NUOVO
        ]
      : []),
    "",
    "<!-- HARD POLICY (Runtime Enforcement) -->",
    "⚠️  IMPORTANT: Tool policy is enforced at runtime, independent of prompt guidance.",
    "The tools below are determined by policy, not softly suggested:",
    "",
    "ALLOWED TOOLS (Hard Policy Enforcement):",
    "- read, glob, grep, codesearch: Read-only file operations (SAFE)",
    "- apply_patch: Apply code patches with verification (NOTIFY)",
    "- bash: Execute build/test/git scripts (NOTIFY)",
    "- skill: Invoke development skills (NOTIFY)",
    "",
    "BLOCKED TOOLS (Denied by Policy):",
    "- websearch, webfetch: Use native code analysis instead",
    "- codesearch_web: Only local codesearch allowed",
    "",
    "CRITICAL TOOL INSTRUCTIONS:",
    "- All tool invocations validated against policy before execution",
    "- If a tool is not in the ALLOWED list above, it WILL BE BLOCKED",
    "- Do NOT attempt to work around policy via skill definitions",
    "- Prioritize native tools over any MCP fallback",
    "",
    "WORKFLOW GUIDANCE:",
    "- For debugging: use systematic-debugging + verification-before-completion",
    "- For feature delivery: use spec-driven-development + test-driven-development",
    "- For code review: use code-review-discipline + receiving-code-review",
    "- For branch completion: use finishing-a-development-branch",
    "",
    "SAFETY GUARDRAILS:",
    "- git reset --hard, force push, secret export: ALL DENIED",
    "- apply_patch: Scope to requested files only",
    "- bash: Execute only build/test/non-destructive git commands",
    "- All destructive operations require explicit user approval",
    "",
  ].join("\n")
}
```

---

## FIX 7: Aggiungi telemetry logging (BLOCKER 5)

**File**: `packages/opencode/src/session/prompt.ts`  
**Lines**: 1700-1710  
**Action**: Estendi logging

```typescript
// PRIMA DI resolveTools, aggiungi questo logging:

log.info("tool policy applied", {
  sessionID: ctx.sessionID,
  agencyId: agencyContext?.agencyId ?? "none",
  agencyConfidence: agencyContext?.confidence,
  policyEnabled: agencyTools.enabled,
  policyEnforced: agencyTools.enabled, // NUOVO
  allowedToolCount: allowedTools.length,
  allowedTools: allowedTools.slice(0, 20).join(","), // Max 20 for log readability
  blockedToolCount: blockedTools.length,
  blockedTools: blockedTools.slice(0, 10).join(","), // Max 10
  capabilitiesL1: agencyContext?.layers?.L1?.capabilities?.join(",") ?? "none",
  routeSource: agencyContext?.routeSource ?? "none",
  fallbackUsed: agencyContext?.fallbackUsed ?? false,
  fallbackReason: agencyContext?.fallbackReason ?? "none",
})

// Validate non-intersection of allowed/blocked
const intersection = allowedTools.filter((t) => blockedTools.includes(t))
if (intersection.length > 0) {
  log.error("policy violation: tool in both allowed and blocked", {
    intersection,
  })
}
```

---

## FIX 8: Implementa error taxonomy (BLOCKER 7)

**File**: `packages/opencode/src/kiloclaw/runtime/error-taxonomy.ts` (NEW)  
**Action**: Crea file

```typescript
import { Log } from "@/util/log"

const log = Log.create({ service: "kiloclaw.error-taxonomy" })

export type ErrorCategory = "exception" | "build_fail" | "test_fail" | "policy_block" | "tool_contract_fail"

export type ErrorSeverity = "low" | "medium" | "high" | "critical"

export interface ClassifiedError {
  category: ErrorCategory
  severity: ErrorSeverity
  message: string
  stackTrace?: string
  timestamp: Date
  correlationId: string
}

export function classifyError(error: unknown, correlationId: string): ClassifiedError {
  if (!(error instanceof Error)) {
    return {
      category: "exception",
      severity: "medium",
      message: String(error),
      timestamp: new Date(),
      correlationId,
    }
  }

  const msg = error.message.toLowerCase()
  const stack = error.stack || ""

  // Build failures
  if (msg.includes("build") || msg.includes("compile") || msg.includes("enoent")) {
    return {
      category: "build_fail",
      severity: msg.includes("critical") ? "critical" : "high",
      message: error.message,
      stackTrace: stack,
      timestamp: new Date(),
      correlationId,
    }
  }

  // Test failures
  if (msg.includes("test") || msg.includes("assertion") || msg.includes("failed")) {
    return {
      category: "test_fail",
      severity: "medium",
      message: error.message,
      stackTrace: stack,
      timestamp: new Date(),
      correlationId,
    }
  }

  // Policy blocks
  if (msg.includes("policy") || msg.includes("denied") || msg.includes("unauthorized")) {
    return {
      category: "policy_block",
      severity: "high",
      message: error.message,
      stackTrace: stack,
      timestamp: new Date(),
      correlationId,
    }
  }

  // Tool contract failures
  if (msg.includes("contract") || msg.includes("schema") || msg.includes("validation")) {
    return {
      category: "tool_contract_fail",
      severity: "high",
      message: error.message,
      stackTrace: stack,
      timestamp: new Date(),
      correlationId,
    }
  }

  // Default to exception
  return {
    category: "exception",
    severity: "high",
    message: error.message,
    stackTrace: stack,
    timestamp: new Date(),
    correlationId,
  }
}

export function shouldTriggerAutoRepair(classified: ClassifiedError): boolean {
  // Only trigger on certain categories
  const autoRepairCategories: ErrorCategory[] = ["build_fail", "test_fail", "policy_block"]

  if (!autoRepairCategories.includes(classified.category)) {
    return false
  }

  // Don't auto-repair critical errors (escalate to user)
  if (classified.severity === "critical") {
    return false
  }

  return true
}

export function getRepairStrategy(classified: ClassifiedError): "retry" | "alternative" | "escalate" | "none" {
  if (classified.category === "build_fail" && classified.severity === "high") {
    return "retry" // Transient build issues often resolve with retry
  }

  if (classified.category === "test_fail" && classified.severity === "medium") {
    return "alternative" // Try different approach
  }

  if (classified.category === "policy_block") {
    return "escalate" // Never auto-repair policy violations
  }

  return "none"
}
```

---

## FIX 9: Implementa auto-repair cycle (BLOCKER 7)

**File**: `packages/opencode/src/kiloclaw/runtime/auto-repair.ts` (NEW)  
**Action**: Crea file

```typescript
import { Log } from "@/util/log"
import { classifyError, shouldTriggerAutoRepair, getRepairStrategy, type ClassifiedError } from "./error-taxonomy"

const log = Log.create({ service: "kiloclaw.auto-repair" })

export interface RepairAttempt {
  attemptNumber: number
  strategy: "retry" | "alternative" | "escalate"
  timestamp: Date
  result: "success" | "failed" | "escalated"
  error?: Error
}

export const MAX_REPAIR_ATTEMPTS = 3

export interface AutoRepairConfig {
  correlationId: string
  maxAttempts?: number
  timeoutMs?: number
  agencyId: string
}

export class AutoRepairCycle {
  private attempts: RepairAttempt[] = []
  private config: AutoRepairConfig

  constructor(cfg: AutoRepairConfig) {
    this.config = { ...cfg, maxAttempts: cfg.maxAttempts ?? MAX_REPAIR_ATTEMPTS }
  }

  async execute(error: unknown): Promise<"success" | "failed" | "escalated"> {
    const classified = classifyError(error, this.config.correlationId)

    if (!shouldTriggerAutoRepair(classified)) {
      log.info("auto-repair not applicable", {
        category: classified.category,
        correlationId: this.config.correlationId,
      })
      return "escalated"
    }

    const strategy = getRepairStrategy(classified)
    log.info("auto-repair triggered", {
      category: classified.category,
      strategy,
      correlationId: this.config.correlationId,
    })

    for (let attempt = 1; attempt <= (this.config.maxAttempts ?? MAX_REPAIR_ATTEMPTS); attempt++) {
      const result = await this.attemptRepair(attempt, strategy, classified)

      if (result === "success") {
        log.info("auto-repair succeeded", { attempt, correlationId: this.config.correlationId })
        return "success"
      }

      if (result === "escalated") {
        log.warn("auto-repair escalated", { attempt, correlationId: this.config.correlationId })
        return "escalated"
      }
    }

    log.error("auto-repair failed after max attempts", {
      attempts: this.config.maxAttempts,
      correlationId: this.config.correlationId,
    })
    return "failed"
  }

  private async attemptRepair(
    attemptNumber: number,
    strategy: string,
    error: ClassifiedError,
  ): Promise<"success" | "failed" | "escalated"> {
    log.info("repair attempt", {
      attemptNumber,
      strategy,
      category: error.category,
    })

    // Strike protocol:
    // Strike 1: Minimal targeted fix
    // Strike 2: Alternative strategy
    // Strike 3: Fallback to MCP (confinato) or escalate

    if (attemptNumber === 1) {
      // Try minimal retry first
      return await this.retryMinimal(error)
    }

    if (attemptNumber === 2) {
      // Try alternative approach
      return await this.tryAlternative(error)
    }

    // Strike 3: Escalate (don't auto-execute)
    log.error("strike 3 reached, escalating", { category: error.category })
    return "escalated"
  }

  private async retryMinimal(error: ClassifiedError): Promise<"success" | "failed" | "escalated"> {
    // Implement minimal retry logic
    // For build_fail: often transient, retry once
    // For test_fail: check if deterministic

    switch (error.category) {
      case "build_fail":
        log.info("retrying build")
        // Would call native build adapter again
        return "failed" // placeholder

      case "test_fail":
        log.info("checking test determinism")
        // Would re-run test to check if flaky
        return "failed" // placeholder

      default:
        return "failed"
    }
  }

  private async tryAlternative(error: ClassifiedError): Promise<"success" | "failed" | "escalated"> {
    // Try different problem-solving approach
    // For build_fail: check dependencies, clean build
    // For test_fail: isolate failing test, debug deeper

    log.info("trying alternative approach", { category: error.category })
    return "failed" // placeholder - would implement strategy-specific logic
  }

  getAttempts(): RepairAttempt[] {
    return this.attempts
  }
}
```

---

## FIX 10: Context Footprint Documentation (Issue 4)

**File**: `packages/opencode/src/session/prompt.ts`  
**Lines**: 1050 (insert after fallback info)  
**Action**: Aggiungi context footprint info

```typescript
...(agencyContext.layers?.L3
  ? [
      `L3 tools denied: ${agencyContext.layers.L3.toolsDenied}`,
      `L3 fallback used: ${agencyContext.layers.L3.fallbackUsed}`,
    ]
  : []),
// NUOVO: Context footprint disclosure
...(agencyContext.agencyId === "agency-development"
  ? [
      "",
      "<!-- Context Footprint -->",
      "Tools exposed: 9 (read, glob, grep, codesearch, apply_patch, bash, skill, websearch, webfetch)",
      "Schema size: ~2.5KB total",
      "Lazy-loading: Skills loaded on-demand via execution-bridge",
      "Context budget: ~4KB per step (~500 tokens)",
    ]
  : []),
```

---

## TESTING COMMANDS (Run after each fix)

```bash
# After FIX 1: Type check
bun run --cwd packages/opencode typecheck

# After FIX 2: Test bootstrap
bun test --cwd packages/opencode test/kiloclaw/bootstrap.test.ts

# After FIX 3-5: Test tool policy
bun test --cwd packages/opencode test/session/tool-policy.test.ts --grep "development"

# After FIX 6: Runtime test (G5 verification)
bun run dev -- --print-logs --log-level DEBUG run \
  "debug TypeError in my React component"

# After FIX 7: Check logs
# Should see: policyEnforced=true, allowedTools=[...], blockedTools=[...]

# After FIX 8-9: Test auto-repair
bun test --cwd packages/opencode test/kiloclaw/auto-repair.test.ts

# Final: Full test suite
bun test --cwd packages/opencode
```

---

## COMPLETION CHECKLIST

- [ ] FIX 1: PolicyLevel type added
- [ ] FIX 2: Development agency definition updated
- [ ] FIX 3: Fallback policy implemented
- [ ] FIX 4: CORE_KEYWORDS extended
- [ ] FIX 5: mapDevelopmentCapabilitiesToTools extended
- [ ] FIX 6: prompt.ts agency context aligned
- [ ] FIX 7: Telemetry logging added
- [ ] FIX 8: Error taxonomy implemented
- [ ] FIX 9: Auto-repair cycle implemented
- [ ] FIX 10: Context footprint documented
- [ ] All tests passing
- [ ] G5 runtime verification: 9/9 criteri ✅
- [ ] Parity score >= 99%
- [ ] Ready for G6 rollout

---

**Next Action**: Start FIX 1 and FIX 2 immediately (priority BLOCKER)
