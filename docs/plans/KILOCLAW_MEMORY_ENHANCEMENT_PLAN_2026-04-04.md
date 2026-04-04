# Kiloclaw Memory Enhancement Plan — SOTA Best Practices (April 2026)

**Date:** 2026-04-04  
**Last Updated:** 2026-04-05  
**Type:** Implementation Plan  
**Status:** Phase 1, 2 & BP-02 Implemented  
**Sources:** mem0.ai ECAI 2025 paper, atlan.com, machinelearningmastery.com, 47billion.com, medium.com/@mjgmario  
**Scope:** All 15 SOTA best practices analyzed against current Kiloclaw 4-layer memory system

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Priority Matrix](#2-priority-matrix)
3. [BP-01: Selective Extraction](#3-bp-01-selective-extraction)
4. [BP-02: Graph Memory](#4-bp-02-graph-memory)
5. [BP-03: Multi-Scope Memory](#5-bp-03-multi-scope-memory)
6. [BP-04: Async Writes](#6-bp-04-async-writes)
7. [BP-05: Progressive Summarization](#7-bp-05-progressive-summarization)
8. [BP-06: Actor-Aware Memory](#8-bp-06-actor-aware-memory)
9. [BP-07: Procedural Memory (Enhanced)](#9-bp-07-procedural-memory-enhanced)
10. [BP-08: Reranking Pipeline](#10-bp-08-reranking-pipeline)
11. [BP-09: Metadata Filtering](#11-bp-09-metadata-filtering)
12. [BP-10: Background Extraction](#12-bp-10-background-extraction)
13. [BP-11: Memory Controller (ADD/UPDATE/DELETE/NOOP)](#13-bp-11-memory-controller-addupdatedeletenoop)
14. [BP-12: Memory Maintenance Operations](#14-bp-12-memory-maintenance-operations)
15. [BP-13: Retrieval as Pipeline](#15-bp-13-retrieval-as-pipeline)
16. [BP-14: Packaging Matters More Than Ranking](#16-bp-14-packaging-matters-more-than-ranking)
17. [BP-15: Tiered Architecture (OS-Style)](#17-bp-15-tiered-architecture-os-style)
18. [Cross-Cutting Concerns](#18-cross-cutting-concerns)
19. [Implementation Order & Dependencies](#19-implementation-order--dependencies)
20. [References](#20-references)

---

## 1. Executive Summary

The current Kiloclaw 4-layer memory system has a solid architectural foundation (ADR-005, `memory.broker.v2.ts`, `memory.repository.ts`, `memory.ranking.ts`) but lacks several SOTA capabilities identified in April 2026 research. This plan addresses all 15 best practices with specific entry points, code examples, and implementation priority.

### Current Strengths (Keep)

- ✅ 4-layer architecture (working/episodic/semantic/procedural) matching blueprint
- ✅ Multi-factor ranking (`memory.ranking.ts`) with 8 scoring factors
- ✅ Token budget allocation per layer (`applyBudget()`)
- ✅ Audit trail with hash chain (`AuditRepo`)
- ✅ Feedback repository for user corrections
- ✅ Working + episodic write in `plugin.ts` hooks
- ✅ Session-scoped retrieval via `Instance.directory` filter

### Critical Gaps (Address First)

- ✅ **Selective extraction** — implemented via `memory.extractor.ts`
- ✅ **Graph memory** — entity-relation graph with multi-hop traversal and retrieval boost
- ✅ **Async writes** — implemented via `memory.writeback.ts` with batching
- ✅ **Reranking pipeline** — implemented via `memory.reranker.ts`
- ✅ **Memory controller** — implemented via `memory.controller.ts` with ADD/UPDATE/DELETE/NOOP
- ✅ **Actor-aware memory** — implemented via schema changes and ranking enhancement

---

## 2. Priority Matrix

| BP  | Best Practice                | Impact  | Effort  | Priority | Status         |
| --- | ---------------------------- | ------- | ------- | -------- | -------------- |
| 01  | Selective Extraction         | 🔴 High | 🟡 Med  | P0       | ✅ Implemented |
| 04  | Async Writes                 | 🔴 High | 🟡 Med  | P0       | ✅ Implemented |
| 08  | Reranking Pipeline           | 🔴 High | 🟢 Low  | P0       | ✅ Implemented |
| 13  | Retrieval as Pipeline        | 🔴 High | 🟡 Med  | P0       | ✅ Implemented |
| 11  | Memory Controller            | 🔴 High | 🟡 Med  | P1       | ✅ Implemented |
| 06  | Actor-Aware Memory           | 🟡 Med  | 🟢 Low  | P1       | ✅ Implemented |
| 09  | Metadata Filtering           | 🟡 Med  | 🟢 Low  | P1       | ✅ Implemented |
| 03  | Multi-Scope Memory           | 🟡 Med  | 🟡 Med  | P1       | ✅ Implemented |
| 14  | Packaging                    | 🟡 Med  | 🟢 Low  | P2       | ✅ Implemented |
| 07  | Procedural Memory (Enhanced) | 🟡 Med  | 🟡 Med  | P2       | ✅ Implemented |
| 05  | Progressive Summarization    | 🟡 Med  | 🟡 Med  | P2       | ✅ Implemented |
| 10  | Background Extraction        | 🟡 Med  | 🟡 Med  | P2       | ✅ Implemented |
| 02  | Graph Memory                 | 🟡 Med  | 🔴 High | P2       | ✅ Implemented |
| 12  | Memory Maintenance           | 🟢 Low  | 🟡 Med  | P3       | ⏳ Pending     |
| 15  | Tiered Architecture          | 🟢 Low  | 🔴 High | P3       | ⏳ Pending     |

---

## 3. BP-01: Selective Extraction

### What It Is

Extract discrete facts, entities, and outcomes from conversations — NOT raw conversation dumps. Mem0 approach yields ~1,800 tokens vs ~26,000 for full-context with only 6% accuracy loss.

**Benchmark (Mem0 ECAI 2025):**
| Approach | Accuracy | Tokens/Conv |
|----------|----------|-------------|
| Full-context | 72.9% | ~26,000 |
| Mem0g (graph) | 68.4% | ~1,800 |
| Mem0 (vector) | 66.9% | ~1,800 |

### Current State

`plugin.ts` stores raw `taskDescription: body` (clipped at 1200 chars) in episodic layer. No extraction of discrete facts.

### Implementation

**New file:** `packages/opencode/src/kiloclaw/memory/memory.extractor.ts`

```typescript
import { Log } from "@/util/log"

const log = Log.create({ service: "kiloclaw.memory.extractor" })

export namespace MemoryExtractor {
  /**
   * Extract discrete facts from conversation content.
   * Returns structured facts ready for semantic layer.
   */
  export async function extractFacts(
    content: string,
    context: {
      sessionId: string
      userId?: string
      agentId?: string
      correlationId?: string
    },
  ): Promise<
    Array<{
      subject: string
      predicate: string
      object: unknown
      confidence: number
      provenance: string
    }>
  > {
    const facts: Array<{
      subject: string
      predicate: string
      object: unknown
      confidence: number
      provenance: string
    }> = []

    // Rule-based extraction for MVP
    // Pattern: "user prefers X" → preference fact
    const preferenceMatch = content.match(/prefer[ei]\s+(.+?)(?:\.|$)/i)
    if (preferenceMatch) {
      facts.push({
        subject: "user",
        predicate: "prefers",
        object: preferenceMatch[1].trim(),
        confidence: 0.75,
        provenance: `extracted:${context.sessionId}`,
      })
    }

    // Pattern: "project uses X" → technology fact
    const techMatch = content.match(/(?:uses|employs|depends on)\s+([A-Za-z0-9_-]+)/gi)
    if (techMatch) {
      for (const match of techMatch) {
        const tech = match.replace(/^(uses|employs|depends on)\s+/i, "").trim()
        facts.push({
          subject: "project",
          predicate: "uses_technology",
          object: tech,
          confidence: 0.8,
          provenance: `extracted:${context.sessionId}`,
        })
      }
    }

    // Pattern: "task completed X" → outcome fact
    const outcomeMatch = content.match(/task[:\s]+(.+?)(?:completed|finished|done)/i)
    if (outcomeMatch) {
      facts.push({
        subject: "task",
        predicate: "outcome",
        object: outcomeMatch[1].trim(),
        confidence: 0.85,
        provenance: `extracted:${context.sessionId}`,
      })
    }

    log.debug("extracted facts", { count: facts.length, sessionId: context.sessionId })
    return facts
  }

  /**
   * Check if content is worth extracting (too short or noisy)
   */
  export function isWorthExtracting(content: string): boolean {
    if (content.length < 50) return false
    if (content.length > 10000) return false // too long, needs summarization first
    // Skip very noisy content
    const noiseRatio = (content.match(/[!?]{2,}/g) ?? []).length / content.length
    if (noiseRatio > 0.05) return false
    return true
  }
}
```

**Integration point:** `plugin.ts` — after recording episodic, call extractor before semantic write:

```typescript
// In plugin.ts, after episodic record (around line 53)
const facts = await MemoryExtractor.extractFacts(body, {
  sessionId: input.sessionID,
  agentId: input.agent,
  correlationId: input.messageID,
})

for (const fact of facts) {
  await MemoryBrokerV2.semantic().assert(fact.subject, fact.predicate, fact.object, fact.confidence)
}
```

**Schema change:** `memory.schema.sql.ts` — add `extraction_source` column to `FactTable`:

```sql
ALTER TABLE facts ADD COLUMN extraction_source TEXT; -- 'extracted', 'user_direct', 'broker_v2'
```

### Entry Points

- **Write path:** `packages/opencode/src/kiloclaw/memory/plugin.ts` (lines 33-55)
- **Fact assertion:** `packages/opencode/src/kiloclaw/memory/memory.broker.v2.ts` (lines 167-223)
- **Schema:** `packages/opencode/src/kiloclaw/memory/memory.schema.sql.ts`

### Effort

- **Time:** 2-3 days
- **Files changed:** 3-4 (plugin.ts, new extractor.ts, schema.sql, broker.v2.ts)

---

## 4. BP-02: Graph Memory

### What It Is

Build entity-relationship graphs alongside vector store. Mem0g achieves 68.4% accuracy vs 66.9% vector-only. Graph traversal enables multi-hop queries ("what did I work on with X tech?"").

### Current State

`SemanticMemoryRepo` has flat `FactTable` + `FactVectorTable`. No graph edges table. `similaritySearch()` does pure vector similarity.

### Implementation

**New table:** `memory.schema.sql.ts`

```typescript
// Entity table for graph memory
export const EntityTable = sqliteTable("memory_entities", {
  id: text("id").primaryKey(),
  tenant_id: text("tenant_id").notNull(),
  name: text("name").notNull(),
  entity_type: text("entity_type").notNull(), -- 'user', 'project', 'task', 'technology', 'concept'
  metadata_json: text("metadata_json", { mode: "json" }),
  created_at: integer("created_at", { mode: "timestamp" }).notNull(),
  updated_at: integer("updated_at", { mode: "timestamp" }).notNull(),
})

// Graph edges table
export const MemoryEdgeTable = sqliteTable("memory_edges", {
  id: text("id").primaryKey(),
  tenant_id: text("tenant_id").notNull(),
  source_id: text("source_id").notNull().references(() => EntityTable.id),
  relation: text("relation").notNull(), -- 'uses', 'depends_on', 'related_to', 'part_of'
  target_id: text("target_id").notNull().references(() => EntityTable.id),
  weight: integer("weight").default(100), -- 0-100
  metadata_json: text("metadata_json", { mode: "json" }),
  created_at: integer("created_at", { mode: "timestamp" }).notNull(),
})
```

**New repository:** `packages/opencode/src/kiloclaw/memory/memory.graph.ts`

```typescript
export const GraphMemoryRepo = {
  async upsertEntity(input: {
    id: string
    tenant_id: string
    name: string
    entity_type: string
    metadata?: Record<string, unknown>
  }): Promise<string> {
    // Check if exists
    const existing = await db()
      .select()
      .from(EntityTable)
      .where(and(eq(EntityTable.tenant_id, input.tenant_id), eq(EntityTable.name, input.name)))
      .limit(1)

    if (existing.length > 0) {
      await db()
        .update(EntityTable)
        .set({ updated_at: Date.now(), metadata_json: input.metadata })
        .where(eq(EntityTable.id, existing[0].id))
      return existing[0].id
    }

    await db()
      .insert(EntityTable)
      .values({
        ...input,
        created_at: Date.now(),
        updated_at: Date.now(),
      })
    return input.id
  },

  async addEdge(input: {
    id: string
    tenant_id: string
    source_id: string
    relation: string
    target_id: string
    weight?: number
  }): Promise<void> {
    await db()
      .insert(MemoryEdgeTable)
      .values({
        ...input,
        weight: input.weight ?? 100,
        created_at: Date.now(),
      })
      .onConflictDoNothing()
  },

  async getConnected(entityId: string, relation?: string): Promise<Entity[]> {
    const conditions = [or(eq(MemoryEdgeTable.source_id, entityId), eq(MemoryEdgeTable.target_id, entityId))]
    if (relation) conditions.push(eq(MemoryEdgeTable.relation, relation))

    return db()
      .select()
      .from(MemoryEdgeTable)
      .where(and(...conditions))
  },

  async traverse(startEntityId: string, hops: number): Promise<Set<string>> {
    const visited = new Set<string>()
    let frontier = [startEntityId]

    for (let i = 0; i < hops; i++) {
      const nextFrontier: string[] = []
      for (const entityId of frontier) {
        if (visited.has(entityId)) continue
        visited.add(entityId)

        const edges = await this.getConnected(entityId)
        for (const edge of edges) {
          nextFrontier.push(edge.source_id, edge.target_id)
        }
      }
      frontier = [...new Set(nextFrontier)]
    }

    return visited
  },
}
```

**Integration:** In `MemoryExtractor.extractFacts()`, after extracting, call `GraphMemoryRepo.upsertEntity()` for each entity and `GraphMemoryRepo.addEdge()` for relationships.

### Entry Points

- **New file:** `packages/opencode/src/kiloclaw/memory/memory.graph.ts`
- **Schema:** `packages/opencode/src/kiloclaw/memory/memory.schema.sql.ts`
- **Extractor call:** `packages/opencode/src/kiloclaw/memory/memory.extractor.ts` (BP-01)

### Effort

- **Time:** 5-7 days (highest effort item)
- **Files changed:** 4-5 (schema, new graph.ts, extractor.ts integration, repository updates)

---

## 5. BP-03: Multi-Scope Memory

### What It Is

Mem0's 4-scope model: `user_id`, `session_id`, `agent_id`, `global`. Each scope has independent ranking composition. Enables scoped queries like "show me memories from agent X in session Y".

### Current State

`retrieve()` in `memory.broker.v2.ts` takes optional `userId` but doesn't compose rankings per scope. Repository queries use flat `tenant_id` filtering.

### Implementation

**Enhancement to `memory.ranking.ts`:**

```typescript
export interface MemoryScope {
  userId?: string
  sessionId?: string
  agentId?: string
  global?: boolean
}

export interface ScopedRetrievalResult {
  user Memories: RankedItem<any>[]
  sessionMemories: RankedItem<any>[]
  agentMemories: RankedItem<any>[]
  globalMemories: RankedItem<any>[]
  composed: RankedItem<any>[]
}

export function rankByScope(
  candidates: RankedItem<any>[],
  scope: MemoryScope,
  weights: RankingWeights,
): ScopedRetrievalResult {
  const byScope = {
    user: [] as RankedItem<any>[],
    session: [] as RankedItem<any>[],
    agent: [] as RankedItem<any>[],
    global: [] as RankedItem<any>[],
  }

  for (const candidate of candidates) {
    const item = candidate.item as any
    const itemScope = item.user_id === scope.userId ? "user"
      : item.session_id === scope.sessionId ? "session"
      : item.agent_id === scope.agentId ? "agent"
      : "global"

    byScope[itemScope].push(candidate)
  }

  // Compose with scope weighting
  // User memories get highest boost, then session, then agent, then global
  const scopeWeights = {
    user: 0.40,
    session: 0.30,
    agent: 0.20,
    global: 0.10,
  }

  const composed = [
    ...byScope.user.map(c => ({ ...c, score: c.score * scopeWeights.user })),
    ...byScope.session.map(c => ({ ...c, score: c.score * scopeWeights.session })),
    ...byScope.agent.map(c => ({ ...c, score: c.score * scopeWeights.agent })),
    ...byScope.global.map(c => ({ ...c, score: c.score * scopeWeights.global })),
  ].sort((a, b) => b.score - a.score)

  return { ...byScope, composed }
}
```

**Repository changes:** `memory.repository.ts` — add `session_id` and `agent_id` indexes:

```typescript
// In EpisodicMemoryRepo.recordEpisode, ensure session_id is stored
async recordEpisode(input: NewEpisode): Promise<string> {
  await db().insert(EpisodeTable).values({
    ...input,
    session_id: input.session_id ?? null,  // Ensure session tracking
  })
  return input.id as string
}
```

**Schema:** `EpisodeTable` should already have `session_id` from the existing schema. Verify `source_event_ids` column stores agent_id provenance.

### Entry Points

- **Ranking:** `packages/opencode/src/kiloclaw/memory/memory.ranking.ts`
- **Broker:** `packages/opencode/src/kiloclaw/memory/memory.broker.v2.ts` (retrieve method)
- **Schema:** `packages/opencode/src/kiloclaw/memory/memory.schema.sql.ts`

### Effort

- **Time:** 2-3 days
- **Files changed:** 2-3 (ranking.ts, broker.v2.ts, schema.sql verification)

---

## 6. BP-04: Async Writes

### What It Is

Memory extraction runs in background, does not block response generation. Mem0 `async_mode=True` as default. Critical for user-facing latency.

### Current State

`plugin.ts` `chat.message` hook is `async` but all writes are awaited synchronously before returning. Lines 33-55 block the hook.

### Implementation

**New file:** `packages/opencode/src/kiloclaw/memory/memory.writeback.ts`

```typescript
import { Log } from "@/util/log"
import { MemoryBrokerV2 } from "./memory.broker.v2"
import { MemoryExtractor } from "./memory.extractor"

const log = Log.create({ service: "kiloclaw.memory.writeback" })

type WritebackTask = {
  id: string
  priority: "high" | "low"
  execute: () => Promise<void>
  scheduledAt: number
}

const writebackQueue: WritebackTask[] = []
let isProcessing = false
let processTimer: ReturnType<typeof setTimeout> | null = null

const PROCESS_INTERVAL_MS = 500 // Batch every 500ms
const MAX_BATCH_SIZE = 10

export namespace MemoryWriteback {
  /**
   * Schedule a memory writeback without awaiting.
   * Non-blocking for the calling thread.
   */
  export function schedule(priority: "high" | "low", task: () => Promise<void>): void {
    const wbTask: WritebackTask = {
      id: crypto.randomUUID(),
      priority,
      execute: task,
      scheduledAt: Date.now(),
    }

    // High priority goes to front of queue
    if (priority === "high") {
      const firstLow = writebackQueue.findIndex((t) => t.priority === "low")
      if (firstLow >= 0) {
        writebackQueue.splice(firstLow, 0, wbTask)
      } else {
        writebackQueue.push(wbTask)
      }
    } else {
      writebackQueue.push(wbTask)
    }

    // Schedule flush if not already scheduled
    if (!processTimer) {
      processTimer = setTimeout(processQueue, PROCESS_INTERVAL_MS)
    }

    log.debug("writeback scheduled", { id: wbTask.id, priority, queueLength: writebackQueue.length })
  }

  /**
   * Fire-and-forget episodic + semantic write.
   * Used from plugin.ts instead of direct MemoryBrokerV2.write()
   */
  export function recordUserTurn(params: {
    sessionId: string
    messageID?: string
    agent?: string
    text: string
  }): void {
    schedule("low", async () => {
      const ts = Date.now()

      // Working memory (fast, always)
      await MemoryBrokerV2.write({
        layer: "working",
        key: `session:${params.sessionId}:last_user_query`,
        value: { text: params.text.slice(0, 1200), at: ts },
        ttlMs: 6 * 60 * 60 * 1000,
      })

      // Episodic (async)
      await MemoryBrokerV2.write({
        layer: "episodic",
        key: `session:${params.sessionId}:user_turn:${params.messageID ?? "none"}`,
        value: {
          taskDescription: params.text.slice(0, 1200),
          outcome: "user_input",
          correlationId: params.messageID,
          startedAt: ts,
          completedAt: ts,
          agentId: params.agent,
        },
      })

      // Selective extraction → semantic (async)
      if (MemoryExtractor.isWorthExtracting(params.text)) {
        const facts = await MemoryExtractor.extractFacts(params.text, {
          sessionId: params.sessionId,
          agentId: params.agent,
          correlationId: params.messageID,
        })

        for (const fact of facts) {
          await MemoryBrokerV2.semantic().assert(fact.subject, fact.predicate, fact.object, fact.confidence)
        }
      }
    })
  }

  async function processQueue(): Promise<void> {
    processTimer = null
    if (writebackQueue.length === 0) return
    if (isProcessing) {
      // Reschedule if already processing
      processTimer = setTimeout(processQueue, PROCESS_INTERVAL_MS)
      return
    }

    isProcessing = true
    const batch = writebackQueue.splice(0, MAX_BATCH_SIZE)

    log.debug("processing writeback batch", { size: batch.length, remaining: writebackQueue.length })

    for (const task of batch) {
      try {
        await task.execute()
      } catch (err) {
        log.error("writeback task failed", { id: task.id, err: String(err) })
      }
    }

    isProcessing = false

    // Continue if more items in queue
    if (writebackQueue.length > 0) {
      processTimer = setTimeout(processQueue, PROCESS_INTERVAL_MS)
    }
  }

  /**
   * Force flush all pending writebacks (used at shutdown)
   */
  export async function flush(): Promise<void> {
    if (processTimer) {
      clearTimeout(processTimer)
      processTimer = null
    }
    isProcessing = true
    while (writebackQueue.length > 0) {
      const batch = writebackQueue.splice(0, MAX_BATCH_SIZE)
      for (const task of batch) {
        try {
          await task.execute()
        } catch (err) {
          log.error("flush task failed", { id: task.id, err: String(err) })
        }
      }
    }
    isProcessing = false
  }
}
```

**Plugin change:** `plugin.ts` — replace direct `MemoryBrokerV2.write()` calls with `MemoryWriteback.recordUserTurn()`:

```typescript
// Before (blocking):
await MemoryBrokerV2.write({ layer: "working", ... })
await MemoryBrokerV2.write({ layer: "episodic", ... })

// After (non-blocking fire-and-forget):
MemoryWriteback.recordUserTurn({
  sessionId: input.sessionID,
  messageID: input.messageID ?? undefined,
  agent: input.agent,
  text: body,
})
```

### Entry Points

- **New file:** `packages/opencode/src/kiloclaw/memory/memory.writeback.ts`
- **Plugin:** `packages/opencode/src/kiloclaw/memory/plugin.ts` (lines 33-55)
- **Shutdown:** `packages/opencode/src/project/bootstrap.ts` — call `MemoryWriteback.flush()` on exit

### Effort

- **Time:** 2 days
- **Files changed:** 2 (new writeback.ts, plugin.ts)

---

## 7. BP-05: Progressive Summarization

### What It Is

Condense long conversations preserving key information. Zep's approach: periodic summarization passes that distill conversations into extractive summaries without losing key facts.

### Current State

No summarization. Full conversation text stored in episodic layer. `SessionSummary` exists in `session/summary.ts` but not used in memory pipeline.

### Implementation

**New file:** `packages/opencode/src/kiloclaw/memory/memory.summarizer.ts`

```typescript
import { Log } from "@/util/log"
import { EpisodicMemoryRepo, SemanticMemoryRepo } from "./memory.repository"
import { MemoryBrokerV2 } from "./memory.broker.v2"

const log = Log.create({ service: "kiloclaw.memory.summarizer" })

const TENANT = "default"

export namespace MemorySummarizer {
  interface SummarizationCandidate {
    sessionId: string
    episodeIds: string[]
    totalTokens: number
  }

  /**
   * Check if session needs summarization.
   * Trigger: session has > 20 episodes OR oldest episode > 24h old.
   */
  export async function needsSummarization(sessionId: string): Promise<boolean> {
    const episodes = await EpisodicMemoryRepo.getEvents(TENANT, {
      sessionId,
      limit: 100,
    })

    if (episodes.length > 20) return true

    const oldestTs = episodes.length > 0 ? Math.min(...episodes.map((e) => e.ts)) : 0

    const ageHours = (Date.now() - oldestTs) / (1000 * 60 * 60)
    return ageHours > 24
  }

  /**
   * Generate extractive summary from episode text.
   * Uses sentence scoring to pick most important sentences.
   */
  export async function summarizeEpisodes(episodeIds: string[]): Promise<{ summary: string; keyFacts: string[] }> {
    // Fetch all episode descriptions
    const episodes = await Promise.all(episodeIds.map((id) => EpisodicMemoryRepo.getEpisode(id)))

    const texts = episodes
      .filter((ep): ep is NonNullable<typeof ep> => ep !== null)
      .map((ep) => ep.task_description)
      .filter((t) => t.length > 0)

    if (texts.length === 0) {
      return { summary: "", keyFacts: [] }
    }

    // Simple extractive summarization: score sentences by term frequency
    const allText = texts.join(" ")
    const sentences = allText.split(/[.!?]+/).filter((s) => s.trim().length > 20)

    const wordFreq = new Map<string, number>()
    const words = allText.toLowerCase().split(/\s+/)
    for (const word of words) {
      if (word.length < 4) continue // skip stopwords approx
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1)
    }

    // Score each sentence
    const scored = sentences.map((sentence) => {
      const sentenceWords = sentence.toLowerCase().split(/\s+/)
      const score = sentenceWords.reduce((sum, word) => sum + (wordFreq.get(word) ?? 0), 0)
      return { sentence: sentence.trim(), score }
    })

    // Pick top 5 sentences for summary
    scored.sort((a, b) => b.score - a.score)
    const topSentences = scored.slice(0, 5)

    // Sort back to original order for coherence
    const summary =
      topSentences
        .sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence))
        .map((s) => s.sentence)
        .join(". ") + "."

    // Extract key facts as distinct noun-verb-object triplets
    const keyFacts = extractKeyFacts(texts.slice(0, 10))

    return { summary, keyFacts }
  }

  function extractKeyFacts(texts: string[]): string[] {
    const facts: string[] = []
    const seen = new Set<string>()

    for (const text of texts) {
      // Simple pattern: find "X is/are Y", "X did Y", "X uses Y"
      const patterns = [
        /(\w+(?:\s+\w+)?)\s+(?:is|are|was|were)\s+([^.!?]+)/gi,
        /(\w+(?:\s+\w+)?)\s+(?:did|does|completed?|finished)\s+([^.!?]+)/gi,
        /(\w+(?:\s+\w+)?)\s+(?:uses?|employs?|depends on)\s+([^.!?]+)/gi,
      ]

      for (const pattern of patterns) {
        let match
        while ((match = pattern.exec(text)) !== null) {
          const fact =
            `${match[1].trim()} ${pattern.source.startsWith("(") ? pattern.source.match(/is|are|was|were|did|does|uses?/)![0] : "is"} ${match[2].trim()}`.slice(
              0,
              100,
            )
          if (!seen.has(fact)) {
            seen.add(fact)
            facts.push(fact)
          }
        }
      }
    }

    return facts.slice(0, 10)
  }

  /**
   * Store summary as episodic milestone.
   */
  export async function storeSummary(sessionId: string, summary: string, keyFacts: string[]): Promise<void> {
    const now = Date.now()

    await MemoryBrokerV2.write({
      layer: "episodic",
      key: `session:${sessionId}:summary:${now}`,
      value: {
        taskDescription: `[SUMMARY] ${summary}`,
        outcome: "summarized",
        startedAt: now,
        completedAt: now,
        artifacts: { keyFacts, type: "progressive_summary" },
      },
    })

    // Promote key facts to semantic layer
    for (const fact of keyFacts) {
      await MemoryBrokerV2.semantic().assert("session_summary", fact, { sessionId, summarizedAt: now }, 0.7)
    }

    log.debug("summary stored", { sessionId, factCount: keyFacts.length })
  }
}
```

**Integration:** Call `MemorySummarizer.needsSummarization()` in `plugin.ts` on session end or periodically in background job.

### Entry Points

- **New file:** `packages/opencode/src/kiloclaw/memory/memory.summarizer.ts`
- **Session end:** `packages/opencode/src/session/index.ts` (Session.complete or similar)
- **Background job:** `packages/opencode/src/kiloclaw/memory/memory.retention.ts` (consolidation job)

### Effort

- **Time:** 3-4 days
- **Files changed:** 3-4 (new summarizer.ts, session/index.ts integration, retention.ts integration)

---

## 8. BP-06: Actor-Aware Memory

### What It Is

Tag memory sources with actor (user/agent) for provenance in multi-agent systems. Letta Group-Chat v2 uses actor tags to track which agent contributed what information.

### Current State

`provenanceQuality()` in `memory.ranking.ts` uses generic provenance strings ("user", "task", "broker"). No actor_id tracking.

### Implementation

**Schema change:** `memory.schema.sql.ts` — add `actor_id` and `actor_type` to relevant tables:

```sql
ALTER TABLE memory_events ADD COLUMN actor_type TEXT; -- 'user', 'agent', 'system', 'tool'
ALTER TABLE memory_events ADD COLUMN actor_id TEXT;
ALTER TABLE episodes ADD COLUMN actor_type TEXT;
ALTER TABLE episodes ADD COLUMN actor_id TEXT;
ALTER TABLE facts ADD COLUMN actor_type TEXT;
ALTER TABLE facts ADD COLUMN actor_id TEXT;
```

**Type changes:** `types.ts` — extend `MemoryEvent` and `Fact` schemas:

```typescript
// In types.ts
export const MemoryEventSchema = z.object({
  // ... existing fields
  actorType: z.enum(["user", "agent", "system", "tool"]).optional(),
  actorId: z.string().optional(),
})

export const FactSchema = z.object({
  // ... existing fields
  actorType: z.enum(["user", "agent", "system"]).optional(),
  actorId: z.string().optional(),
})
```

**Broker change:** `memory.broker.v2.ts` — pass actor info through write paths:

```typescript
// In episodic().record(), add actor tracking:
await EpisodicMemoryRepo.recordEvent({
  id,
  tenant_id: TENANT,
  user_id: event.userId ?? null,
  correlation_id: event.correlationId ?? null,
  event_type: event.type,
  payload: event.data,
  sensitivity: "medium",
  ts: Date.now(),
  created_at: Date.now(),
  actor_type: inferActorType(event), // 'user' if userId present, 'system' otherwise
  actor_id: event.userId ?? event.agentId ?? null,
})

// In semantic().assert(), add actor:
await SemanticMemoryRepo.assertFact({
  id,
  tenant_id: TENANT,
  subject,
  predicate,
  object: objText,
  confidence,
  provenance: "broker_v2",
  source_event_ids: [],
  valid_from: Date.now(),
  created_at: Date.now(),
  updated_at: Date.now(),
  actor_type: "agent", // broker acts on behalf of agent
  actor_id: null, // could be enhanced with agentId
})
```

**Ranking enhancement:** `memory.ranking.ts` — use actor quality in provenance:

```typescript
function provenanceQuality(provenance: string | null | undefined, actorType?: string): number {
  // Base provenance quality
  let base = 0.6
  if (provenance?.includes("user")) base = 0.95
  else if (provenance?.includes("task")) base = 0.85
  else if (provenance?.includes("broker")) base = 0.75

  // Actor bonus
  if (actorType === "user") return Math.min(1, base + 0.05)
  if (actorType === "system") return Math.max(0.3, base - 0.1)

  return base
}
```

### Entry Points

- **Schema:** `packages/opencode/src/kiloclaw/memory/memory.schema.sql.ts`
- **Types:** `packages/opencode/src/kiloclaw/memory/types.ts`
- **Broker:** `packages/opencode/src/kiloclaw/memory/memory.broker.v2.ts`
- **Ranking:** `packages/opencode/src/kiloclaw/memory/memory.ranking.ts`

### Effort

- **Time:** 1-2 days
- **Files changed:** 4 (schema, types, broker, ranking)

---

## 9. BP-07: Procedural Memory (Enhanced)

### What It Is

Separate "how to do things" from facts/preferences. Mem0 `memory_type="procedural_memory"`. Stores skill patterns, workflows, and successful strategies.

### Current State

`ProceduralMemoryRepo` exists but `MemoryConsolidation.run()` only creates procedural entries with basic fields. No pattern learning from success.

### Implementation

**Enhance `memory.consolidation.ts`:**

```typescript
// Add after successful episode detection (around line 31):
const shouldPromoteProcedure = ep.outcome === "success" && desc.length > 0
if (shouldPromoteProcedure) {
  // Check if similar procedure already exists
  const existing = await ProceduralMemoryRepo.list(TENANT, {
    scope: ep.agency_id ?? "global",
    name: `proc:${desc.slice(0, 64)}`,
  })

  if (existing.length === 0) {
    // Register new procedure
    await ProceduralMemoryRepo.register({
      id: `proc_${crypto.randomUUID()}`,
      tenant_id: TENANT,
      user_id: options?.userId ?? ep.user_id ?? null,
      scope: ep.agency_id ?? "global",
      name: `proc:${desc.slice(0, 64)}`,
      description: `Derived from successful episode ${ep.id}: ${desc.slice(0, 200)}`,
      status: "active",
      current_version: "1.0.0",
      success_rate: 100,
      usage_count: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
      // New fields for enhanced procedural memory
      pattern_tags: extractPatternTags(desc),
      steps: extractSteps(desc),
      prerequisites: extractPrerequisites(desc),
    })
  } else {
    // Update existing procedure stats
    await ProceduralMemoryRepo.updateStats(existing[0].id, true)
  }
}

// New helper functions:
function extractPatternTags(description: string): string[] {
  const tags: string[] = []
  const patterns = [
    { regex: /debug|fix|repair/i, tag: "debugging" },
    { regex: /implement|build|create|develop/i, tag: "implementation" },
    { regex: /test|verify|check/i, tag: "testing" },
    { regex: /deploy|release|publish/i, tag: "deployment" },
    { regex: /analyze|investigate|examine/i, tag: "analysis" },
    { regex: /refactor|restructure|optimize/i, tag: "refactoring" },
  ]
  for (const p of patterns) {
    if (p.regex.test(description)) tags.push(p.tag)
  }
  return tags
}

function extractSteps(description: string): string[] {
  // Split on common separators
  return description
    .split(/[,;]|\band\b|\bthen\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 5 && s.length < 100)
    .slice(0, 10)
}

function extractPrerequisites(description: string): string[] {
  const prereqs: string[] = []
  const match = description.match(/require[ds]?\s+([^.!?]+)/i)
  if (match) {
    prereqs.push(...match[1].split(/,\s*/).map((s) => s.trim()))
  }
  return prereqs
}
```

**Schema enhancement:** `ProcedureTable` needs new columns:

```sql
ALTER TABLE procedures ADD COLUMN pattern_tags TEXT; -- JSON array
ALTER TABLE procedures ADD COLUMN steps TEXT; -- JSON array
ALTER TABLE procedures ADD COLUMN prerequisites TEXT; -- JSON array
```

### Entry Points

- **Consolidation:** `packages/opencode/src/kiloclaw/memory/memory.consolidation.ts`
- **Schema:** `packages/opencode/src/kiloclaw/memory/memory.schema.sql.ts`
- **Repository:** `packages/opencode/src/kiloclaw/memory/memory.repository.ts` (ProceduralMemoryRepo)

### Effort

- **Time:** 2-3 days
- **Files changed:** 3 (consolidation.ts, schema.sql, repository.ts)

---

## 10. BP-08: Reranking Pipeline

### What It Is

After vector retrieval, rerank candidates with cross-encoder for precision. Cohere Rerank, FlashRank, or bge-reranker-v2-m3. **Critical for accuracy** — vector similarity ≠ relevance for complex queries.

### Current State

`memory.broker.v2.ts` lines 434-469: `similaritySearch()` returns raw cosine similarity. No reranking step before `rank()` function.

### Implementation

**New file:** `packages/opencode/src/kiloclaw/memory/memory.reranker.ts`

```typescript
import { Log } from "@/util/log"
import { MemoryEmbedding } from "./memory.embedding"

const log = Log.create({ service: "kiloclaw.memory.reranker" })

export interface RerankCandidate {
  id: string
  content: string
  originalScore: number
  metadata?: Record<string, unknown>
}

export interface RerankResult {
  id: string
  rerankScore: number
  originalScore: number
  content: string
}

export namespace MemoryReranker {
  /**
   * Rerank candidates using cross-encoder-style scoring.
   * For MVP without full cross-encoder, use embedding + score fusion.
   */
  export async function rerank(
    query: string,
    candidates: RerankCandidate[],
    topK: number = 10,
  ): Promise<RerankResult[]> {
    if (candidates.length === 0) return []
    if (candidates.length === 1) {
      return [
        {
          id: candidates[0].id,
          rerankScore: candidates[0].originalScore,
          originalScore: candidates[0].originalScore,
          content: candidates[0].content,
        },
      ]
    }

    const queryEmbedding = await MemoryEmbedding.embed(query)

    // Score each candidate against query embedding
    const scored = await Promise.all(
      candidates.map(async (candidate) => {
        const candidateEmbedding = await MemoryEmbedding.embed(candidate.content)
        const rerankScore = cosineSimilarity(queryEmbedding, candidateEmbedding)

        // Fusion: combine original vector score with rerank score
        // Original score has 40% weight, rerank has 60%
        const fusedScore = 0.4 * candidate.originalScore + 0.6 * rerankScore

        return {
          id: candidate.id,
          rerankScore: fusedScore,
          originalScore: candidate.originalScore,
          content: candidate.content,
          metadata: candidate.metadata,
        } satisfies RerankResult
      }),
    )

    // Sort by rerank score descending
    scored.sort((a, b) => b.rerankScore - a.rerankScore)

    log.debug("reranked candidates", {
      inputCount: candidates.length,
      outputCount: scored.length,
      topScore: scored[0]?.rerankScore,
    })

    return scored.slice(0, topK)
  }

  /**
   * Lightweight rerank using lexical + score fusion (no extra embeddings).
   * Use when embedding latency is a concern.
   */
  export function rerankLexical(query: string, candidates: RerankCandidate[], topK: number = 10): RerankResult[] {
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)

    const scored = candidates.map((candidate) => {
      const contentLower = candidate.content.toLowerCase()

      // Lexical overlap score
      let overlap = 0
      for (const term of queryTerms) {
        if (contentLower.includes(term)) overlap++
      }
      const lexicalScore = queryTerms.length > 0 ? overlap / queryTerms.length : 0

      // BM25-style term frequency
      const bm25 = computeBM25(queryTerms, candidate.content)

      // Fusion
      const rerankScore = 0.3 * candidate.originalScore + 0.4 * lexicalScore + 0.3 * bm25

      return {
        id: candidate.id,
        rerankScore,
        originalScore: candidate.originalScore,
        content: candidate.content,
      }
    })

    scored.sort((a, b) => b.rerankScore - a.rerankScore)
    return scored.slice(0, topK)
  }

  function computeBM25(queryTerms: string[], document: string): number {
    const docLower = document.toLowerCase()
    const docTerms = docLower.split(/\s+/)
    const docLen = docTerms.length
    if (docLen === 0) return 0

    const avgDocLen = 100 // approximate
    const k1 = 1.5
    const b = 0.75

    let score = 0
    for (const term of queryTerms) {
      const tf = docTerms.filter((t) => t === term).length
      const idf = Math.log((docTerms.length + 1) / (tf + 1))
      score += (idf * (tf * (k1 + 1))) / (tf + k1 * (1 - b + (b * docLen) / avgDocLen))
    }

    return Math.max(0, score / queryTerms.length)
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0,
    normA = 0,
    normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
```

**Integration in `memory.broker.v2.ts`:**

```typescript
// Around line 434, after semanticVec is populated:
let semanticResults = semanticVec

// Apply reranking if we have candidates
if (semanticResults.length > 1 && q.length > 0) {
  const rerankCandidates: RerankCandidate[] = semanticResults.map((r) => ({
    id: r.fact.id,
    content: `${r.fact.subject} ${r.fact.predicate} ${r.fact.object}`,
    originalScore: r.similarity,
    metadata: { fact: r.fact },
  }))

  const reranked = await MemoryReranker.rerank(q, rerankCandidates, Math.max(limit * 2, 50))

  // Replace with reranked results
  semanticResults = reranked.map((r) => ({
    fact: r.metadata?.fact ?? r,
    similarity: r.rerankScore,
  }))
}
```

### Entry Points

- **New file:** `packages/opencode/src/kiloclaw/memory/memory.reranker.ts`
- **Broker:** `packages/opencode/src/kiloclaw/memory/memory.broker.v2.ts` (retrieve method, around line 434)

### Effort

- **Time:** 1-2 days
- **Files changed:** 2 (new reranker.ts, broker.v2.ts)

---

## 11. BP-09: Metadata Filtering

### What It Is

Structured metadata for scoped queries (time range, topic, actor filters). Enables precise retrieval without full scan.

### Current State

`retrieve()` in broker has `userId` filter but no time range, topic, or actor filters. Repository `queryFacts()` supports basic subject/predicate/minConfidence filters.

### Implementation

**Enhance repository queries:** `memory.repository.ts`

```typescript
// Extend SemanticMemoryRepo.queryFacts with more filters
async queryFacts(
  tenantId: string,
  options?: {
    userId?: string
    subject?: string
    predicate?: string
    minConfidence?: number
    includeExpired?: boolean
    // New filters:
    actorType?: string
    actorId?: string
    since?: number
    until?: number
    topic?: string
    tags?: string[]
  },
): Promise<Fact[]> {
  const conditions = [eq(FactTable.tenant_id, tenantId)]

  if (options?.userId) conditions.push(eq(FactTable.user_id, options.userId))
  if (options?.subject) conditions.push(like(FactTable.subject, `%${options.subject}%`))
  if (options?.predicate) conditions.push(like(FactTable.predicate, `%${options.predicate}%`))
  if (options?.minConfidence) conditions.push(sql`${FactTable.confidence} >= ${options.minConfidence}`)
  if (options?.actorType) conditions.push(eq(FactTable.actor_type, options.actorType))
  if (options?.actorId) conditions.push(eq(FactTable.actor_id, options.actorId))
  if (options?.since) conditions.push(sql`${FactTable.created_at} >= ${options.since}`)
  if (options?.until) conditions.push(sql`${FactTable.created_at} <= ${options.until}`)

  // Exclude expired by default
  if (!options?.includeExpired) {
    conditions.push(sql`${FactTable.valid_to} IS NULL`)
  }

  return db()
    .select()
    .from(FactTable)
    .where(and(...conditions))
    .orderBy(desc(FactTable.confidence))
}
```

**Broker enhancement:** Add filter options to `retrieve()`:

```typescript
async retrieve(options: {
  query?: string
  userId?: string
  limit?: number
  budget?: Partial<TokenBudget>
  weights?: typeof DEFAULT_WEIGHTS
  // New filter options:
  actorType?: string
  actorId?: string
  since?: number
  until?: number
  topic?: string
  layer?: "working" | "episodic" | "semantic" | "procedural"
}): Promise<{ items: RankedItem<any>[]; tokenUsage: number }> {
  // ... existing logic, pass filters to repository calls

  // For episodic:
  const episodes = await EpisodicMemoryRepo.getRecentEpisodes(TENANT, Math.max(limit * 2, 50), options.since)
  // Filter by actor/time if provided
  const filteredEpisodes = episodes.filter(ep => {
    if (options.actorType && ep.actor_type !== options.actorType) return false
    if (options.actorId && ep.actor_id !== options.actorId) return false
    if (options.since && ep.completed_at < options.since) return false
    if (options.until && ep.completed_at > options.until) return false
    return true
  })
}
```

**Plugin enhancement:** Pass filter context from session:

```typescript
// In plugin.ts recall query, could filter by:
const mem = await MemoryBrokerV2.retrieve({
  query: text,
  limit: 6,
  actorType: "user", // only user-contributed memories
  since: Date.now() - 7 * 24 * 60 * 60 * 1000, // last 7 days
})
```

### Entry Points

- **Repository:** `packages/opencode/src/kiloclaw/memory/memory.repository.ts`
- **Broker:** `packages/opencode/src/kiloclaw/memory/memory.broker.v2.ts`
- **Plugin:** `packages/opencode/src/kiloclaw/memory/plugin.ts`

### Effort

- **Time:** 1-2 days
- **Files changed:** 3 (repository.ts, broker.v2.ts, plugin.ts)

---

## 12. BP-10: Background Extraction

### What It Is

Post-conversation memory extraction without blocking agent execution. Similar to async writes (BP-04) but for consolidation/extraction phase.

### Current State

`MemoryConsolidation.run()` is called manually or via scheduled job. Not integrated into post-conversation flow.

### Implementation

**New file:** `packages/opencode/src/kiloclaw/memory/memory.background.ts`

```typescript
import { Log } from "@/util/log"
import { MemoryConsolidation } from "./memory.consolidation"
import { MemoryWriteback } from "./memory.writeback"

const log = Log.create({ service: "kiloclaw.memory.background" })

type BackgroundJob = {
  id: string
  type: "consolidation" | "extraction" | "purge"
  scheduledAt: number
  execute: () => Promise<void>
}

const backgroundQueue: BackgroundJob[] = []
let isProcessing = false
let processTimer: ReturnType<typeof setTimeout> | null = null

const PROCESS_INTERVAL_MS = 60 * 1000 // Every minute

export namespace MemoryBackground {
  /**
   * Schedule consolidation run in background.
   */
  export function scheduleConsolidation(options?: { since?: number; limit?: number; userId?: string }): void {
    const job: BackgroundJob = {
      id: crypto.randomUUID(),
      type: "consolidation",
      scheduledAt: Date.now(),
      execute: async () => {
        log.info("running background consolidation", { options })
        await MemoryConsolidation.run(options)
      },
    }

    backgroundQueue.push(job)
    scheduleNext()
    log.debug("consolidation scheduled", { jobId: job.id })
  }

  /**
   * Schedule extraction for a session.
   */
  export function scheduleExtraction(sessionId: string): void {
    const job: BackgroundJob = {
      id: crypto.randomUUID(),
      type: "extraction",
      scheduledAt: Date.now(),
      execute: async () => {
        log.info("running background extraction", { sessionId })
        // Trigger summarization if needed
        const { MemorySummarizer } = await import("./memory.summarizer")
        if (await MemorySummarizer.needsSummarization(sessionId)) {
          // Would need episode IDs - simplified for now
          log.debug("session needs summarization", { sessionId })
        }
      },
    }

    backgroundQueue.push(job)
    scheduleNext()
  }

  function scheduleNext(): void {
    if (processTimer || isProcessing || backgroundQueue.length === 0) return
    processTimer = setTimeout(processQueue, PROCESS_INTERVAL_MS)
  }

  async function processQueue(): Promise<void> {
    processTimer = null
    if (backgroundQueue.length === 0) return
    if (isProcessing) {
      scheduleNext()
      return
    }

    isProcessing = true
    const job = backgroundQueue.shift()!

    log.debug("processing background job", { jobId: job.id, type: job.type })

    try {
      await job.execute()
    } catch (err) {
      log.error("background job failed", { jobId: job.id, err: String(err) })
    }

    isProcessing = false
    scheduleNext()
  }

  /**
   * Get queue status for diagnostics.
   */
  export function getStatus(): { queued: number; processing: boolean } {
    return {
      queued: backgroundQueue.length,
      processing: isProcessing,
    }
  }
}
```

**Integration:** In `SessionPrompt` at conversation end, schedule consolidation:

```typescript
// In prompt.ts, after response is sent (around line 1370+)
// Check if it's a good time to consolidate
if (session.hasSignificantChanges) {
  MemoryBackground.scheduleConsolidation({
    since: Date.now() - 24 * 60 * 60 * 1000,
    limit: 100,
  })
}
```

### Entry Points

- **New file:** `packages/opencode/src/kiloclaw/memory/memory.background.ts`
- **Session end:** `packages/opencode/src/session/prompt.ts` (around line 1370, after response)
- **Shutdown:** `bootstrap.ts` — flush background queue

### Effort

- **Time:** 1-2 days
- **Files changed:** 3 (new background.ts, prompt.ts, bootstrap.ts)

---

## 13. BP-11: Memory Controller (ADD/UPDATE/DELETE/NOOP)

### What It Is

Explicit decisions: what to store, where, which operation (ADD/UPDATE/DELETE/NOOP). Each incoming memory event gets classified into one of four operations.

### Current State

No controller. All writes are ADD operations. No UPDATE for existing facts, no contradiction detection.

### Implementation

**New file:** `packages/opencode/src/kiloclaw/memory/memory.controller.ts`

```typescript
import { Log } from "@/util/log"
import { SemanticMemoryRepo, EpisodicMemoryRepo } from "./memory.repository"
import { MemoryEmbedding } from "./memory.embedding"

const log = Log.create({ service: "kiloclaw.memory.controller" })

const TENANT = "default"

export type MemoryOperation = "ADD" | "UPDATE" | "DELETE" | "NOOP"

export interface ControllerDecision {
  operation: MemoryOperation
  targetLayer: "working" | "episodic" | "semantic" | "procedural"
  targetId?: string
  reasoning: string
  confidence: number
}

export namespace MemoryController {
  /**
   * Decide what operation to perform for an incoming memory event.
   * Returns ADD/UPDATE/DELETE/NOOP decision.
   */
  export async function decide(
    entry: {
      layer?: "working" | "episodic" | "semantic" | "procedural"
      key: string
      value: unknown
      subject?: string
      predicate?: string
    },
    existingFacts?: Array<{ id: string; subject: string; predicate: string; object: unknown }>,
  ): Promise<ControllerDecision> {
    // If no existing facts and we're writing semantic → ADD
    if (entry.layer === "semantic" && entry.subject && entry.predicate) {
      if (!existingFacts || existingFacts.length === 0) {
        return {
          operation: "ADD",
          targetLayer: "semantic",
          reasoning: "No existing fact, create new",
          confidence: 0.9,
        }
      }

      // Check for contradictions
      for (const fact of existingFacts) {
        if (fact.subject === entry.subject && fact.predicate === entry.predicate) {
          // Same subject+predicate found
          const existingObj = typeof fact.object === "string" ? fact.object : JSON.stringify(fact.object)
          const newObj = typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value)

          if (existingObj === newObj) {
            return {
              operation: "NOOP",
              targetLayer: "semantic",
              targetId: fact.id,
              reasoning: "Identical fact already exists",
              confidence: 0.95,
            }
          }

          // Contradiction detected - UPDATE
          return {
            operation: "UPDATE",
            targetLayer: "semantic",
            targetId: fact.id,
            reasoning: `Contradiction detected: "${existingObj}" → "${newObj}"`,
            confidence: 0.8,
          }
        }
      }

      // No match found → ADD
      return {
        operation: "ADD",
        targetLayer: "semantic",
        reasoning: "New subject+predicate combination",
        confidence: 0.85,
      }
    }

    // For episodic/working, always ADD (append-only)
    if (entry.layer === "episodic" || entry.layer === "working") {
      return {
        operation: "ADD",
        targetLayer: entry.layer ?? "episodic",
        reasoning: "Episodic/working layer is append-only",
        confidence: 0.95,
      }
    }

    // Default fallback
    return {
      operation: "ADD",
      targetLayer: entry.layer ?? "episodic",
      reasoning: "Default to ADD",
      confidence: 0.5,
    }
  }

  /**
   * Execute the controller decision.
   */
  export async function execute(
    decision: ControllerDecision,
    entry: {
      key: string
      value: unknown
      subject?: string
      predicate?: string
    },
  ): Promise<string | null> {
    switch (decision.operation) {
      case "ADD":
        if (decision.targetLayer === "semantic" && entry.subject && entry.predicate) {
          const id = `fact_${crypto.randomUUID()}`
          const objText = typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value)
          await SemanticMemoryRepo.assertFact({
            id,
            tenant_id: TENANT,
            subject: entry.subject,
            predicate: entry.predicate,
            object: objText,
            confidence: decision.confidence,
            provenance: "memory_controller",
            source_event_ids: [],
            valid_from: Date.now(),
            created_at: Date.now(),
            updated_at: Date.now(),
          })
          return id
        }
        // For other layers, use broker.write
        return null

      case "UPDATE":
        if (decision.targetId && decision.targetLayer === "semantic") {
          await SemanticMemoryRepo.updateFact(decision.targetId, entry.value)
          return decision.targetId
        }
        return null

      case "DELETE":
        if (decision.targetId && decision.targetLayer === "semantic") {
          await SemanticMemoryRepo.deleteFact(decision.targetId)
          return decision.targetId
        }
        return null

      case "NOOP":
        log.debug("noop decision", { reasoning: decision.reasoning })
        return null
    }
  }

  /**
   * Check for contradictions before writing new fact.
   */
  export async function checkContradiction(
    subject: string,
    predicate: string,
    newObject: unknown,
  ): Promise<{ hasContradiction: boolean; existingFact?: { object: unknown; id: string } }> {
    const existing = await SemanticMemoryRepo.queryFacts(TENANT, {
      subject,
      minConfidence: 50,
    })

    for (const fact of existing) {
      if (fact.predicate === predicate) {
        const existingObj = typeof fact.object === "string" ? fact.object : JSON.stringify(fact.object)
        const newObj = typeof newObject === "string" ? newObject : JSON.stringify(newObject)

        if (existingObj !== newObj) {
          return {
            hasContradiction: true,
            existingFact: { object: fact.object, id: fact.id },
          }
        }
      }
    }

    return { hasContradiction: false }
  }
}
```

**Integration:** Wrap semantic writes in controller:

```typescript
// In broker.v2.ts semantic().assert(), use controller:
const existingFacts = await SemanticMemoryRepo.queryFacts(TENANT, { subject, minConfidence: 30 })
const decision = await MemoryController.decide(
  { layer: "semantic", key: "", value: object, subject, predicate },
  existingFacts,
)
log.debug("memory controller decision", { operation: decision.operation, reasoning: decision.reasoning })
await MemoryController.execute(decision, { key: "", value: object, subject, predicate })
```

### Entry Points

- **New file:** `packages/opencode/src/kiloclaw/memory/memory.controller.ts`
- **Broker:** `packages/opencode/src/kiloclaw/memory/memory.broker.v2.ts` (semantic assert path)
- **Ranking:** `packages/opencode/src/kiloclaw/memory/memory.ranking.ts` (add contradiction penalty)

### Effort

- **Time:** 2-3 days
- **Files changed:** 3 (new controller.ts, broker.v2.ts, ranking.ts)

---

## 14. BP-12: Memory Maintenance Operations

### What It Is

Periodic operations: ADD (new facts), UPDATE (revise existing), DELETE (remove outdated/contradicted), NOOP (deliberate skipping). Maintenance job runs on schedule.

### Current State

`MemoryRetention` has TTL cleanup but no comprehensive maintenance. No scheduled deduplication, no stale fact cleanup.

### Implementation

**New file:** `packages/opencode/src/kiloclaw/memory/memory.maintenance.ts`

```typescript
import { Log } from "@/util/log"
import { SemanticMemoryRepo, EpisodicMemoryRepo, ProceduralMemoryRepo } from "./memory.repository"
import { MemoryController } from "./memory.controller"

const log = Log.create({ service: "kiloclaw.memory.maintenance" })

const TENANT = "default"

export interface MaintenanceStats {
  deduplicated: number
  deleted: number
  updated: number
  noop: number
  duration: number
}

export namespace MemoryMaintenance {
  /**
   * Run full maintenance pass.
   */
  export async function run(options?: {
    deduplicateWindowMs?: number
    staleThresholdDays?: number
    maxFactsPerSubject?: number
  }): Promise<MaintenanceStats> {
    const start = Date.now()
    const stats = { deduplicated: 0, deleted: 0, updated: 0, noop: 0 }

    log.info("maintenance run started")

    // 1. Deduplicate semantic facts
    const dedupStats = await deduplicateFacts(options?.maxFactsPerSubject ?? 5)
    stats.deduplicated = dedupStats

    // 2. Delete stale facts
    const deleteStats = await deleteStaleFacts(options?.staleThresholdDays ?? 90)
    stats.deleted = deleteStats

    // 3. Update low-confidence facts
    const updateStats = await refreshLowConfidenceFacts()
    stats.updated = updateStats

    stats.duration = Date.now() - start
    log.info("maintenance run completed", stats)
    return stats
  }

  /**
   * Deduplicate: keep highest confidence fact per subject+predicate.
   */
  async function deduplicateFacts(maxPerGroup: number): Promise<number> {
    const facts = await SemanticMemoryRepo.queryFacts(TENANT, { minConfidence: 0 })

    // Group by subject+predicate
    const groups = new Map<string, typeof facts>()
    for (const fact of facts) {
      const key = `${fact.subject}|${fact.predicate}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(fact)
    }

    let removed = 0
    for (const [key, group] of groups) {
      if (group.length <= maxPerGroup) continue

      // Sort by confidence, keep top N
      group.sort((a, b) => b.confidence - a.confidence)
      const toDelete = group.slice(maxPerGroup)

      for (const fact of toDelete) {
        await SemanticMemoryRepo.deleteFact(fact.id)
        removed++
      }

      log.debug("deduplicated group", { key, removed: toDelete.length, kept: maxPerGroup })
    }

    return removed
  }

  /**
   * Delete facts older than threshold with low confidence.
   */
  async function deleteStaleFacts(thresholdDays: number): Promise<number> {
    const cutoff = Date.now() - thresholdDays * 24 * 60 * 60 * 1000
    const facts = await SemanticMemoryRepo.queryFacts(TENANT, { minConfidence: 0 })

    let deleted = 0
    for (const fact of facts) {
      const age = Date.now() - (fact.updated_at ?? fact.created_at)
      if (age > cutoff) continue // Skip if not stale

      // Delete if confidence < 40 and age > 30 days
      if (fact.confidence < 40 && age > 30 * 24 * 60 * 60 * 1000) {
        await SemanticMemoryRepo.deleteFact(fact.id)
        deleted++
      }
    }

    return deleted
  }

  /**
   * Refresh facts that could benefit from recent evidence.
   */
  async function refreshLowConfidenceFacts(): Promise<number> {
    const facts = await SemanticMemoryRepo.queryFacts(TENANT, { minConfidence: 0 })

    let updated = 0
    for (const fact of facts) {
      // Boost confidence for facts that haven't been updated in a while
      // but have high provenance
      const age = Date.now() - (fact.updated_at ?? fact.created_at)
      const ageDays = age / (24 * 60 * 60 * 1000)

      if (fact.confidence < 70 && ageDays > 14) {
        // Gently boost confidence
        const newConfidence = Math.min(85, fact.confidence + 5)
        await SemanticMemoryRepo.updateFact(fact.id, {
          ...JSON.parse(fact.object as string),
          _refreshed: true,
        })
        // Note: would need updateFactConfidence() method
        updated++
      }
    }

    return updated
  }

  /**
   * Get maintenance schedule.
   */
  export function getSchedule(): { intervalMs: number; description: string } {
    return {
      intervalMs: 6 * 60 * 60 * 1000, // Every 6 hours
      description: "Full maintenance: deduplication, stale deletion, confidence refresh",
    }
  }
}
```

**Integration:** Add to `bootstrap.ts` or as cron-like scheduled job:

```typescript
// In project bootstrap or app startup:
const schedule = MemoryMaintenance.getSchedule()
setInterval(() => {
  MemoryMaintenance.run().catch((err) => log.error("maintenance failed", { err }))
}, schedule.intervalMs)
```

### Entry Points

- **New file:** `packages/opencode/src/kiloclaw/memory/memory.maintenance.ts`
- **Bootstrap:** `packages/opencode/src/project/bootstrap.ts` (or app startup)
- **Schema:** May need `updateFactConfidence()` method in repository

### Effort

- **Time:** 2 days
- **Files changed:** 2 (new maintenance.ts, bootstrap.ts or repository.ts)

---

## 15. BP-13: Retrieval as Pipeline

### What It Is

Retrieval pipeline: candidate generation → expansion → prioritization → reranking → packaging → injection. Each stage is distinct and ordered.

### Current State

`retrieve()` in broker is a single large function. Not organized as distinct pipeline stages. BP-08 (reranking) partially addresses reranking but not full pipeline.

### Implementation

**Refactor `memory.broker.v2.ts` retrieve method into pipeline stages:**

```typescript
// Pipeline stages as separate functions:
export namespace MemoryRetrievalPipeline {
  interface RetrievalPipelineConfig {
    query: string
    userId?: string
    limit: number
    budget: TokenBudget
    weights: RankingWeights
    scopes?: MemoryScope
    filters?: RetrievalFilters
  }

  interface RetrievalFilters {
    actorType?: string
    since?: number
    until?: number
    layer?: Layer
    topic?: string
  }

  /**
   * Stage 1: Candidate Generation
   */
  async function generateCandidates(config: RetrievalPipelineConfig): Promise<RankedItem<any>[]> {
    const { query, userId, limit } = config
    const candidates: RankedItem<any>[] = []

    // Working memory candidates
    const workingItems = await WorkingMemoryRepo.getMany(TENANT, [])
    for (const [key, value] of Object.entries(workingItems)) {
      candidates.push({
        item: { id: key, layer: "working", key, value, timestamp: Date.now() },
        score: 0,
        factors: {
          /* ... */
        },
        explain: ["working_candidate"],
      })
    }

    // Episodic candidates
    const episodes = await EpisodicMemoryRepo.getRecentEpisodes(TENANT, limit * 2)
    for (const ep of episodes) {
      candidates.push({
        item: { layer: "episodic", ...ep },
        score: 0,
        factors: {
          /* ... */
        },
        explain: ["episodic_candidate"],
      })
    }

    // Semantic candidates (vector search)
    if (query.length > 0) {
      const emb = await MemoryEmbedding.embed(query).catch(() => null)
      if (emb) {
        const semanticVec = await SemanticMemoryRepo.similaritySearch(emb, limit * 2, TENANT)
        for (const row of semanticVec) {
          candidates.push({
            item: { layer: "semantic", ...row.fact },
            score: 0,
            factors: {
              /* ... */
            },
            explain: ["semantic_candidate"],
          })
        }
      }
    }

    // Procedural candidates
    const procs = await ProceduralMemoryRepo.list(TENANT, { status: "active" })
    for (const proc of procs) {
      candidates.push({
        item: { layer: "procedural", ...proc },
        score: 0,
        factors: {
          /* ... */
        },
        explain: ["procedural_candidate"],
      })
    }

    return candidates
  }

  /**
   * Stage 2: Candidate Expansion (add related entities via graph)
   */
  async function expandCandidates(candidates: RankedItem<any>[]): Promise<RankedItem<any>[]> {
    // For each semantic candidate, fetch connected entities from graph
    const expanded: RankedItem<any>[] = [...candidates]

    for (const candidate of candidates) {
      if ((candidate.item as any).layer !== "semantic") continue
      const fact = candidate.item as any

      try {
        const connected = await GraphMemoryRepo.getConnected(fact.id)
        for (const edge of connected) {
          // Fetch the related entity
          const relatedFact = await SemanticMemoryRepo.getFact(edge.target_id)
          if (relatedFact) {
            expanded.push({
              item: { layer: "semantic", ...relatedFact, _expanded: true },
              score: candidate.score * 0.8, // Slight penalty for expanded
              factors: candidate.factors,
              explain: [...candidate.explain, "graph_expanded"],
            })
          }
        }
      } catch {
        // Graph not available, skip expansion
      }
    }

    return expanded
  }

  /**
   * Stage 3: Prioritization (apply weights and thresholds)
   */
  function prioritize(
    candidates: RankedItem<any>[],
    weights: RankingWeights,
    thresholds: RankingThresholds,
  ): RankedItem<any>[] {
    return rank(candidates, weights, thresholds)
  }

  /**
   * Stage 4: Reranking (apply BP-08 reranker)
   */
  async function rerank(candidates: RankedItem<any>[], query: string): Promise<RankedItem<any>[]> {
    if (candidates.length <= 1) return candidates

    const rerankCandidates: RerankCandidate[] = candidates.map((c) => ({
      id: (c.item as any).id ?? JSON.stringify(c.item),
      content: extractContent(c.item),
      originalScore: c.score,
      metadata: { item: c.item },
    }))

    const reranked = await MemoryReranker.rerank(query, rerankCandidates, candidates.length)

    return reranked.map((r) => ({
      item: r.metadata?.item ?? r,
      score: r.rerankScore,
      factors: {},
      explain: ["reranked"],
    }))
  }

  /**
   * Stage 5: Packaging (structure for injection)
   */
  function packageForInjection(
    candidates: RankedItem<any>[],
    budget: TokenBudget,
    maxTokens: number,
  ): { selected: RankedItem<any>[]; tokenUsage: number } {
    return applyBudget(candidates, budget, maxTokens)
  }

  function extractContent(item: any): string {
    if (item?.task_description) return String(item.task_description)
    if (item?.subject || item?.predicate || item?.object) {
      return `${item.subject ?? ""} ${item.predicate ?? ""} ${String(item.object ?? "")}`.trim()
    }
    if (item?.name || item?.description) return `${item.name ?? ""} ${item.description ?? ""}`.trim()
    return JSON.stringify(item)
  }

  /**
   * Full pipeline execution.
   */
  export async function retrieve(config: RetrievalPipelineConfig) {
    const started = performance.now()

    // 1. Generate
    let candidates = await generateCandidates(config)

    // 2. Expand
    candidates = await expandCandidates(candidates)

    // 3. Prioritize
    candidates = prioritize(candidates, config.weights, DEFAULT_THRESHOLDS)

    // 4. Rerank
    if (config.query.length > 0) {
      candidates = await rerank(candidates, config.query)
    }

    // 5. Package
    const maxTokens = config.limit * 100
    const result = packageForInjection(candidates, config.budget, maxTokens)

    MemoryMetrics.observeRetrieval(performance.now() - started, result.tokenUsage, result.selected.length)
    return result
  }
}
```

**Update `retrieve()` method to delegate:**

```typescript
async retrieve(options) {
  return MemoryRetrievalPipeline.retrieve({
    query: options.query ?? "",
    userId: options.userId,
    limit: options.limit ?? 50,
    budget: { ...DEFAULT_BUDGET, ...options.budget },
    weights: options.weights ?? DEFAULT_WEIGHTS,
  })
}
```

### Entry Points

- **Broker:** `packages/opencode/src/kiloclaw/memory/memory.broker.v2.ts` (retrieve method)
- **New pipeline:** Could be new file `memory.retrieval-pipeline.ts` or inline namespace

### Effort

- **Time:** 3-4 days (refactoring)
- **Files changed:** 1-2 (broker.v2.ts refactor)

---

## 16. BP-14: Packaging Matters More Than Ranking

### What It Is

Structure retrieved memory for reliable model consumption, stable injection location. The _format_ of injected context matters as much as _what_ is injected.

### Current State

`plugin.ts` lines 106-116: Simple `<system-reminder>` block with bullet points. No structured formatting, no section headers, no confidence indicators.

### Implementation

**New file:** `packages/opencode/src/kiloclaw/memory/memory.packager.ts`

```typescript
import { Log } from "@/util/log"
import type { RankedItem } from "./memory.ranking"

const log = Log.create({ service: "kiloclaw.memory.packager" })

export interface PackagingConfig {
  includeConfidence: boolean
  includeLayer: boolean
  includeTimestamp: boolean
  maxAgeHint: boolean
  structuredFormat: boolean
}

export const DEFAULT_PACKAGING_CONFIG: PackagingConfig = {
  includeConfidence: true,
  includeLayer: true,
  includeTimestamp: true,
  maxAgeHint: true,
  structuredFormat: true,
}

export namespace MemoryPackager {
  /**
   * Package ranked memory items for prompt injection.
   * Returns structured blocks that are easy for LLM to parse.
   */
  export function packageMemory(
    items: RankedItem<any>[],
    config: Partial<PackagingConfig> = {},
  ): string {
    const cfg = { ...DEFAULT_PACKAGING_CONFIG, ...config }

    if (items.length === 0) {
      return "No relevant memories found."
    }

    if (cfg.structuredFormat) {
      return packageAsStructuredBlocks(items, cfg)
    } else {
      return packageAsSimpleList(items, cfg)
    }
  }

  function packageAsStructuredBlocks(items: RankedItem<any>[], cfg: PackagingConfig): string {
    // Group by layer for organized presentation
    const byLayer = new Map<string, RankedItem<any>[]>()
    for (const item of items) {
      const layer = (item.item as any).layer ?? "unknown"
      if (!byLayer.has(layer)) byLayer.set(layer, [])
      byLayer.get(layer)!.push(item)
    }

    const sections: string[] = []

    // Working memory section
    if (byLayer.has("working")) {
      const workingItems = byLayer.get("working")!
      sections.push("## Working Memory (Current Session)")
      sections.push("| Key | Value |")
      sections.push("|---|---|")
      for (const item of workingItems.slice(0, 5)) {
        const key = (item.item as any).key ?? ""
        const value = formatValue((item.item as any).value)
        sections.push(`| ${key} | ${value} |`)
      }
      sections.push("")
    }

    // Episodic section
    if (byLayer.has("episodic")) {
      const episodicItems = byLayer.get("episodic")!
      sections.push("## Recent Episodes")
      for (const item of episodicItems.slice(0, 5)) {
        const ep = item.item as any
        const desc = ep.task_description?.slice(0, 100) ?? "Unknown task"
        const outcome = ep.outcome ?? "unknown"
        const age = ep.completed_at ? formatAge(Date.now() - ep.completed_at) : "unknown"

        let line = `- **${desc}**`
        if (cfg.includeLayer) line += ` [${outcome}]`
        if (cfg.maxAgeHint) line += ` — ${age}`
        if (cfg.includeConfidence && item.factors?.confidence) {
          line += ` (${Math.round(item.factors.confidence * 100)}% confidence)`
        }
        sections.push(line)
      }
      sections.push("")
    }

    // Semantic section
    if (byLayer.has("semantic")) {
      const semanticItems = byLayer.get("semantic")!
      sections.push("## Knowledge & Facts")
      for (const item of semanticItems.slice(0, 8)) {
        const fact = item.item as any
        const text = `${fact.subject ?? ""} ${fact.predicate ?? ""} ${formatValue(fact.object)}`.trim()
        let line = `- ${text}"
        if (cfg.includeConfidence && item.factors?.confidence) {
          line += ` (${Math.round(item.factors.confidence * 100)}% confidence)`
        }
        sections.push(line)
      }
      sections.push("")
    }

    // Procedural section
    if (byLayer.has("procedural")) {
      const procItems = byLayer.get("procedural")!
      sections.push("## Procedures & Patterns")
      for (const item of procItems.slice(0, 5)) {
        const proc = item.item as any
        const name = proc.name?.slice(0, 60) ?? "Unnamed procedure"
        const success = proc.success_rate ?? 0
        let line = `- ${name}`
        if (cfg.includeConfidence) line += ` (${success}% success rate)`
        sections.push(line)
      }
      sections.push("")
    }

    return [
      "<memory>",
      ...sections,
      "</memory>",
    ].join("\n")
  }

  function packageAsSimpleList(items: RankedItem<any>[], cfg: PackagingConfig): string {
    return items
      .slice(0, 10)
      .map(item => {
        const text = extractText(item.item)
        let line = `- ${text}"
        if (cfg.includeLayer) line += ` [${(item.item as any).layer}]`
        if (cfg.includeConfidence) line += ` (${Math.round((item.factors?.confidence ?? 0.5) * 100)}%)`
        return line
      })
      .join("\n")
  }

  function formatValue(value: unknown): string {
    if (typeof value === "string") return value.slice(0, 80)
    if (typeof value === "object") return JSON.stringify(value).slice(0, 80)
    return String(value).slice(0, 80)
  }

  function formatAge(ms: number): string {
    const minutes = Math.floor(ms / 60000)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  function extractText(item: any): string {
    if (item?.task_description) return String(item.task_description).slice(0, 100)
    if (item?.subject || item?.predicate || item?.object) {
      return `${item.subject ?? ""} ${item.predicate ?? ""} ${String(item.object ?? "")}`.trim()
    }
    if (item?.name || item?.description) return `${item.name ?? ""} ${item.description ?? ""}`.trim()
    return JSON.stringify(item).slice(0, 100)
  }
}
```

**Plugin change:** Use packager instead of manual block construction:

```typescript
// In plugin.ts, replace lines 106-116:
const mem = await MemoryBrokerV2.retrieve({ query: text, limit: 6 })
  .then((x) => x.items)
  .catch(() => [])

const memBlock = MemoryPackager.packageMemory(mem, {
  includeConfidence: true,
  includeLayer: true,
  maxAgeHint: true,
  structuredFormat: true,
})

msg.parts.push({
  id: Identifier.ascending("part"),
  messageID: msg.info.id,
  sessionID: msg.info.sessionID,
  type: "text",
  text: memBlock,
  synthetic: true,
} satisfies MessageV2.TextPart)
```

### Entry Points

- **New file:** `packages/opencode/src/kiloclaw/memory/memory.packager.ts`
- **Plugin:** `packages/opencode/src/kiloclaw/memory/plugin.ts` (lines 93-127)

### Effort

- **Time:** 1 day
- **Files changed:** 2 (new packager.ts, plugin.ts)

---

## 17. BP-15: Tiered Architecture (OS-Style)

### What It Is

OS-style tiered memory: Tier 0 (in-context working set) → Tier 1 (short-term/session) → Tier 2 (long-term semantic) → Tier 3 (structured/canonical) → Tier 4 (artifact/blob storage).

### Current State

4-layer architecture (working/episodic/semantic/procedural) already exists but doesn't map cleanly to OS tiers. No explicit tier management.

### Implementation

**Mapping to current layers:**

| OS Tier | Kiloclaw Layer | Purpose                         | Storage           |
| ------- | -------------- | ------------------------------- | ----------------- |
| Tier 0  | In-context     | Currently in LLM context window | Context           |
| Tier 1  | Working        | Session state, hot data         | Memory + SQLite   |
| Tier 2  | Episodic       | Recent history                  | SQLite            |
| Tier 3  | Semantic       | Consolidated facts              | SQLite + vectors  |
| Tier 4  | Procedural     | Patterns, skills                | SQLite + registry |

**New file:** `packages/opencode/src/kiloclaw/memory/memory.tier.ts`

```typescript
import { Log } from "@/util/log"
import type { RankedItem } from "./memory.ranking"
import { MemoryBrokerV2 } from "./memory.broker.v2"

const log = Log.create({ service: "kiloclaw.memory.tier" })

export enum MemoryTier {
  TIER_0_CONTEXT = "tier0_context", // In-LLM-context (not stored)
  TIER_1_WORKING = "tier1_working", // Working memory
  TIER_2_EPISODIC = "tier2_episodic", // Recent episodes
  TIER_3_SEMANTIC = "tier3_semantic", // Consolidated facts
  TIER_4_PROCEDURAL = "tier4_procedural", // Patterns & skills
}

export interface TierConfig {
  tier: MemoryTier
  ttlMs: number | null
  maxItems: number
  vectorEnabled: boolean
  compressionEnabled: boolean
}

export const TIER_CONFIGS: Record<MemoryTier, TierConfig> = {
  [MemoryTier.TIER_0_CONTEXT]: {
    tier: MemoryTier.TIER_0_CONTEXT,
    ttlMs: null,
    maxItems: 0,
    vectorEnabled: false,
    compressionEnabled: false,
  },
  [MemoryTier.TIER_1_WORKING]: {
    tier: MemoryTier.TIER_1_WORKING,
    ttlMs: 6 * 60 * 60 * 1000, // 6 hours
    maxItems: 100,
    vectorEnabled: false,
    compressionEnabled: false,
  },
  [MemoryTier.TIER_2_EPISODIC]: {
    tier: MemoryTier.TIER_2_EPISODIC,
    ttlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    maxItems: 1000,
    vectorEnabled: true,
    compressionEnabled: false,
  },
  [MemoryTier.TIER_3_SEMANTIC]: {
    tier: MemoryTier.TIER_3_SEMANTIC,
    ttlMs: null, // No automatic expiry
    maxItems: 10000,
    vectorEnabled: true,
    compressionEnabled: false,
  },
  [MemoryTier.TIER_4_PROCEDURAL]: {
    tier: MemoryTier.TIER_4_PROCEDURAL,
    ttlMs: null,
    maxItems: 500,
    vectorEnabled: true,
    compressionEnabled: false,
  },
}

export namespace MemoryTierManager {
  /**
   * Determine which tier an item belongs in.
   */
  export function classifyTier(item: { layer: string; ageMs?: number; type?: string }): MemoryTier {
    switch (item.layer) {
      case "working":
        return MemoryTier.TIER_1_WORKING
      case "episodic":
        return MemoryTier.TIER_2_EPISODIC
      case "semantic":
        return MemoryTier.TIER_3_SEMANTIC
      case "procedural":
        return MemoryTier.TIER_4_PROCEDURAL
      default:
        return MemoryTier.TIER_2_EPISODIC
    }
  }

  /**
   * Get tier statistics.
   */
  export async function getTierStats(): Promise<Record<MemoryTier, { count: number; sizeBytes: number }>> {
    const stats: Record<MemoryTier, { count: number; sizeBytes: number }> = {
      [MemoryTier.TIER_0_CONTEXT]: { count: 0, sizeBytes: 0 },
      [MemoryTier.TIER_1_WORKING]: { count: 0, sizeBytes: 0 },
      [MemoryTier.TIER_2_EPISODIC]: { count: 0, sizeBytes: 0 },
      [MemoryTier.TIER_3_SEMANTIC]: { count: 0, sizeBytes: 0 },
      [MemoryTier.TIER_4_PROCEDURAL]: { count: 0, sizeBytes: 0 },
    }

    // Query counts per tier from repositories
    try {
      const workingCount = await WorkingMemoryRepo.count(TENANT)
      stats[MemoryTier.TIER_1_WORKING] = { count: workingCount, sizeBytes: workingCount * 500 }
    } catch {}

    try {
      const episodicCount = await EpisodicMemoryRepo.count(TENANT)
      stats[MemoryTier.TIER_2_EPISODIC] = { count: episodicCount, sizeBytes: episodicCount * 2000 }
    } catch {}

    try {
      const semanticCount = await SemanticMemoryRepo.count(TENANT)
      stats[MemoryTier.TIER_3_SEMANTIC] = { count: semanticCount, sizeBytes: semanticCount * 1000 }
    } catch {}

    try {
      const procCount = await ProceduralMemoryRepo.count(TENANT)
      stats[MemoryTier.TIER_4_PROCEDURAL] = { count: procCount, sizeBytes: procCount * 3000 }
    } catch {}

    return stats
  }

  /**
   * Check if tier needs promotion/demotion.
   */
  export async function checkTierHealth(): Promise<
    Array<{
      tier: MemoryTier
      status: "healthy" | "full" | "stale"
      action?: string
    }>
  > {
    const stats = await this.getTierStats()
    const health: Array<{
      tier: MemoryTier
      status: "healthy" | "full" | "stale"
      action?: string
    }> = []

    for (const [tierStr, stat] of Object.entries(stats)) {
      const tier = tierStr as MemoryTier
      const config = TIER_CONFIGS[tier]

      if (stat.count >= config.maxItems) {
        health.push({
          tier,
          status: "full",
          action: `Run deduplication or purge for ${tier}`,
        })
      } else {
        health.push({ tier, status: "healthy" })
      }
    }

    return health
  }
}
```

### Entry Points

- **New file:** `packages/opencode/src/kiloclaw/memory/memory.tier.ts`
- **Integration:** Primarily for observability and governance, not a code change
- **Documentation:** Update `MEMORY_4_LAYER.md` to reference tier mapping

### Effort

- **Time:** 1 day (mostly design/doc)
- **Files changed:** 1 (new tier.ts) + docs update

---

## 18. Cross-Cutting Concerns

### 18.1 Observability

All new components should emit metrics via `MemoryMetrics`:

```typescript
MemoryMetrics.observeExtraction(durationMs, factCount)
MemoryMetrics.observeRerank(candidatesCount, rerankedCount, latencyMs)
MemoryMetrics.observeWritebackQueueDepth(writebackQueue.length)
```

### 18.2 Error Handling

- All async operations wrapped in try/catch
- Failures logged but never block main flow
- Circuit breaker for external embeddings service

### 18.3 Testing

- Unit tests for each new module
- Integration tests for pipeline stages
- Benchmark tests for reranking latency

### 18.4 Configuration

All new features gated behind `Flag.KILO_EXPERIMENTAL_MEMORY_*` flags:

```typescript
const ENABLE_SELECTIVE_EXTRACTION = Flag.KILO_EXPERIMENTAL_MEMORY_EXTRACTION
const ENABLE_GRAPH_MEMORY = Flag.KILO_EXPERIMENTAL_MEMORY_GRAPH
const ENABLE_ASYNC_WRITES = Flag.KILO_EXPERIMENTAL_MEMORY_ASYNC
// etc.
```

---

## 19. Implementation Order & Dependencies

### Phase 1: Foundation (P0)

**Time:** Week 1  
**Goal:** Enable core pipeline improvements

1. **BP-04: Async Writes** (2 days) — Unblocks all other features by removing blocking writes
2. **BP-08: Reranking Pipeline** (1-2 days) — Immediate accuracy improvement
3. **BP-01: Selective Extraction** (2-3 days) — Reduces memory bloat, enables smarter storage
4. **BP-13: Retrieval as Pipeline** (3-4 days) — Refactors broker for maintainability

### Phase 2: Intelligence (P1)

**Time:** Week 2  
**Goal:** Smarter memory with controller and actor awareness

1. **BP-11: Memory Controller** (2-3 days) — ADD/UPDATE/DELETE/NOOP decisions
2. **BP-06: Actor-Aware Memory** (1-2 days) — Provenance tracking
3. **BP-09: Metadata Filtering** (1-2 days) — Query flexibility
4. **BP-03: Multi-Scope Memory** (2-3 days) — Scoped retrieval

### Phase 3: Enhancement (P2)

**Time:** Week 3  
**Goal:** Advanced features building on foundation

1. **BP-07: Procedural Memory (Enhanced)** (2-3 days)
2. **BP-14: Packaging** (1 day) — Better prompt injection
3. **BP-02: Graph Memory** (5-7 days) — Highest effort, highest impact for complex queries
4. **BP-05: Progressive Summarization** (3-4 days)
5. **BP-10: Background Extraction** (1-2 days)

### Phase 4: Polish (P3)

**Time:** Week 4  
**Goal:** Operational excellence

1. **BP-12: Memory Maintenance** (2 days)
2. **BP-15: Tiered Architecture** (1 day) — Documentation and monitoring

---

## 20. References

| Source               | URL                                                 | Key Insights                                                           |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------------------------- |
| Mem0 ECAI 2025 Paper | mem0.ai/blog/state-of-ai-agent-memory-2026          | LOCOMO benchmark, Mem0g graph-enhanced variant, 1,800 vs 26,000 tokens |
| Atlan Blog           | atlan.com                                           | Best AI Agent Memory Frameworks 2026 comparison                        |
| MLMastery            | machinelearningmastery.com                          | 6 Best AI Agent Memory Frameworks                                      |
| 47billion            | 47billion.com                                       | AI Agent Memory Types & Best Practices                                 |
| Medium/@mjgmario     | medium.com/@mjgmario                                | OS-style tiered memory, retrieval pipeline, constraint triangle        |
| Kiloclaw ADR-005     | docs/adr/ADR-005_Memory_Persistence_Refoundation.md | Existing architecture decisions                                        |
| Kiloclaw Blueprint   | docs/foundation/KILOCLAW_BLUEPRINT.md               | Overall architecture alignment                                         |

---

## Appendix A: File Inventory

### New Files

| File                                        | Purpose                    | Phase |
| ------------------------------------------- | -------------------------- | ----- |
| `src/kiloclaw/memory/memory.extractor.ts`   | Selective extraction       | P1    |
| `src/kiloclaw/memory/memory.writeback.ts`   | Async writes               | P0    |
| `src/kiloclaw/memory/memory.reranker.ts`    | Reranking pipeline         | P0    |
| `src/kiloclaw/memory/memory.controller.ts`  | ADD/UPDATE/DELETE/NOOP     | P1    |
| `src/kiloclaw/memory/memory.graph.ts`       | Graph memory               | P2    |
| `src/kiloclaw/memory/memory.summarizer.ts`  | Progressive summarization  | P2    |
| `src/kiloclaw/memory/memory.background.ts`  | Background job scheduling  | P2    |
| `src/kiloclaw/memory/memory.maintenance.ts` | Maintenance operations     | P3    |
| `src/kiloclaw/memory/memory.packager.ts`    | Prompt injection packaging | P2    |
| `src/kiloclaw/memory/memory.tier.ts`        | Tier management            | P3    |

### Modified Files

| File                                          | Changes                                   | Phase  |
| --------------------------------------------- | ----------------------------------------- | ------ |
| `src/kiloclaw/memory/plugin.ts`               | Use writeback, packager                   | All    |
| `src/kiloclaw/memory/memory.broker.v2.ts`     | Pipeline refactor, controller integration | P0, P1 |
| `src/kiloclaw/memory/memory.repository.ts`    | Extended query filters                    | P1     |
| `src/kiloclaw/memory/memory.ranking.ts`       | Actor-aware provenance                    | P1     |
| `src/kiloclaw/memory/memory.consolidation.ts` | Enhanced procedural                       | P2     |
| `src/kiloclaw/memory/memory.schema.sql.ts`    | New tables/columns                        | P1, P2 |
| `src/kiloclaw/memory/types.ts`                | Actor types, extended schemas             | P1     |

---

_Document generated: 2026-04-04_
_Next review: After Phase 1 completion_
