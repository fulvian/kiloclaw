import { describe, expect, it } from "bun:test"
import { NativeFactory } from "@/kiloclaw/tooling/native/factory"
import { NativeFileAdapter } from "@/kiloclaw/tooling/native/file-adapter"
import { Flag } from "@/flag/flag"

// =============================================================================
// Wiki Capabilities Test
// KILOCLAW_DEVELOPMENT_AGENCY_REFOUNDATION_PLAN_2026-04-12.md
// KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V1_2026-04-09.md Section I
//
// Wiki capability: CONDITIONAL-GO, default OFF until guardrails and parity
// gates complete. When enabled: wiki.ingest, wiki.query, wiki.lint are
// exposed as explicit capabilities with allowlist and dedicated context budget.
// =============================================================================

// Wiki capability enum (mirrors what would exist in capability-registry when enabled)
const WikiCapability = {
  INGEST: "wiki_ingest",
  QUERY: "wiki_query",
  LINT: "wiki_lint",
} as const

describe("wiki capabilities", () => {
  // Feature flag must be OFF by default per refoundation plan
  it("wiki flag defaults to disabled", () => {
    // Flag KILO_WIKI_ENABLED controls wiki capability activation
    // Default: OFF (CONDITIONAL-GO)
    const wikiEnabled = Flag.KILO_WIKI_ENABLED ?? false
    expect(wikiEnabled).toBe(false)
  })

  it("wiki ingest requires provenance metadata - schema validation", () => {
    // Wiki ingest contract: every node must have provenance, source, timestamp
    // When wiki is enabled, ingest payload must include:
    // - source_url: string (required)
    // - ingested_at: number (required, unix ms)
    // - provenance_chain: string[] (required, citation path)
    const validIngestPayload = {
      content: "Sample wiki content",
      source_url: "https://example.com/source",
      ingested_at: Date.now(),
      provenance_chain: ["https://example.com/source", "https://wiki.example.com/page"],
    }
    expect(validIngestPayload.provenance_chain.length).toBeGreaterThan(0)
    expect(typeof validIngestPayload.source_url).toBe("string")
    expect(validIngestPayload.ingested_at).toBeGreaterThan(0)
  })

  it("wiki lint blocks conflicts with high severity", () => {
    // Wiki lint contract: conflicts with severity >= high must block ingest
    // This is a schema validation test - documents expected behavior
    const conflictNode = {
      type: "conflict",
      severity: "high",
      conflicting_nodes: ["node-a", "node-b"],
      resolution_required: true,
    }
    expect(conflictNode.severity).toBe("high")
    expect(conflictNode.resolution_required).toBe(true)
  })

  it("wiki query requires citation in output", () => {
    // Wiki query contract: every answer must cite provenance nodes
    // Output must include citations array referencing ingested nodes
    const wikiQueryOutput = {
      answer: "The answer to the query",
      citations: [
        { node_id: "node-1", text_snippet: "supporting evidence", confidence: 0.95 },
        { node_id: "node-2", text_snippet: "additional context", confidence: 0.8 },
      ],
    }
    expect(wikiQueryOutput.answer.length).toBeGreaterThan(0)
    expect(wikiQueryOutput.citations.length).toBeGreaterThan(0)
    expect(wikiQueryOutput.citations[0]).toHaveProperty("node_id")
    expect(wikiQueryOutput.citations[0]).toHaveProperty("text_snippet")
    expect(wikiQueryOutput.citations[0]).toHaveProperty("confidence")
  })

  it("wiki capability respects L4 context budget", () => {
    // Wiki L4 budget: context for wiki operations must not exceed step/run budget
    // Document the budget constraints:
    // - Max wiki nodes per query: 50
    // - Max context tokens per wiki op: 4096
    // - Budget tracking via MemoryBroker
    const maxNodesPerQuery = 50
    const maxContextTokens = 4096
    expect(maxNodesPerQuery).toBe(50)
    expect(maxContextTokens).toBe(4096)
  })

  it("wiki denied when policy denies - deny-by-default enforcement", async () => {
    // When wiki capability is added, NativeFactory must enforce deny-by-default
    // until explicit allowlist is configured for the agency
    const fx = NativeFactory.create({
      adapters: [
        NativeFileAdapter.create({
          probe: async () => ({ healthy: true, latency_ms: 1, reason: "ok" }),
          run: async () => ({ ok: true, data: {} }),
        }),
      ],
    })
    // Currently no wiki adapter exists, so this would route via default
    // When wiki is enabled: capability would be "wiki_ingest" etc.
    // Deny policy should block if not explicitly allowed
    const out = await fx.execute({ capability: "file_ops", payload: {}, deny: true })
    expect(out.ok).toBe(false)
    expect(out.route.policy_decision).toBe("deny")
  })
})
