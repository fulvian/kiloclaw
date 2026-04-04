/**
 * Memory Persistence Test - Verifies data survives restart
 */

import { describe, it, expect } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { MemoryDb } from "@/kiloclaw/memory"
import { WorkingMemoryRepo, EpisodicMemoryRepo, SemanticMemoryRepo, AuditRepo, FeedbackRepo } from "@/kiloclaw/memory"
import { join } from "path"

describe("Memory Persistence", () => {
  describe("restart recovery", () => {
    it("should persist working memory across restarts", async () => {
      await using tmp = await tmpdir()
      const dbPath = join(tmp.path, "test-memory.db")

      // First session - write data
      await MemoryDb.init(dbPath)

      await WorkingMemoryRepo.set("default", "test-key", { value: "test-value" })
      await WorkingMemoryRepo.set("default", "another-key", { nested: { data: 123 } })

      // Verify data was written
      const value1 = await WorkingMemoryRepo.get("default", "test-key")
      expect(value1).toEqual({ value: "test-value" })

      // Simulate restart - close and reopen
      await MemoryDb.close()
      await MemoryDb.init(dbPath)

      // Verify data survived
      const recoveredValue = await WorkingMemoryRepo.get("default", "test-key")
      expect(recoveredValue).toEqual({ value: "test-value" })

      const anotherValue = await WorkingMemoryRepo.get("default", "another-key")
      expect(anotherValue).toEqual({ nested: { data: 123 } })

      await MemoryDb.close()
    })

    it("should persist episodic events across restarts", async () => {
      await using tmp = await tmpdir()
      const dbPath = join(tmp.path, "test-episodes.db")

      await MemoryDb.init(dbPath)

      const eventId = await EpisodicMemoryRepo.recordEvent({
        id: "ev_test_1",
        tenant_id: "default",
        session_id: "session-1",
        event_type: "task_complete",
        payload: { task: "test-task", result: "success" },
        sensitivity: "medium",
        ts: Date.now(),
        created_at: Date.now(),
      })

      const episodeId = await EpisodicMemoryRepo.recordEpisode({
        id: "ep_test_1",
        tenant_id: "default",
        task_description: "Completed test task",
        outcome: "success",
        confidence: 85,
        started_at: Date.now() - 1000,
        completed_at: Date.now(),
        created_at: Date.now(),
      })

      // Verify data written
      const events = await EpisodicMemoryRepo.getEvents("default", { sessionId: "session-1" })
      expect(events.length).toBe(1)

      // Restart
      await MemoryDb.close()
      await MemoryDb.init(dbPath)

      // Verify data recovered
      const recoveredEvents = await EpisodicMemoryRepo.getEvents("default", { sessionId: "session-1" })
      expect(recoveredEvents.length).toBe(1)
      expect(recoveredEvents[0].payload).toEqual({ task: "test-task", result: "success" })

      const recoveredEpisode = await EpisodicMemoryRepo.getEpisode(episodeId)
      expect(recoveredEpisode?.task_description).toBe("Completed test task")
      expect(recoveredEpisode?.confidence).toBe(85)

      await MemoryDb.close()
    })

    it("should persist semantic facts across restarts", async () => {
      await using tmp = await tmpdir()
      const dbPath = join(tmp.path, "test-facts.db")

      await MemoryDb.init(dbPath)

      const factId = await SemanticMemoryRepo.assertFact({
        id: "fact_test_1",
        tenant_id: "default",
        user_id: "user-1",
        subject: "project",
        predicate: "uses",
        object: JSON.stringify("TypeScript"),
        confidence: 90,
        provenance: "manual_entry",
        valid_from: Date.now(),
      })

      const facts = await SemanticMemoryRepo.queryFacts("default", { userId: "user-1" })
      expect(facts.length).toBe(1)

      // Restart
      await MemoryDb.close()
      await MemoryDb.init(dbPath)

      const recoveredFacts = await SemanticMemoryRepo.queryFacts("default", { userId: "user-1" })
      expect(recoveredFacts.length).toBe(1)
      expect(recoveredFacts[0].subject).toBe("project")
      expect(recoveredFacts[0].predicate).toBe("uses")

      await MemoryDb.close()
    })

    it("should persist audit log across restarts", async () => {
      await using tmp = await tmpdir()
      const dbPath = join(tmp.path, "test-audit.db")

      await MemoryDb.init(dbPath)

      await AuditRepo.log({
        id: "audit_1",
        actor: "user",
        action: "memory_write",
        target_type: "working",
        target_id: "test-key",
        reason: "test entry",
        correlation_id: "corr-123",
        ts: Date.now(),
        created_at: Date.now(),
        hash: "placeholder", // will be computed by repo
      })

      // Restart
      await MemoryDb.close()
      await MemoryDb.init(dbPath)

      const logs = await AuditRepo.getByTarget("working", "test-key")
      expect(logs.length).toBe(1)
      expect(logs[0].action).toBe("memory_write")
      expect(logs[0].actor).toBe("user")

      await MemoryDb.close()
    })
  })

  describe("retention enforcement", () => {
    it("should purge expired working memory entries", async () => {
      await using tmp = await tmpdir()
      const dbPath = join(tmp.path, "test-retention.db")

      await MemoryDb.init(dbPath)

      // Write an entry that expires immediately (ttlMs = 1ms)
      await WorkingMemoryRepo.set("default", "expiring-key", { data: "will expire" }, { ttlMs: 1 })

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10))

      // Verify the entry is gone (expired)
      const value = await WorkingMemoryRepo.get("default", "expiring-key")
      expect(value).toBeNull()

      await MemoryDb.close()
    })
  })

  describe("feedback loop", () => {
    it("should record and retrieve feedback events", async () => {
      await using tmp = await tmpdir()
      const dbPath = join(tmp.path, "test-feedback.db")

      await MemoryDb.init(dbPath)

      await FeedbackRepo.record({
        id: "fb_test_1",
        tenant_id: "default",
        user_id: "user-1",
        target_type: "memory",
        target_id: "fact-123",
        vote: "up",
        reason: "useful",
        ts: Date.now(),
        created_at: Date.now(),
      })

      // Verify feedback was recorded
      const events = await FeedbackRepo.getByTarget("memory", "fact-123")
      expect(events.length).toBe(1)
      expect(events[0].vote).toBe("up")

      await MemoryDb.close()
    })
  })
})
