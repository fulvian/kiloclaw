import { describe, it, expect } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "../fixture/fixture"
import { AuditStore } from "../../src/kiloclaw/audit/store"
import { MemoryBroker, MemoryLifecycle, SemanticMemory, ProceduralMemory } from "@/kiloclaw/memory"
import { MemoryIdFactory } from "@/kiloclaw/memory"
import { WebResearchSkill, LiteratureReviewSkill } from "@/kiloclaw/skills"
import { RetentionJob } from "../../src/kiloclaw/memory/jobs/retention"
import { MemoryRanker } from "../../src/kiloclaw/memory/retrieval/ranker"
import type { WebResearchOutput } from "../../src/kiloclaw/skills/knowledge/web-research"
import type { LiteratureReviewOutput } from "../../src/kiloclaw/skills/knowledge/literature-review"
import type { MemoryEntry } from "../../src/kiloclaw/memory/types"

const SKILL_CONTEXT = {
  correlationId: "corr-skill" as import("@/kiloclaw/types").CorrelationId,
  agencyId: "agency-knowledge",
  skillId: "web-research",
}

async function withMockFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = impl
  try {
    return await run()
  } finally {
    globalThis.fetch = original
  }
}

describe("durability and recovery", () => {
  it("persists append-only audit entries across re-instantiation", async () => {
    await using tmp = await tmpdir()
    const path = join(tmp.path, "audit.jsonl")

    const store1 = AuditStore.create({ path })
    store1.append({
      correlationId: "corr-1",
      event: "policy.decision",
      payload: { allowed: true },
    })

    const store2 = AuditStore.create({ path })
    const byCorr = store2.byCorrelation({ correlationId: "corr-1" })
    const byEvent = store2.byEvent({ event: "policy.decision" })

    expect(byCorr.length).toBe(1)
    expect(byEvent.length).toBe(1)
  })

  it("purges working memory entries and reports semantic/procedural stats", async () => {
    const entryId = MemoryIdFactory.create()
    await MemoryBroker.write({
      id: entryId,
      layer: "working",
      key: "durable:key",
      value: { ok: true },
      sensitivity: "medium",
      category: "session",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const before = await MemoryBroker.read({ layer: "working", keys: ["durable:key"], limit: 1 })
    expect(before.length).toBe(1)

    await MemoryBroker.purge(entryId, "manual")
    const after = await MemoryBroker.read({ layer: "working", keys: ["durable:key"], limit: 1 })
    expect(after.length).toBe(0)

    await SemanticMemory.assert({
      subject: "stats",
      predicate: "value",
      object: 1,
      confidence: 1,
      source: "test",
    })

    await ProceduralMemory.register({
      name: "stats-proc",
      description: "stats",
      version: "1.0.0",
      steps: [{ id: "1", action: "noop" }],
    })

    await ProceduralMemory.registerPattern({
      skillId: "skill-stats" as import("@/kiloclaw/types").SkillId,
      name: "pattern",
      description: "pattern",
      steps: ["a"],
      usageCount: 0,
      successRate: 0,
    })

    const stats = await MemoryLifecycle.getStats()
    expect(stats.semantic.totalFacts).toBeGreaterThan(0)
    expect(stats.procedural.totalPatterns).toBeGreaterThan(0)
  })

  it("returns citations from knowledge skills and handles offline fetch", async () => {
    await withMockFetch(
      (async (url: string | URL | Request) => {
        const raw = String(url)
        if (raw.includes("wikipedia.org/w/api.php")) {
          return new Response(
            JSON.stringify([
              "topic",
              ["TypeScript"],
              ["Typed JavaScript language"],
              ["https://en.wikipedia.org/wiki/TypeScript"],
            ]),
            { status: 200 },
          )
        }

        if (raw.includes("export.arxiv.org")) {
          return new Response(
            `<?xml version="1.0"?><feed><entry><id>https://arxiv.org/abs/1234.5678</id><title>Test Paper</title><summary>Paper abstract.</summary><published>2024-01-01T00:00:00Z</published><author><name>Alice</name></author></entry></feed>`,
            { status: 200 },
          )
        }

        return new Response("not found", { status: 404 })
      }) as unknown as typeof fetch,
      async () => {
        const web = (await WebResearchSkill.execute(
          { query: "TypeScript", sources: 2 },
          SKILL_CONTEXT,
        )) as WebResearchOutput
        expect(web.citations.length).toBeGreaterThan(0)
        expect(web.results.length).toBeGreaterThan(0)
        const firstWeb = web.results.at(0)
        expect(firstWeb).toBeDefined()
        if (!firstWeb) throw new Error("expected first web result")
        expect(firstWeb.title.includes("mock")).toBe(false)

        const lit = (await LiteratureReviewSkill.execute(
          { topic: "TypeScript", count: 2 },
          SKILL_CONTEXT,
        )) as LiteratureReviewOutput
        expect(lit.citations.length).toBeGreaterThan(0)
        expect(lit.papers.length).toBeGreaterThan(0)
        const firstPaper = lit.papers.at(0)
        expect(firstPaper).toBeDefined()
        if (!firstPaper) throw new Error("expected first literature paper")
        expect(firstPaper.title.includes("mock")).toBe(false)
      },
    )

    await withMockFetch((async () => new Response("offline", { status: 503 })) as unknown as typeof fetch, async () => {
      const web = (await WebResearchSkill.execute({ query: "offline", sources: 2 }, SKILL_CONTEXT)) as WebResearchOutput
      const lit = (await LiteratureReviewSkill.execute(
        { topic: "offline", count: 2 },
        SKILL_CONTEXT,
      )) as LiteratureReviewOutput
      expect(web.results.length).toBeGreaterThan(0)
      expect(web.citations.length).toBeGreaterThan(0)
      expect(lit.papers.length).toBeGreaterThan(0)
      expect(lit.citations.length).toBeGreaterThan(0)
    })
  })

  it("runs retention job and returns summary without throwing", async () => {
    const now = Date.now()
    const rows: MemoryEntry[] = [
      {
        id: "mem-old" as import("@/kiloclaw/memory/types").MemoryId,
        layer: "working",
        key: "old",
        value: { old: true },
        sensitivity: "low",
        category: "session",
        createdAt: new Date(now - 20_000).toISOString(),
        updatedAt: new Date(now - 20_000).toISOString(),
      },
      {
        id: "mem-new" as import("@/kiloclaw/memory/types").MemoryId,
        layer: "semantic",
        key: "new",
        value: { new: true },
        sensitivity: "low",
        category: "session",
        createdAt: new Date(now).toISOString(),
        updatedAt: new Date(now).toISOString(),
      },
    ]

    const purged: string[] = []
    const summary = await RetentionJob.run({
      broker: {
        async read() {
          return rows
        },
        async purge(id) {
          purged.push(id)
        },
      },
      lifecycle: {
        applyRetentionPolicy(layer) {
          if (layer === "working") {
            return {
              layer,
              ttlMs: 1_000,
              encryption: "none",
              compress: false,
            }
          }
          return {
            layer,
            encryption: "standard",
            compress: false,
          }
        },
      },
      now,
    })

    expect(summary.failed).toBe(0)
    expect(summary.scanned).toBe(2)
    expect(summary.purged).toBe(1)
    expect(purged).toEqual(["mem-old"])
  })

  it("orders memory ranker output deterministically", () => {
    const now = Date.now()
    const entries: MemoryEntry[] = [
      {
        id: "mem-1" as import("@/kiloclaw/memory/types").MemoryId,
        layer: "working",
        key: "alpha:recent",
        value: { text: "alpha hit" },
        sensitivity: "low",
        category: "session",
        createdAt: new Date(now - 1000).toISOString(),
        updatedAt: new Date(now - 1000).toISOString(),
        metadata: { confidence: 0.9, source: "unit" },
      },
      {
        id: "mem-2" as import("@/kiloclaw/memory/types").MemoryId,
        layer: "working",
        key: "beta:mid",
        value: { text: "beta" },
        sensitivity: "medium",
        category: "session",
        createdAt: new Date(now - 5000).toISOString(),
        updatedAt: new Date(now - 5000).toISOString(),
        metadata: { confidence: 0.5 },
      },
      {
        id: "mem-3" as import("@/kiloclaw/memory/types").MemoryId,
        layer: "working",
        key: "alpha:old",
        value: { text: "alpha old" },
        sensitivity: "high",
        category: "session",
        createdAt: new Date(now - 15_000).toISOString(),
        updatedAt: new Date(now - 15_000).toISOString(),
      },
    ]

    const first = MemoryRanker.rank({ entries, query: "alpha", now })
    const second = MemoryRanker.rank({ entries, query: "alpha", now })

    expect(first.map((x) => x.entry.id)).toEqual(second.map((x) => x.entry.id))
    expect(String(first[0]?.entry.id)).toBe("mem-1")
    expect(String(first[2]?.entry.id)).toBe("mem-2")
  })
})
