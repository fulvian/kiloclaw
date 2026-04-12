import { describe, expect, it } from "bun:test"
import { MemoryBrokerV2, MemoryDb } from "@/kiloclaw/memory"
import { tmpdir } from "../fixture/fixture"
import { join } from "path"

const enabled = process.env["KILO_RUN_MEMORY_BENCHMARK"] === "true"

describe("Memory Retrieval Benchmark", () => {
  const run = enabled ? it : it.skip

  run("bench retrieval latency and quality on synthetic set", async () => {
    await using tmp = await tmpdir()
    await MemoryDb.init(join(tmp.path, "benchmark-memory.db"))

    const seed = [
      { s: "project", p: "uses", o: "TypeScript" },
      { s: "project", p: "uses", o: "Bun" },
      { s: "memory", p: "supports", o: "4-layer architecture" },
      { s: "model", p: "embedding", o: "xbai-embed-large" },
      { s: "model", p: "analysis", o: "qwen3.5-30b-a3b" },
      { s: "deployment", p: "mode", o: "production" },
      { s: "security", p: "requires", o: "audit trail" },
      { s: "retention", p: "enforces", o: "ttl and rtbf" },
      { s: "retrieval", p: "uses", o: "hybrid vector metadata" },
      { s: "orchestrator", p: "integrates", o: "memory broker v2" },
    ]

    for (const row of seed) {
      await MemoryBrokerV2.semantic().assert(row.s, row.p, row.o, 90)
    }

    const queries = [
      "what embedding model is used",
      "does memory support four layers",
      "which runtime features are required for production",
      "how retention is enforced",
      "is broker v2 integrated in orchestrator",
    ]

    const latencies: number[] = []
    let hits = 0

    for (const q of queries) {
      const t0 = performance.now()
      const out = await MemoryBrokerV2.retrieve({ query: q, limit: 10 })
      const dt = performance.now() - t0
      latencies.push(dt)

      const txt = JSON.stringify(out.items).toLowerCase()
      if (q.includes("embedding") && txt.includes("xbai")) hits++
      if (q.includes("four") && txt.includes("4-layer")) hits++
      if (q.includes("retention") && txt.includes("ttl")) hits++
      if (q.includes("orchestrator") && txt.includes("orchestrator")) hits++
      if (q.includes("production") && txt.includes("production")) hits++
    }

    latencies.sort((a, b) => a - b)
    const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
    const quality = hits / queries.length

    // targets for local benchmark mode
    expect(p95).toBeLessThan(800)
    expect(quality).toBeGreaterThanOrEqual(0.6)

    await MemoryDb.close()
  })
})
