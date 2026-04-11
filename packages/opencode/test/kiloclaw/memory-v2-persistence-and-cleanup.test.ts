import { afterEach, describe, expect, it } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "../fixture/fixture"
import { CoreOrchestrator } from "@/kiloclaw/orchestrator"
import {
  EpisodicMemoryRepo,
  MemoryDb,
  MemoryLifecycle,
  MemoryState,
  ProceduralMemoryRepo,
  SemanticMemoryRepo,
  WorkingMemoryRepo,
  memoryShutdown,
} from "@/kiloclaw/memory"

describe("memory v2 persistence and cleanup", () => {
  afterEach(async () => {
    await memoryShutdown().catch(() => {})
  })

  it("CoreOrchestrator.memory persists working values across restart when v2 is enabled", async () => {
    if (!MemoryDb.isEnabled()) return

    await using tmp = await tmpdir()
    const dbPath = join(tmp.path, "orchestrator-memory-v2.db")

    await MemoryDb.init(dbPath)
    const first = CoreOrchestrator.create({})
    await first.memory().write("orchestrator:persist:key", { value: "persisted" })

    MemoryDb.close()
    await MemoryDb.init(dbPath)

    const second = CoreOrchestrator.create({})
    const restored = await second.memory().read("orchestrator:persist:key")
    expect(restored).toEqual({ value: "persisted" })
  })

  it("MemoryLifecycle.getStats reports persistent repository counts when v2 is enabled", async () => {
    if (!MemoryDb.isEnabled()) return

    await using tmp = await tmpdir()
    const dbPath = join(tmp.path, "lifecycle-stats-v2.db")
    const now = Date.now()

    await MemoryDb.init(dbPath)
    await WorkingMemoryRepo.set("default", "stats:key", { ok: true })
    await EpisodicMemoryRepo.recordEvent({
      id: `ev_${crypto.randomUUID()}`,
      tenant_id: "default",
      event_type: "stats_event",
      payload: { ok: true },
      sensitivity: "medium",
      ts: now,
      created_at: now,
    })
    await EpisodicMemoryRepo.recordEpisode({
      id: `ep_${crypto.randomUUID()}`,
      tenant_id: "default",
      task_description: "stats episode",
      outcome: "success",
      started_at: now,
      completed_at: now,
      created_at: now,
    })
    await SemanticMemoryRepo.assertFact({
      id: `fact_${crypto.randomUUID()}`,
      tenant_id: "default",
      subject: "stats",
      predicate: "has",
      object: JSON.stringify("fact"),
      confidence: 80,
      valid_from: now,
      created_at: now,
      updated_at: now,
    })
    await ProceduralMemoryRepo.register({
      id: `proc_${crypto.randomUUID()}`,
      tenant_id: "default",
      scope: "global",
      name: "stats-procedure",
      status: "active",
      current_version: "1.0.0",
      success_rate: 0,
      usage_count: 0,
      created_at: now,
      updated_at: now,
    })

    const stats = await MemoryLifecycle.getStats()
    expect(stats.working.size).toBeGreaterThanOrEqual(1)
    expect(stats.working.keys).toContain("stats:key")
    expect(stats.episodic.totalEpisodes).toBeGreaterThanOrEqual(1)
    expect(stats.episodic.totalEvents).toBeGreaterThanOrEqual(1)
    expect(stats.semantic.totalFacts).toBeGreaterThanOrEqual(1)
    expect(stats.procedural.totalProcedures).toBeGreaterThanOrEqual(1)
  })

  it("MemoryDb.close clears scheduled cleanup interval handle", async () => {
    if (!MemoryDb.isEnabled()) return

    await using tmp = await tmpdir()
    const dbPath = join(tmp.path, "memory-db-cleanup-handle.db")

    const originalSetInterval = globalThis.setInterval
    const originalClearInterval = globalThis.clearInterval
    const intervals: unknown[] = []
    const cleared: unknown[] = []

    globalThis.setInterval = ((handler: (...args: unknown[]) => void, timeout?: number) => {
      const ref = { handler, timeout, kind: "interval" }
      intervals.push(ref)
      return ref as unknown as ReturnType<typeof setInterval>
    }) as typeof setInterval
    globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
      cleared.push(id)
    }) as typeof clearInterval

    try {
      await MemoryDb.init(dbPath)
      MemoryDb.close()
      expect(intervals.length).toBeGreaterThan(0)
      expect(cleared).toContain(intervals[0])
    } finally {
      globalThis.setInterval = originalSetInterval
      globalThis.clearInterval = originalClearInterval
    }
  })

  it("MemoryState cleanup clears both timeout and interval handles", async () => {
    if (!MemoryDb.isEnabled()) return

    await using tmp = await tmpdir()

    const originalSetTimeout = globalThis.setTimeout
    const originalClearTimeout = globalThis.clearTimeout
    const originalSetInterval = globalThis.setInterval
    const originalClearInterval = globalThis.clearInterval

    let timeoutRef: unknown = null
    const intervalRefs: Array<{ handler: (...args: unknown[]) => void; timeout?: number; kind: string }> = []
    const clearedTimeouts: unknown[] = []
    const clearedIntervals: unknown[] = []

    globalThis.setTimeout = ((handler: (...args: unknown[]) => void, timeout?: number) => {
      const ref = { handler, timeout, kind: "timeout" }
      timeoutRef = ref
      return ref as unknown as ReturnType<typeof setTimeout>
    }) as typeof setTimeout
    globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
      clearedTimeouts.push(id)
    }) as typeof clearTimeout
    globalThis.setInterval = ((handler: (...args: unknown[]) => void, timeout?: number) => {
      const ref = { handler, timeout, kind: "interval" }
      intervalRefs.push(ref)
      return ref as unknown as ReturnType<typeof setInterval>
    }) as typeof setInterval
    globalThis.clearInterval = ((id: ReturnType<typeof setInterval>) => {
      clearedIntervals.push(id)
    }) as typeof clearInterval

    try {
      await MemoryState.forDirectory(tmp.path)
      expect(timeoutRef).toBeTruthy()
      await memoryShutdown()
      expect(clearedTimeouts).toContain(timeoutRef)

      await MemoryState.forDirectory(tmp.path)
      const handler = (timeoutRef as { handler: (...args: unknown[]) => void }).handler
      handler()

      await memoryShutdown()
      const maintenanceInterval = intervalRefs.find((ref) => ref.timeout === 6 * 60 * 60 * 1000)
      expect(maintenanceInterval).toBeTruthy()
      expect(clearedIntervals).toContain(maintenanceInterval)
    } finally {
      globalThis.setTimeout = originalSetTimeout
      globalThis.clearTimeout = originalClearTimeout
      globalThis.setInterval = originalSetInterval
      globalThis.clearInterval = originalClearInterval
    }
  })
})
