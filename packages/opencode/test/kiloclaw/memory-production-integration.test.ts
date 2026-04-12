import { describe, it } from "bun:test"
import { MemoryConsolidation, MemoryShadow } from "@/kiloclaw/memory"

const enabled = process.env["KILO_RUN_MEMORY_BENCHMARK"] === "true"

describe("Memory production integration", () => {
  const run = enabled ? it : it.skip

  run("runs consolidation job", async () => {
    await MemoryConsolidation.run({ limit: 10 })
  })

  run("runs shadow comparison", async () => {
    await MemoryShadow.compare("embedding model memory", 10)
  })
})
