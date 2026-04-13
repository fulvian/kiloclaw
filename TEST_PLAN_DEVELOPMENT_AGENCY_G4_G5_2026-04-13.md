# TEST PLAN - Development Agency G4/G5 Verification

**Date**: 2026-04-13  
**Scope**: Comprehensive testing for development agency gate compliance  
**Target**: 9/9 runtime verification criteria + parity >= 99%

---

## PHASE 1: UNIT TESTS (Per-fix validation)

### Test 1.1: PolicyLevel Type Definition

**File**: `packages/opencode/test/kiloclaw/policy-level.test.ts` (NEW)

```typescript
import { describe, it, expect } from "bun:test"
import { PolicyLevel, enforcePolicy, isMoreRestrictive, PolicyLevelOrder } from "@/kiloclaw/agency/types"

describe("PolicyLevel", () => {
  it("defines all policy levels", () => {
    const levels: PolicyLevel[] = ["SAFE", "NOTIFY", "CONFIRM", "HITL", "DENY"]
    expect(levels.length).toBe(5)
  })

  it("enforcePolicy maps levels to decisions correctly", () => {
    expect(enforcePolicy("SAFE", false)).toBe("allow")
    expect(enforcePolicy("NOTIFY", false)).toBe("notify")
    expect(enforcePolicy("CONFIRM", false)).toBe("confirm")
    expect(enforcePolicy("HITL", false)).toBe("deny")
    expect(enforcePolicy("DENY", false)).toBe("deny")
  })

  it("enforcePolicy denies when requiresApproval=true", () => {
    expect(enforcePolicy("SAFE", true)).toBe("deny")
    expect(enforcePolicy("NOTIFY", true)).toBe("deny")
  })

  it("isMoreRestrictive works correctly", () => {
    expect(isMoreRestrictive("DENY", "SAFE")).toBe(true)
    expect(isMoreRestrictive("HITL", "CONFIRM")).toBe(true)
    expect(isMoreRestrictive("SAFE", "DENY")).toBe(false)
  })

  it("PolicyLevelOrder values increase monotonically", () => {
    const values = Object.values(PolicyLevelOrder)
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThanOrEqual(values[i - 1])
    }
  })
})
```

**Run**: `bun test packages/opencode/test/kiloclaw/policy-level.test.ts`

---

### Test 1.2: Development Agency Definition

**File**: `packages/opencode/test/kiloclaw/agency/development-agency.test.ts` (NEW)

```typescript
import { describe, it, expect } from "bun:test"
import { AgencyRegistry } from "@/kiloclaw/agency/registry/agency-registry"
import { bootstrapRegistries } from "@/kiloclaw/agency/bootstrap"

describe("Development Agency Definition", () => {
  beforeEach(() => {
    bootstrapRegistries()
  })

  it("registers development agency", () => {
    const agency = AgencyRegistry.getAgency("agency-development")
    expect(agency).toBeDefined()
    expect(agency?.id).toBe("agency-development")
    expect(agency?.domain).toBe("development")
  })

  it("has non-empty providers list", () => {
    const agency = AgencyRegistry.getAgency("agency-development")
    expect(agency?.providers).toBeDefined()
    expect(agency!.providers.length).toBeGreaterThan(0)
    expect(agency!.providers).toContain("native")
  })

  it("has policyMapping defined", () => {
    const agency = AgencyRegistry.getAgency("agency-development")
    expect(agency?.metadata?.contextFootprint).toBeDefined()
    const policyMapping = (agency?.policies as any)?.policyMapping
    expect(policyMapping).toBeDefined()
    expect(policyMapping?.["read"]).toBe("SAFE")
    expect(policyMapping?.["bash"]).toBe("NOTIFY")
  })

  it("denies destructive capabilities", () => {
    const agency = AgencyRegistry.getAgency("agency-development")
    expect(agency?.policies.deniedCapabilities).toContain("destructive_git")
    expect(agency?.policies.deniedCapabilities).toContain("secret_export")
  })

  it("has context footprint metadata", () => {
    const agency = AgencyRegistry.getAgency("agency-development")
    const footprint = agency?.metadata?.contextFootprint
    expect(footprint?.toolsExposed).toBe(9)
    expect(footprint?.schemaSizeEstimate).toBeDefined()
    expect(footprint?.lazyLoadingStrategy).toBeDefined()
    expect(footprint?.budgetContextPerStep).toBeDefined()
  })
})
```

**Run**: `bun test packages/opencode/test/kiloclaw/agency/development-agency.test.ts`

---

### Test 1.3: Fallback Policy Framework

**File**: `packages/opencode/test/kiloclaw/fallback-policy.test.ts` (NEW)

```typescript
import { describe, it, expect } from "bun:test"
import { decideFallback, FallbackInput } from "@/kiloclaw/tooling/native/fallback-policy"

describe("Fallback Policy", () => {
  it("always denies when policy is DENY", () => {
    const input: FallbackInput = {
      nativeAvailable: true,
      capability: "some_cap",
      policyLevel: "DENY",
      isDestructive: false,
    }
    expect(decideFallback(input)).toBe("deny")
  })

  it("uses native when available and healthy", () => {
    const input: FallbackInput = {
      nativeAvailable: true,
      nativeError: null,
      capability: "read",
      policyLevel: "SAFE",
      isDestructive: false,
    }
    expect(decideFallback(input)).toBe("native")
  })

  it("denies destructive operations even with policy SAFE", () => {
    const input: FallbackInput = {
      nativeAvailable: true,
      capability: "git_reset",
      policyLevel: "SAFE",
      isDestructive: true,
    }
    expect(decideFallback(input)).toBe("deny")
  })

  it("retries on transient errors", () => {
    const input: FallbackInput = {
      nativeAvailable: false,
      nativeError: new Error("TIMEOUT: operation timed out"),
      retryCount: 0,
      capability: "build",
      policyLevel: "NOTIFY",
      isDestructive: false,
    }
    expect(decideFallback(input)).toBe("native") // Will retry
  })

  it("falls back to MCP on permanent error with SAFE policy", () => {
    const input: FallbackInput = {
      nativeAvailable: false,
      nativeError: new Error("File not found"),
      retryCount: 2,
      capability: "read",
      policyLevel: "SAFE",
      isDestructive: false,
    }
    expect(decideFallback(input)).toBe("mcp")
  })

  it("denies MCP fallback for CONFIRM policy errors", () => {
    const input: FallbackInput = {
      nativeAvailable: false,
      nativeError: new Error("Unknown error"),
      retryCount: 2,
      capability: "apply_patch",
      policyLevel: "CONFIRM",
      isDestructive: false,
    }
    expect(decideFallback(input)).toBe("deny")
  })
})
```

**Run**: `bun test packages/opencode/test/kiloclaw/fallback-policy.test.ts`

---

### Test 1.4: Tool Policy Development Mapping

**File**: `packages/opencode/test/session/tool-policy-development.test.ts` (NEW)

```typescript
import { describe, it, expect } from "bun:test"
import {
  mapDevelopmentCapabilitiesToTools,
  DEVELOPMENT_TOOL_ALLOWLIST,
  DEVELOPMENT_TOOL_POLICY_LEVELS,
} from "@/session/tool-policy"

describe("Development Tool Policy Mapping", () => {
  it("maps coding capability to read/glob/grep/codesearch", () => {
    const result = mapDevelopmentCapabilitiesToTools(["coding"])
    expect(result).toContain("read")
    expect(result).toContain("glob")
    expect(result).toContain("grep")
    expect(result).toContain("codesearch")
    expect(result).not.toContain("websearch") // Should not include search tools
  })

  it("maps debugging capability to bash/read/glob", () => {
    const result = mapDevelopmentCapabilitiesToTools(["debugging"])
    expect(result).toContain("bash")
    expect(result).toContain("read")
    expect(result).toContain("glob")
  })

  it("maps testing capability to bash/read/glob (no patch)", () => {
    const result = mapDevelopmentCapabilitiesToTools(["testing"])
    expect(result).toContain("bash")
    expect(result).toContain("read")
    expect(result).not.toContain("apply_patch")
  })

  it("includes all tools in allowlist", () => {
    const expectedTools = ["read", "glob", "grep", "apply_patch", "bash", "skill", "codesearch"]
    for (const tool of expectedTools) {
      expect(DEVELOPMENT_TOOL_ALLOWLIST).toContain(tool)
    }
  })

  it("has policy level for every tool", () => {
    for (const tool of DEVELOPMENT_TOOL_ALLOWLIST) {
      expect(DEVELOPMENT_TOOL_POLICY_LEVELS[tool]).toBeDefined()
    }
  })

  it("read-only tools are SAFE", () => {
    expect(DEVELOPMENT_TOOL_POLICY_LEVELS["read"]).toBe("SAFE")
    expect(DEVELOPMENT_TOOL_POLICY_LEVELS["glob"]).toBe("SAFE")
    expect(DEVELOPMENT_TOOL_POLICY_LEVELS["grep"]).toBe("SAFE")
    expect(DEVELOPMENT_TOOL_POLICY_LEVELS["codesearch"]).toBe("SAFE")
  })

  it("write tools are NOTIFY or higher", () => {
    expect(DEVELOPMENT_TOOL_POLICY_LEVELS["apply_patch"]).toBe("NOTIFY")
    expect(DEVELOPMENT_TOOL_POLICY_LEVELS["bash"]).toBe("NOTIFY")
  })
})
```

**Run**: `bun test packages/opencode/test/session/tool-policy-development.test.ts`

---

### Test 1.5: Error Taxonomy

**File**: `packages/opencode/test/kiloclaw/error-taxonomy.test.ts` (NEW)

```typescript
import { describe, it, expect } from "bun:test"
import { classifyError, shouldTriggerAutoRepair, getRepairStrategy } from "@/kiloclaw/runtime/error-taxonomy"

describe("Error Taxonomy", () => {
  const correlationId = "test-123"

  it("classifies build failures", () => {
    const err = new Error("Failed to compile TypeScript: build")
    const classified = classifyError(err, correlationId)
    expect(classified.category).toBe("build_fail")
    expect(classified.severity).toBe("high")
  })

  it("classifies test failures", () => {
    const err = new Error("Assertion failed: test expected 5 but got 3")
    const classified = classifyError(err, correlationId)
    expect(classified.category).toBe("test_fail")
  })

  it("classifies policy blocks", () => {
    const err = new Error("Operation denied by policy")
    const classified = classifyError(err, correlationId)
    expect(classified.category).toBe("policy_block")
  })

  it("triggers auto-repair for build failures", () => {
    const err = new Error("build failed")
    const classified = classifyError(err, correlationId)
    expect(shouldTriggerAutoRepair(classified)).toBe(true)
  })

  it("does not trigger auto-repair for critical errors", () => {
    const err = new Error("critical security failure")
    const classified = { ...classifyError(err, correlationId), severity: "critical" as const }
    expect(shouldTriggerAutoRepair(classified)).toBe(false)
  })

  it("returns repair strategy for build failures", () => {
    const err = new Error("build failed")
    const classified = classifyError(err, correlationId)
    expect(getRepairStrategy(classified)).toBe("retry")
  })

  it("escalates policy blocks", () => {
    const err = new Error("policy blocked")
    const classified = classifyError(err, correlationId)
    expect(getRepairStrategy(classified)).toBe("escalate")
  })
})
```

**Run**: `bun test packages/opencode/test/kiloclaw/error-taxonomy.test.ts`

---

## PHASE 2: INTEGRATION TESTS (End-to-end routing)

### Test 2.1: Development Routing End-to-End

**File**: `packages/opencode/test/kiloclaw/agency/development-routing.test.ts` (UPDATE)

```typescript
import { describe, it, expect } from "bun:test"
import { HybridRouter } from "@/kiloclaw/agency/routing/semantic/hybrid-router"
import { bootstrapRegistries, resetBootstrap } from "@/kiloclaw/agency/bootstrap"
import { bootstrapAllCapabilities } from "@/kiloclaw/agency/routing/semantic/bootstrap"
import type { Intent } from "@/kiloclaw/types"

describe("Development Agency Routing", () => {
  beforeEach(() => {
    resetBootstrap()
    bootstrapRegistries()
    bootstrapAllCapabilities()
    HybridRouter.reset()
  })

  it("routes development query to agency-development", async () => {
    const router = HybridRouter.create()
    const intent: Intent = {
      id: "test-dev-1",
      type: "code",
      description: "debug TypeError in my React component",
      risk: "low",
    }

    const result = await router.route(intent)
    expect(result.agencyId).toBe("agency-development")
    expect(result.confidence).toBeGreaterThanOrEqual(0.4)
  })

  it("routes error query to agency-development", async () => {
    const router = HybridRouter.create()
    const intent: Intent = {
      id: "test-dev-error",
      type: "bug",
      description: "fix error in my code",
      risk: "low",
    }

    const result = await router.route(intent)
    expect(result.agencyId).toBe("agency-development")
  })

  it("routes build query to agency-development", async () => {
    const router = HybridRouter.create()
    const intent: Intent = {
      id: "test-dev-build",
      type: "build",
      description: "my npm build is failing",
      risk: "medium",
    }

    const result = await router.route(intent)
    expect(result.agencyId).toBe("agency-development")
  })

  it("includes capabilities in routing decision", async () => {
    const router = HybridRouter.create()
    const intent: Intent = {
      id: "test-dev-capabilities",
      type: "code",
      description: "refactor my TypeScript code",
      risk: "low",
    }

    const result = await router.route(intent)
    // Result should include capability inference
    expect(result.layers?.L1?.capabilities).toBeDefined()
  })

  it("rejects development query for other agencies", async () => {
    const router = HybridRouter.create()
    const intent: Intent = {
      id: "test-weather",
      type: "query",
      description: "what is the weather tomorrow",
      risk: "low",
    }

    const result = await router.route(intent)
    expect(result.agencyId).not.toBe("agency-development")
  })
})
```

**Run**: `bun test packages/opencode/test/kiloclaw/agency/development-routing.test.ts`

---

### Test 2.2: Tool Policy Enforcement in Session

**File**: `packages/opencode/test/session/tool-policy-enforcement.test.ts` (NEW)

```typescript
import { describe, it, expect } from "bun:test"
import { resolveAgencyAllowedTools, getAgencyCanonicalToolIds } from "@/session/tool-policy"

describe("Tool Policy Enforcement", () => {
  it("returns allowed tools for development agency", () => {
    const result = resolveAgencyAllowedTools({
      agencyId: "agency-development",
      enabled: true,
      capabilities: ["coding", "debugging"],
    })

    expect(result.enabled).toBe(true)
    expect(result.allowedTools).toContain("read")
    expect(result.allowedTools).toContain("bash")
  })

  it("excludes websearch from development agency", () => {
    const result = resolveAgencyAllowedTools({
      agencyId: "agency-development",
      enabled: true,
      capabilities: ["coding"],
    })

    // websearch should not be in the base allowlist for development
    // (it may be added dynamically, but core development should not include it)
    const coreAllowed = getAgencyCanonicalToolIds("agency-development")
    expect(coreAllowed).not.toContain("websearch")
  })

  it("returns empty allowlist when disabled", () => {
    const result = resolveAgencyAllowedTools({
      agencyId: "agency-development",
      enabled: false,
      capabilities: ["coding"],
    })

    expect(result.enabled).toBe(false)
    expect(result.allowedTools.length).toBe(0)
  })

  it("maps all development capabilities to tools", () => {
    const capabilities = ["coding", "debugging", "testing", "refactoring", "planning"]
    const result = resolveAgencyAllowedTools({
      agencyId: "agency-development",
      enabled: true,
      capabilities,
    })

    expect(result.allowedTools.length).toBeGreaterThan(0)
    // Each capability should map to at least one tool
  })
})
```

**Run**: `bun test packages/opencode/test/session/tool-policy-enforcement.test.ts`

---

## PHASE 3: RUNTIME VERIFICATION (G5 Criteria)

### Test 3.1: Runtime Logging Verification

**Command**: Run development agency query and verify 9/9 criteria

```bash
# Full runtime test with debug logging
bun run dev -- --print-logs --log-level DEBUG run \
  "debug TypeError in my React component" 2>&1 | tee /tmp/dev-agency-runtime.log

# Verify each criterion
echo "=== CRITERION 1: Agency routed ==="
grep "agencyId=agency-development" /tmp/dev-agency-runtime.log && echo "✅ PASS" || echo "❌ FAIL"

echo "=== CRITERION 2: Confidence >= 40% ==="
grep -oP "confidence=0\.\d+" /tmp/dev-agency-runtime.log | awk -F= '{if ($2 >= 0.4) print "✅ PASS"; else print "❌ FAIL"}' | head -1

echo "=== CRITERION 3: Policy applied ==="
grep "allowedTools=\[" /tmp/dev-agency-runtime.log && grep "blockedTools=\[" /tmp/dev-agency-runtime.log && echo "✅ PASS" || echo "❌ FAIL"

echo "=== CRITERION 4: Policy enforced ==="
grep "policyEnforced=true" /tmp/dev-agency-runtime.log && echo "✅ PASS" || echo "❌ FAIL"

echo "=== CRITERION 5: Only allowed tools ==="
grep "allowedTools=\[read,glob,grep,apply_patch,bash,skill,codesearch" /tmp/dev-agency-runtime.log && echo "✅ PASS" || echo "❌ FAIL"

echo "=== CRITERION 6: Blocked tools not invoked ==="
! grep -E "(websearch|webfetch) called|invoked" /tmp/dev-agency-runtime.log && echo "✅ PASS" || echo "❌ FAIL"

echo "=== CRITERION 7: Capabilities correct ==="
grep "capabilities=\[" /tmp/dev-agency-runtime.log | grep -E "(coding|debugging)" && echo "✅ PASS" || echo "❌ FAIL"

echo "=== CRITERION 8: No tool resolution error ==="
! grep "no tools resolved" /tmp/dev-agency-runtime.log && echo "✅ PASS" || echo "❌ FAIL"

echo "=== CRITERION 9: Fallback not used ==="
grep "L3.fallbackUsed=false" /tmp/dev-agency-runtime.log && echo "✅ PASS" || echo "❌ FAIL"
```

---

### Test 3.2: Parity Testing (vs. baseline)

**Command**: Compare development agency behavior against reference behaviors

```bash
# Create baseline test cases
cat > /tmp/dev-parity-tests.txt << 'EOF'
"debug error in my code" -> agency-development
"fix bug in TypeScript" -> agency-development
"review my code" -> agency-development
"test my function" -> agency-development
"refactor this code" -> agency-development
"what is the weather" -> NOT agency-development
"search the web" -> NOT agency-development
EOF

# Run each test case
while IFS= read -r line; do
  query=$(echo "$line" | cut -d'-' -f1 | tr -d '"' | xargs)
  expected=$(echo "$line" | cut -d'>' -f2 | xargs)

  echo "Testing: $query => $expected"
  bun run dev -- --log-level ERROR run "$query" 2>&1 | \
    grep -q "agencyId=$expected" && echo "✅ PASS" || echo "❌ FAIL"
done < /tmp/dev-parity-tests.txt
```

---

## PHASE 4: COMPREHENSIVE TEST SUITE

### Execute all tests in order

```bash
# 1. Type checking
echo "=== TypeCheck ==="
bun run --cwd packages/opencode typecheck

# 2. Unit tests (Phase 1)
echo "=== Unit Tests ==="
bun test packages/opencode/test/kiloclaw/policy-level.test.ts
bun test packages/opencode/test/kiloclaw/agency/development-agency.test.ts
bun test packages/opencode/test/kiloclaw/fallback-policy.test.ts
bun test packages/opencode/test/session/tool-policy-development.test.ts
bun test packages/opencode/test/kiloclaw/error-taxonomy.test.ts

# 3. Integration tests (Phase 2)
echo "=== Integration Tests ==="
bun test packages/opencode/test/kiloclaw/agency/development-routing.test.ts
bun test packages/opencode/test/session/tool-policy-enforcement.test.ts

# 4. Full test suite
echo "=== Full Test Suite ==="
bun test --cwd packages/opencode

# 5. Runtime verification (Phase 3)
echo "=== Runtime Verification ==="
bun run dev -- --print-logs --log-level DEBUG run "debug my code" 2>&1 | tee /tmp/final-runtime.log

# 6. Verify all 9/9 criteria
echo "=== Verifying 9/9 Criteria ==="
# (See Test 3.1 above for detailed verification)
```

---

## SUCCESS CRITERIA

✅ **ALL TESTS MUST PASS BEFORE G5 SIGN-OFF**

```
Unit Tests:           6/6 PASS (policy-level, agency-def, fallback, tool-policy, error-taxonomy)
Integration Tests:    2/2 PASS (routing, enforcement)
Runtime Verification: 9/9 PASS (all criteria met)
Full Suite:           0 failures
```

---

## TEST EXECUTION SCHEDULE

| Phase | Tests       | Est. Time | Owner | Deadline |
| ----- | ----------- | --------- | ----- | -------- |
| 1     | Unit        | 2 hours   | Dev   | Wed      |
| 2     | Integration | 1 hour    | Dev   | Wed      |
| 3     | Runtime     | 1 hour    | QA    | Thu      |
| 4     | Suite       | 1 hour    | QA    | Fri      |

---

## TEST FAILURE PROTOCOL

If ANY test fails:

1. **Classify** the failure (unit/integration/runtime)
2. **Root cause** analysis (use systematic-debugging skill)
3. **Fix** the code (apply remediation FIX #N)
4. **Retest** single failing test
5. **Retest** entire suite to ensure no regression
6. **Document** the failure and fix in test notes

**Do NOT proceed to next phase until all tests pass.**

---

**Next Action**: Execute Phase 1 unit tests after implementing FIX 1-5.
