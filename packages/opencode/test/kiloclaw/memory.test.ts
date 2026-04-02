import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import type {
  // Memory types (used as type annotations only)
  MemoryEntry,
  Classification,
  RetentionPolicy,
  MemoryQuery,
  Outcome,
  TimelineFilter,
  Fact,
  Procedure,
  SkillPattern,
  RankedResult,
} from "@/kiloclaw/memory"
import {
  // Memory types (used as values - Zod schemas and factories)
  MemoryId,
  EpisodeId,
  EventId,
  FactId,
  ProcedureId,
  Layer,
  SensitivityLevel,
  DataCategory,
  MemoryEntrySchema,
  PurgeReason,
  EventType,
  // Factories
  MemoryIdFactory,
  EpisodeIdFactory,
  EventIdFactory,
  FactIdFactory,
  ProcedureIdFactory,
} from "@/kiloclaw/memory"
import type { AgencyId, SkillId, CorrelationId } from "@/kiloclaw/types"
import type { EntityId } from "@/kiloclaw/memory"
import { CorrelationId as CorrIdSchema } from "@/kiloclaw"

// Import memory implementations
import {
  WorkingMemory,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  MemoryBroker,
  MemoryLifecycle,
} from "@/kiloclaw/memory"

describe("Kiloclaw Memory 4-Layer", () => {
  describe("WP3.1: Memory Types", () => {
    describe("identifiers", () => {
      it("should create valid memory ID", () => {
        const id = MemoryIdFactory.create()
        expect(typeof id).toBe("string")
        expect(id.length).toBeGreaterThan(0)
      })

      it("should create valid episode ID with prefix", () => {
        const id = EpisodeIdFactory.create()
        expect(id.startsWith("ep_")).toBe(true)
      })

      it("should create valid event ID with prefix", () => {
        const id = EventIdFactory.create()
        expect(id.startsWith("ev_")).toBe(true)
      })

      it("should create valid fact ID with prefix", () => {
        const id = FactIdFactory.create()
        expect(id.startsWith("fact_")).toBe(true)
      })

      it("should create valid procedure ID with prefix", () => {
        const id = ProcedureIdFactory.create()
        expect(id.startsWith("proc_")).toBe(true)
      })
    })

    describe("layer enum", () => {
      it("should accept valid layer values", () => {
        expect(Layer.parse("working")).toBe("working")
        expect(Layer.parse("episodic")).toBe("episodic")
        expect(Layer.parse("semantic")).toBe("semantic")
        expect(Layer.parse("procedural")).toBe("procedural")
      })

      it("should reject invalid layer values", () => {
        expect(() => Layer.parse("invalid")).toThrow()
      })
    })

    describe("sensitivity level", () => {
      it("should accept valid sensitivity levels", () => {
        expect(SensitivityLevel.parse("critical")).toBe("critical")
        expect(SensitivityLevel.parse("high")).toBe("high")
        expect(SensitivityLevel.parse("medium")).toBe("medium")
        expect(SensitivityLevel.parse("low")).toBe("low")
      })
    })

    describe("memory entry schema", () => {
      it("should validate a complete memory entry", () => {
        const entry: MemoryEntry = {
          id: MemoryIdFactory.create(),
          layer: "working",
          key: "test_key",
          value: { data: "test" },
          sensitivity: "medium",
          category: "session",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }

        const result = MemoryEntrySchema.parse(entry)
        expect(result.layer).toBe("working")
        expect(result.key).toBe("test_key")
      })
    })
  })

  describe("WP3.2: Working Memory", () => {
    beforeEach(() => {
      WorkingMemory.clear()
    })

    it("should set and get values", () => {
      WorkingMemory.set("key1", "value1")
      expect(WorkingMemory.get("key1")).toBe("value1")
    })

    it("should return undefined for non-existent keys", () => {
      expect(WorkingMemory.get("nonexistent")).toBeUndefined()
    })

    it("should delete values", () => {
      WorkingMemory.set("key1", "value1")
      WorkingMemory.remove("key1")
      expect(WorkingMemory.get("key1")).toBeUndefined()
    })

    it("should clear all values", () => {
      WorkingMemory.set("key1", "value1")
      WorkingMemory.set("key2", "value2")
      WorkingMemory.clear()
      expect(WorkingMemory.get("key1")).toBeUndefined()
      expect(WorkingMemory.get("key2")).toBeUndefined()
    })

    it("should set multiple values at once", () => {
      WorkingMemory.setMany({ a: 1, b: 2, c: 3 })
      expect(WorkingMemory.get("a")).toBe(1)
      expect(WorkingMemory.get("b")).toBe(2)
      expect(WorkingMemory.get("c")).toBe(3)
    })

    it("should get multiple values at once", () => {
      WorkingMemory.setMany({ a: 1, b: 2, c: 3 })
      const result = WorkingMemory.getMany(["a", "c"])
      expect(result).toEqual({ a: 1, c: 3 })
    })

    it("should create and restore snapshots", () => {
      WorkingMemory.setMany({ x: 1, y: 2 })
      const snapshot = WorkingMemory.snapshot()
      WorkingMemory.clear()
      WorkingMemory.restore(snapshot)
      expect(WorkingMemory.get("x")).toBe(1)
      expect(WorkingMemory.get("y")).toBe(2)
    })

    it("should check key existence", () => {
      WorkingMemory.set("exists", "value")
      expect(WorkingMemory.has("exists")).toBe(true)
      expect(WorkingMemory.has("notexists")).toBe(false)
    })

    it("should return all keys", () => {
      WorkingMemory.setMany({ a: 1, b: 2 })
      const keys = WorkingMemory.keys()
      expect(keys).toContain("a")
      expect(keys).toContain("b")
    })

    it("should return statistics", () => {
      WorkingMemory.setMany({ a: 1, b: 2, c: 3 })
      const stats = WorkingMemory.stats()
      expect(stats.size).toBe(3)
      expect(stats.keys.length).toBe(3)
    })
  })

  describe("WP3.2: Episodic Memory", () => {
    beforeEach(() => {
      EpisodicMemory.clear()
    })

    it("should record memory events", async () => {
      const eventId = await EpisodicMemory.record({
        id: EventIdFactory.create(),
        type: "task_start",
        timestamp: new Date().toISOString(),
        correlationId: "corr_123" as CorrelationId,
        agencyId: "agency_dev" as AgencyId,
        data: { task: "test" },
      })

      expect(eventId).toBeDefined()
      expect(typeof eventId).toBe("string")
    })

    it("should record task episodes", async () => {
      const episodeId = await EpisodicMemory.recordTask(
        "task_123",
        "Test task description",
        "success",
        new Date(),
        "corr_456",
        "agency_dev",
      )

      expect(episodeId).toBeDefined()
      expect(episodeId.startsWith("ep_")).toBe(true)
    })

    it("should retrieve recorded episodes", async () => {
      const episodeId = await EpisodicMemory.recordTask(
        "task_123",
        "Test task",
        "success",
        new Date(),
        "corr_789",
        "agency_dev",
      )

      const episode = await EpisodicMemory.getEpisode(episodeId)
      expect(episode).not.toBeNull()
      expect(episode?.taskId).toBe("task_123")
    })

    it("should return recent episodes", async () => {
      await EpisodicMemory.recordTask("t1", "Task 1", "success", new Date(), "c1", "dev")
      await EpisodicMemory.recordTask("t2", "Task 2", "failure", new Date(), "c2", "dev")

      const recent = await EpisodicMemory.getRecentEpisodes(10)
      expect(recent.length).toBeGreaterThanOrEqual(2)
    })

    it("should filter episodes by date", async () => {
      const oldDate = new Date(Date.now() - 24 * 60 * 60 * 1000)
      await EpisodicMemory.recordTask("t_old", "Old task", "success", oldDate, "c_old", "dev")
      await EpisodicMemory.recordTask("t_new", "New task", "success", new Date(), "c_new", "dev")

      const recent = await EpisodicMemory.getRecentEpisodes(10, oldDate)
      expect(recent.length).toBeGreaterThanOrEqual(1)
    })

    it("should get events by type", async () => {
      await EpisodicMemory.record({
        id: EventIdFactory.create(),
        type: "tool_call",
        timestamp: new Date().toISOString(),
        correlationId: "corr_abc" as CorrelationId,
        data: {},
      })

      const events = await EpisodicMemory.getEventsByType("tool_call")
      expect(events.length).toBeGreaterThan(0)
    })

    it("should get timeline with filters", async () => {
      await EpisodicMemory.recordTask("t1", "Task 1", "success", new Date(), "c1", "dev")
      await EpisodicMemory.recordTask("t2", "Task 2", "failure", new Date(), "c2", "dev")

      const timeline = await EpisodicMemory.getTimeline({ limit: 10 })
      expect(timeline.length).toBeLessThanOrEqual(10)
    })

    it("should return statistics", async () => {
      await EpisodicMemory.recordTask("t1", "Task 1", "success", new Date(), "c1", "dev")
      await EpisodicMemory.recordTask("t2", "Task 2", "failure", new Date(), "c2", "dev")

      const stats = await EpisodicMemory.getStats()
      expect(stats.totalEpisodes).toBeGreaterThanOrEqual(2)
      expect(stats.byOutcome.success).toBeGreaterThanOrEqual(1)
      expect(stats.byOutcome.failure).toBeGreaterThanOrEqual(1)
    })
  })

  describe("WP3.2: Semantic Memory", () => {
    beforeEach(() => {
      SemanticMemory.clear()
    })

    it("should assert facts", async () => {
      const factId = await SemanticMemory.assert({
        subject: "user_preferences",
        predicate: "theme",
        object: "dark",
        confidence: 0.95,
        source: "user_settings",
      })

      expect(factId).toBeDefined()
      expect(typeof factId).toBe("string")
    })

    it("should query facts by subject", async () => {
      await SemanticMemory.assert({
        subject: "book",
        predicate: "author",
        object: "Shakespeare",
        confidence: 1.0,
        source: "knowledge_base",
      })

      const facts = await SemanticMemory.query("book")
      expect(facts.length).toBeGreaterThan(0)
    })

    it("should query facts by predicate", async () => {
      await SemanticMemory.assert({
        subject: "x",
        predicate: "depends_on",
        object: "y",
        confidence: 0.8,
        source: "analysis",
      })

      const facts = await SemanticMemory.query(undefined, "depends_on")
      expect(facts.length).toBeGreaterThan(0)
    })

    it("should retract facts", async () => {
      const factId = await SemanticMemory.assert({
        subject: "temp",
        predicate: "value",
        object: "to_be_removed",
        confidence: 0.5,
        source: "temp",
      })

      await SemanticMemory.retract(factId)
      const facts = await SemanticMemory.query("temp")
      expect(facts.length).toBe(0)
    })

    it("should update fact values", async () => {
      const factId = await SemanticMemory.assert({
        subject: "counter",
        predicate: "value",
        object: 0,
        confidence: 1.0,
        source: "system",
      })

      await SemanticMemory.update(factId, 42)
      const facts = await SemanticMemory.query("counter")
      expect(facts[0].object).toBe(42)
    })

    it("should embed and store content", async () => {
      const embeddingId = await SemanticMemory.embedAndStore("This is a test document about artificial intelligence", {
        content: "AI document",
        entityType: "document",
      })

      expect(embeddingId).toBeDefined()
      expect(embeddingId.startsWith("emb_")).toBe(true)
    })

    it("should perform similarity search", async () => {
      await SemanticMemory.embedAndStore("machine learning algorithms", {
        entityType: "topic",
        tags: ["AI", "ML"],
      })
      await SemanticMemory.embedAndStore("cooking recipes", {
        entityType: "topic",
        tags: ["food"],
      })

      // Simple embedding for testing
      const testEmbedding = new Array(128).fill(0).map(() => Math.random() - 0.5)
      const results = await SemanticMemory.similaritySearch(testEmbedding, 5)
      expect(Array.isArray(results)).toBe(true)
    })

    it("should link entities", async () => {
      await SemanticMemory.link("entity_a" as EntityId, "related_to", "entity_b" as EntityId, 0.8)

      const relations = await SemanticMemory.getRelations("entity_a" as EntityId)
      expect(relations.length).toBeGreaterThan(0)
      expect(relations[0].targetId).toBe("entity_b" as EntityId)
    })

    it("should get connected entities", async () => {
      await SemanticMemory.link("user_1" as EntityId, "follows", "user_2" as EntityId)
      await SemanticMemory.link("user_1" as EntityId, "follows", "user_3" as EntityId)

      const connected = await SemanticMemory.getConnected("user_1" as EntityId)
      expect(connected as string[]).toContain("user_2")
      expect(connected as string[]).toContain("user_3")
    })
  })

  describe("WP3.2: Procedural Memory", () => {
    beforeEach(() => {
      ProceduralMemory.clear()
    })

    it("should register procedures", async () => {
      const procedureId = await ProceduralMemory.register({
        name: "code_review",
        description: "Standard code review workflow",
        version: "1.0.0",
        agencyId: "agency_dev" as AgencyId,
        steps: [
          { id: "1", action: "lint", next: "2" },
          { id: "2", action: "test" },
        ],
      })

      expect(procedureId).toBeDefined()
      expect(procedureId.startsWith("proc_")).toBe(true)
    })

    it("should get procedures by ID", async () => {
      const procedureId = await ProceduralMemory.register({
        name: "deployment",
        description: "Deploy to production",
        version: "1.0.0",
        steps: [{ id: "1", action: "deploy" }],
      })

      const procedure = await ProceduralMemory.get(procedureId)
      expect(procedure).not.toBeNull()
      expect(procedure?.name).toBe("deployment")
    })

    it("should list procedures with filters", async () => {
      await ProceduralMemory.register({
        name: "workflow_a",
        description: "Workflow A",
        version: "1.0.0",
        agencyId: "agency_dev" as AgencyId,
        steps: [],
      })
      await ProceduralMemory.register({
        name: "workflow_b",
        description: "Workflow B",
        version: "1.0.0",
        agencyId: "agency_knowledge" as AgencyId,
        steps: [],
      })

      const all = await ProceduralMemory.list()
      expect(all.length).toBeGreaterThanOrEqual(2)

      const devOnly = await ProceduralMemory.list({ agencyId: "agency_dev" as AgencyId })
      expect(devOnly.length).toBeGreaterThanOrEqual(1)
    })

    it("should update procedures", async () => {
      const procedureId = await ProceduralMemory.register({
        name: "to_update",
        description: "Original",
        version: "1.0.0",
        steps: [],
      })

      await ProceduralMemory.update(procedureId, {
        description: "Updated description",
        version: "1.1.0",
      })

      const updated = await ProceduralMemory.get(procedureId)
      expect(updated?.description).toBe("Updated description")
      expect(updated?.version).toBe("1.1.0")
    })

    it("should track version history", async () => {
      const procedureId = await ProceduralMemory.register({
        name: "versioned_proc",
        description: "Initial",
        version: "1.0.0",
        steps: [],
      })

      await ProceduralMemory.update(procedureId, {
        version: "2.0.0",
        description: "Major update",
      })

      const history = await ProceduralMemory.getVersionHistory(procedureId)
      expect(history.length).toBeGreaterThanOrEqual(2)
    })

    it("should rollback to previous version", async () => {
      const procedureId = await ProceduralMemory.register({
        name: "rollback_test",
        description: "Version 1",
        version: "1.0.0",
        steps: [],
      })

      await ProceduralMemory.update(procedureId, {
        version: "2.0.0",
        description: "Version 2",
      })

      const history = await ProceduralMemory.getVersionHistory(procedureId)
      const firstVersion = history[0]

      await ProceduralMemory.rollback(procedureId, firstVersion.id)

      const current = await ProceduralMemory.get(procedureId)
      expect(current?.version).toBe("1.0.0")
    })

    it("should register and find skill patterns", async () => {
      await ProceduralMemory.registerPattern({
        skillId: "skill_debug" as SkillId,
        name: "Debug pattern",
        description: "Systematic debugging approach",
        steps: ["observe", "hypothesize", "test", "fix"],
        usageCount: 5,
        successRate: 0.8,
      })

      const pattern = await ProceduralMemory.findPattern("skill_debug" as SkillId)
      expect(pattern).not.toBeNull()
      expect(pattern?.name).toBe("Debug pattern")
    })

    it("should update pattern statistics", async () => {
      await ProceduralMemory.registerPattern({
        skillId: "skill_test" as SkillId,
        name: "Test pattern",
        description: "Testing approach",
        steps: ["plan", "execute", "verify"],
        usageCount: 0,
        successRate: 0,
      })

      const patterns = await ProceduralMemory.getAllPatterns()
      const patternId = patterns[0].id

      await ProceduralMemory.updatePatternStats(patternId, true)

      const updated = await ProceduralMemory.getAllPatterns()
      expect(updated[0].usageCount).toBe(1)
      expect(updated[0].successRate).toBeGreaterThan(0)
    })
  })

  describe("WP3.3: Memory Broker", () => {
    beforeEach(() => {
      WorkingMemory.clear()
      EpisodicMemory.clear()
      SemanticMemory.clear()
      ProceduralMemory.clear()
    })

    it("should access all memory layers", () => {
      expect(MemoryBroker.working()).toBeDefined()
      expect(MemoryBroker.episodic()).toBeDefined()
      expect(MemoryBroker.semantic()).toBeDefined()
      expect(MemoryBroker.procedural()).toBeDefined()
    })

    it("should write entries to working memory", async () => {
      const entry: MemoryEntry = {
        id: MemoryIdFactory.create(),
        layer: "working",
        key: "broker_test",
        value: { data: "test_value" },
        sensitivity: "medium",
        category: "session",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await MemoryBroker.write(entry)
      expect(WorkingMemory.get("broker_test")).toEqual({ data: "test_value" })
    })

    it("should classify unknown entries", () => {
      const classification = MemoryBroker.classify("short string")
      expect(classification.layer).toBe("working")
      expect(classification.confidence).toBeGreaterThan(0)
    })

    it("should classify task-like structures as episodic", () => {
      const classification = MemoryBroker.classify({
        taskId: "task_123",
        taskDescription: "Test task",
      })
      expect(classification.layer).toBe("episodic")
    })

    it("should classify fact-like structures as semantic", () => {
      const classification = MemoryBroker.classify({
        subject: "fact_subject",
        predicate: "predicate",
        object: "value",
      })
      expect(classification.layer).toBe("semantic")
    })

    it("should classify procedure-like structures as procedural", () => {
      const classification = MemoryBroker.classify({
        name: "procedure_name",
        steps: ["step1", "step2"],
      })
      expect(classification.layer).toBe("procedural")
    })

    it("should get retention policies by layer", () => {
      const workingPolicy = MemoryBroker.getRetentionPolicy("working")
      expect(workingPolicy.layer).toBe("working")

      const episodicPolicy = MemoryBroker.getRetentionPolicy("episodic")
      expect(episodicPolicy.layer).toBe("episodic")
    })

    it("should read entries from memory", async () => {
      WorkingMemory.set("read_test", "value123")

      const entries = await MemoryBroker.read({
        layer: "working",
        keys: ["read_test"],
        limit: 10,
      })

      expect(entries.length).toBeGreaterThan(0)
    })
  })

  describe("WP3.4: Memory Lifecycle", () => {
    it("should capture run artifacts", () => {
      const artifacts = MemoryLifecycle.capture({
        intent: "test_intent",
        plan: "test_plan",
        evidences: ["evidence1", "evidence2"],
        outcome: "success",
        durationMs: 1000,
      })

      expect(artifacts.length).toBe(2)
      expect(artifacts[0].layer).toBe("working")
      expect(artifacts[1].layer).toBe("episodic")
    })

    it("should classify artifacts", () => {
      const artifacts = MemoryLifecycle.capture({
        intent: "test",
        outcome: "success",
        durationMs: 100,
        evidences: [],
      })

      const classifications = MemoryLifecycle.classify(artifacts)
      expect(classifications.length).toBe(2)
    })

    it("should apply retention policies by layer", () => {
      const policy = MemoryLifecycle.applyRetentionPolicy("episodic")
      expect(policy.layer).toBe("episodic")
      expect(policy.encryption).toBe("standard")
    })

    it("should apply stricter policy for audit domain", () => {
      const policy = MemoryLifecycle.applyRetentionPolicy("episodic", "audit")
      expect(policy.encryption).toBe("maximum")
      expect(policy.ttlMs).toBeGreaterThan(0)
    })

    it("should consolidate episodes", async () => {
      // Record some episodes first
      const episodeId = await EpisodicMemory.recordTask(
        "consolidate_test",
        "Test consolidation",
        "success",
        new Date(),
        "corr_consolidate",
        "agency_dev",
      )

      const result = await MemoryLifecycle.consolidate([episodeId])
      expect(result.sourceEpisodes).toContain(episodeId)
      expect(result.confidence).toBeGreaterThanOrEqual(0)
    })

    it("should return memory statistics", async () => {
      const stats = await MemoryLifecycle.getStats()
      expect(stats).toHaveProperty("working")
      expect(stats).toHaveProperty("episodic")
      expect(stats).toHaveProperty("semantic")
      expect(stats).toHaveProperty("procedural")
    })
  })

  describe("Cross-layer Integration", () => {
    beforeEach(() => {
      WorkingMemory.clear()
      EpisodicMemory.clear()
      SemanticMemory.clear()
      ProceduralMemory.clear()
    })

    it("should support working memory snapshot/restore for session continuity", () => {
      // Simulate session work
      WorkingMemory.setMany({
        "session:task_id": "task_123",
        "session:step": "planning",
        "session:context": JSON.stringify({ user: "test" }),
      })

      // Snapshot before task switch
      const snapshot = WorkingMemory.snapshot()

      // Simulate different task
      WorkingMemory.clear()
      WorkingMemory.set("session:task_id", "task_456")

      // Restore original context
      WorkingMemory.restore(snapshot)

      expect(WorkingMemory.get("session:task_id")).toBe("task_123")
      expect(WorkingMemory.get("session:step")).toBe("planning")
    })

    it("should allow episodic to semantic consolidation", async () => {
      // Record task in episodic
      const episodeId = await EpisodicMemory.recordTask(
        "learned_pattern",
        "Discovered new debugging technique",
        "success",
        new Date(),
        "corr_learn",
        "agency_dev",
      )

      // Consolidate to semantic memory
      const result = await SemanticMemory.consolidate([episodeId])

      expect(result.sourceEpisodes).toContain(episodeId)
    })

    it("should track procedures in procedural memory for reuse", async () => {
      const procedureId = await ProceduralMemory.register({
        name: "reusable_workflow",
        description: "A workflow to be reused",
        version: "1.0.0",
        agencyId: "agency_dev" as AgencyId,
        steps: [
          { id: "1", action: "analyze" },
          { id: "2", action: "implement" },
          { id: "3", action: "verify" },
        ],
      })

      // Use the procedure
      const procedure = await ProceduralMemory.get(procedureId)
      expect(procedure?.steps.length).toBe(3)

      // Record as a successful pattern
      await ProceduralMemory.registerPattern({
        skillId: "skill_dev" as SkillId,
        name: "Development workflow",
        description: "Standard development process",
        steps: ["analyze", "implement", "verify"],
        usageCount: 1,
        successRate: 1.0,
      })

      // Find and use the pattern
      const pattern = await ProceduralMemory.findPattern("skill_dev" as SkillId)
      expect(pattern).not.toBeNull()
    })
  })
})
