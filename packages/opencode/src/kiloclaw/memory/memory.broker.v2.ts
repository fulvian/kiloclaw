/**
 * MemoryBrokerV2 - Persistent Memory Broker with production retrieval path
 */

import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import { memoryBroker as legacyBroker } from "./broker"
import type { MemoryId } from "./types"
import {
  WorkingMemoryRepo,
  EpisodicMemoryRepo,
  SemanticMemoryRepo,
  ProceduralMemoryRepo,
  UserProfileRepo,
  FeedbackRepo,
  AuditRepo,
} from "./memory.repository"
import { rank, applyBudget, DEFAULT_BUDGET, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS, rankByScope } from "./memory.ranking"
import type { RankedItem, TokenBudget } from "./memory.ranking"
import { MemoryEmbedding } from "./memory.embedding"
import { MemoryMetrics } from "./memory.metrics"
import { MemoryReranker, type RerankCandidate } from "./memory.reranker"
import { MemoryGraph } from "./memory.graph"

const log = Log.create({ service: "kiloclaw.memory.broker.v2" })

const TENANT = "default"

export interface MemoryBrokerV2 {
  working(): {
    set(key: string, value: unknown, ttlMs?: number): Promise<void>
    get(key: string): Promise<unknown | null>
    delete(key: string): Promise<void>
  }

  episodic(): {
    record(event: {
      type: string
      data: Record<string, unknown>
      correlationId?: string
      userId?: string
    }): Promise<string>
    getRecent(count: number, since?: number): Promise<any[]>
  }

  semantic(): {
    assert(subject: string, predicate: string, object: unknown, confidence?: number): Promise<string>
    query(pattern?: string): Promise<any[]>
    similaritySearch(text: string, k?: number): Promise<any[]>
  }

  write(entry: {
    layer: "working" | "episodic" | "semantic" | "procedural"
    key: string
    value: unknown
    sensitivity?: string
    ttlMs?: number
  }): Promise<void>

  read(query: {
    layer?: "working" | "episodic" | "semantic" | "procedural"
    limit?: number
    sensitivityMax?: string
  }): Promise<any[]>

  retrieve(options: {
    query?: string
    userId?: string
    limit?: number
    budget?: Partial<TokenBudget>
    weights?: typeof DEFAULT_WEIGHTS
  }): Promise<{
    items: RankedItem<any>[]
    tokenUsage: number
  }>

  feedback(vote: "up" | "down", reason: string, targetId: string, correction?: string): Promise<void>
}

export const MemoryBrokerV2: MemoryBrokerV2 = {
  working() {
    return {
      async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          legacyBroker.working().set(key, value, ttlMs)
          return
        }

        await WorkingMemoryRepo.set(TENANT, key, value, {
          sensitivity: "medium",
          ttlMs,
        })
      },

      async get(key: string): Promise<unknown | null> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          return legacyBroker.working().get(key) ?? null
        }

        return WorkingMemoryRepo.get(TENANT, key)
      },

      async delete(key: string): Promise<void> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          legacyBroker.working().remove(key)
          return
        }

        await WorkingMemoryRepo.delete(TENANT, key)
      },
    }
  },

  episodic() {
    return {
      async record(event: {
        type: string
        data: Record<string, unknown>
        correlationId?: string
        userId?: string
      }): Promise<string> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          return `legacy_${Date.now()}`
        }

        const id = `ev_${crypto.randomUUID()}`
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
        })

        await AuditRepo.log({
          id: crypto.randomUUID(),
          actor: "system",
          action: "create",
          target_type: "event",
          target_id: id,
          reason: `episodic_record:${event.type}`,
          correlation_id: event.correlationId ?? null,
          previous_hash: "",
          hash: "",
          metadata_json: { eventType: event.type },
          ts: Date.now(),
          created_at: Date.now(),
        })

        return id
      },

      async getRecent(count: number, since?: number): Promise<any[]> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          return legacyBroker.episodic().getRecentEpisodes(count, since ? new Date(since) : undefined)
        }

        return EpisodicMemoryRepo.getRecentEpisodes(TENANT, count, since)
      },
    }
  },

  semantic() {
    return {
      async assert(subject: string, predicate: string, object: unknown, confidence = 80): Promise<string> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          return legacyBroker.semantic().assert({
            subject,
            predicate,
            object,
            confidence,
            source: "legacy",
          })
        }

        const id = `fact_${crypto.randomUUID()}`
        const objText = typeof object === "string" ? object : JSON.stringify(object)

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
        })

        const content = `${subject} ${predicate} ${objText}`
        const embedding = await MemoryEmbedding.embed(content)
        await SemanticMemoryRepo.storeVector({
          id: `vec_${crypto.randomUUID()}`,
          fact_id: id,
          content,
          embedding: JSON.stringify(embedding),
          model: MemoryEmbedding.model(),
          norm: Math.round(vectorNorm(embedding) * 1000000),
          metadata_json: { source: "semantic.assert" },
          created_at: Date.now(),
        })

        await AuditRepo.log({
          id: crypto.randomUUID(),
          actor: "system",
          action: "create",
          target_type: "fact",
          target_id: id,
          reason: "semantic_assert",
          previous_hash: "",
          hash: "",
          metadata_json: { subject, predicate },
          ts: Date.now(),
          created_at: Date.now(),
        })

        return id
      },

      async query(pattern?: string): Promise<any[]> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          return legacyBroker.semantic().query(pattern)
        }

        return SemanticMemoryRepo.queryFacts(TENANT, {
          subject: pattern,
          minConfidence: 30,
        })
      },

      async similaritySearch(text: string, k = 5): Promise<any[]> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          const results = await legacyBroker.search({ text, k })
          return results.map((r) => ({ fact: r.entry.value, similarity: r.score }))
        }

        const queryEmbedding = await MemoryEmbedding.embed(text)
        const results = await SemanticMemoryRepo.similaritySearch(queryEmbedding, k, TENANT)
        return results.map((r) => ({ fact: r.fact, similarity: r.similarity }))
      },
    }
  },

  async write(entry: {
    layer: "working" | "episodic" | "semantic" | "procedural"
    key: string
    value: unknown
    sensitivity?: string
    ttlMs?: number
  }): Promise<void> {
    if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      const id = `mem_${crypto.randomUUID()}` as MemoryId
      await legacyBroker.write({
        id,
        layer: entry.layer,
        key: entry.key,
        value: entry.value,
        sensitivity: (entry.sensitivity as any) ?? "medium",
        category: "session",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      return
    }

    if (entry.layer === "working") {
      await this.working().set(entry.key, entry.value, entry.ttlMs)
      return
    }

    if (entry.layer === "episodic") {
      const now = Date.now()
      const val = (entry.value ?? {}) as Record<string, unknown>
      const startedAt = Number(val["startedAt"] ?? now)
      const completedAt = Number(val["completedAt"] ?? now)
      const confidence = Number(val["confidence"] ?? 70)
      const desc = `${entry.key}: ${toText(entry.value)}`.slice(0, 1200)

      await EpisodicMemoryRepo.recordEpisode({
        id: `ep_${crypto.randomUUID()}`,
        tenant_id: TENANT,
        user_id: typeof val["userId"] === "string" ? (val["userId"] as string) : null,
        task_id: typeof val["taskId"] === "string" ? (val["taskId"] as string) : null,
        task_description: typeof val["taskDescription"] === "string" ? (val["taskDescription"] as string) : desc,
        outcome: typeof val["outcome"] === "string" ? (val["outcome"] as string) : "observed",
        started_at: Number.isFinite(startedAt) ? startedAt : now,
        completed_at: Number.isFinite(completedAt) ? completedAt : now,
        correlation_id: typeof val["correlationId"] === "string" ? (val["correlationId"] as string) : null,
        agency_id: typeof val["agencyId"] === "string" ? (val["agencyId"] as string) : null,
        agent_id: typeof val["agentId"] === "string" ? (val["agentId"] as string) : null,
        source_event_ids: [],
        artifacts: val,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(100, confidence)) : 70,
        expires_at: entry.ttlMs ? now + entry.ttlMs : null,
        created_at: now,
      })

      await this.episodic().record({
        type: "memory_write",
        data: { key: entry.key, value: entry.value },
      })
      return
    }

    if (entry.layer === "semantic") {
      await this.semantic().assert(entry.key, "value", entry.value)
      return
    }

    const val = entry.value as Record<string, unknown>
    await ProceduralMemoryRepo.register({
      id: `proc_${crypto.randomUUID()}`,
      tenant_id: TENANT,
      user_id: (val.userId as string | undefined) ?? null,
      scope: (val.scope as string | undefined) ?? "global",
      name: entry.key,
      description: (val.description as string | undefined) ?? null,
      status: (val.status as string | undefined) ?? "active",
      current_version: (val.version as string | undefined) ?? "1.0.0",
      success_rate: Number((val.successRate as number | undefined) ?? 50),
      usage_count: Number((val.usageCount as number | undefined) ?? 0),
      created_at: Date.now(),
      updated_at: Date.now(),
    })
  },

  async read(query: {
    layer?: "working" | "episodic" | "semantic" | "procedural"
    limit?: number
    sensitivityMax?: string
  }): Promise<any[]> {
    if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      return legacyBroker.read({
        layer: query.layer,
        limit: query.limit ?? 100,
        sensitivityMax: query.sensitivityMax as any,
      })
    }

    if (query.layer === "working") {
      const items = await WorkingMemoryRepo.getMany(TENANT, [])
      return Object.entries(items).map(([key, value]) => ({
        id: key,
        layer: "working",
        key,
        value,
      }))
    }

    if (query.layer === "episodic") {
      return this.episodic().getRecent(query.limit ?? 50)
    }

    if (query.layer === "semantic") {
      return this.semantic().query()
    }

    if (query.layer === "procedural") {
      return ProceduralMemoryRepo.list(TENANT, { status: "active" })
    }

    return []
  },

  async retrieve(options: {
    query?: string
    userId?: string
    sessionId?: string
    agentId?: string
    limit?: number
    budget?: Partial<TokenBudget>
    weights?: typeof DEFAULT_WEIGHTS
    // BP-09: Metadata filters
    actorType?: string
    actorId?: string
    since?: number
    until?: number
  }): Promise<{ items: RankedItem<any>[]; tokenUsage: number }> {
    const started = performance.now()
    const limit = options.limit ?? 50
    const budget = { ...DEFAULT_BUDGET, ...options.budget }
    const weights = options.weights ?? DEFAULT_WEIGHTS

    if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      throw new Error("MemoryBrokerV2.retrieve requires KILO_EXPERIMENTAL_MEMORY_V2=true")
    }

    const candidates: RankedItem<any>[] = []
    const now = Date.now()
    const q = (options.query ?? "").trim()

    const profile = options.userId ? await UserProfileRepo.get(TENANT, options.userId).catch(() => null) : null
    const prefMatch = computePreferenceMatch(profile?.preferences_json, q)

    const workingItems = await WorkingMemoryRepo.getMany(TENANT, [])
    for (const [key, value] of Object.entries(workingItems)) {
      const relevance = lexicalRelevance(q, `${key} ${toText(value)}`)
      candidates.push({
        item: { id: key, layer: "working", key, value, timestamp: now },
        score: 0,
        factors: {
          relevanceVector: relevance,
          recencyNorm: 1,
          confidence: 1,
          successSignal: 0.8,
          provenanceQuality: 0.8,
          userPreferenceMatch: prefMatch,
          sensitivityPenalty: 0,
          contradictionPenalty: 0,
        },
        explain: ["working_candidate"],
      })
    }

    const episodes = await EpisodicMemoryRepo.getRecentEpisodes(TENANT, Math.max(limit * 2, 50))

    // BP-09: Apply metadata filters to episodes
    const filteredEpisodes = episodes.filter((ep) => {
      if (options.actorType && ep.actor_type !== options.actorType) return false
      if (options.actorId && ep.actor_id !== options.actorId) return false
      if (options.since && ep.completed_at < options.since) return false
      if (options.until && ep.completed_at > options.until) return false
      return true
    })

    for (const ep of filteredEpisodes) {
      const text = `${ep.task_description} ${ep.outcome}`
      const relevance = lexicalRelevance(q, text)
      candidates.push({
        item: { layer: "episodic" as const, ...ep },
        score: 0,
        factors: {
          relevanceVector: relevance,
          recencyNorm: recencyNorm(now, ep.completed_at),
          confidence: normalize100(ep.confidence),
          successSignal: ep.outcome === "success" ? 1 : ep.outcome === "partial" ? 0.5 : 0.2,
          provenanceQuality: 0.8,
          actorType: ep.actor_type ?? undefined,
          userPreferenceMatch: prefMatch,
          sensitivityPenalty: 0,
          contradictionPenalty: 0,
        },
        explain: ["episodic_candidate"],
      })
    }

    let semanticVec: Array<{ fact: any; similarity: number }> = []
    const graphBoost = new Map<string, number>()
    if (q.length > 0) {
      try {
        const emb = await MemoryEmbedding.embed(q)
        semanticVec = await SemanticMemoryRepo.similaritySearch(emb, Math.max(limit * 2, 50), TENANT)
      } catch (err) {
        log.error("semantic vector retrieval failed", { err })
      }
    }

    if (semanticVec.length === 0) {
      const facts = await SemanticMemoryRepo.queryFacts(TENANT, { minConfidence: 30 })
      semanticVec = facts.map((f) => ({
        fact: f,
        similarity: lexicalRelevance(q, `${f.subject} ${f.predicate} ${f.object}`),
      }))
    }

    // BP-02: Graph-assisted expansion and scoring boost (multi-hop)
    if (q.length > 0) {
      try {
        const names = extractGraphTerms(q)
        if (names.length > 0) {
          const roots = await MemoryGraph.resolveEntities(names)
          const rootIds = roots.map((item) => item.id)
          const traversed = await Promise.all(rootIds.map((id) => MemoryGraph.traverse(id, 2)))
          const allIds = [...new Set(traversed.flat())]
          const entities = await MemoryGraph.getEntitiesByIds(allIds)

          for (const entity of entities) {
            const key = entity.name.toLowerCase()
            graphBoost.set(key, 0.2)
          }

          log.debug("graph retrieval boost ready", {
            roots: roots.length,
            nodes: entities.length,
          })
        }
      } catch (err) {
        log.error("graph retrieval boost failed", { err: String(err) })
      }
    }

    // Apply reranking to semantic candidates for better precision
    if (semanticVec.length > 1 && q.length > 0) {
      const rerankCandidates: RerankCandidate[] = semanticVec.map((r) => ({
        id: r.fact.id,
        content: `${r.fact.subject} ${r.fact.predicate} ${r.fact.object}`,
        originalScore: r.similarity,
        metadata: { fact: r.fact },
      }))

      try {
        const reranked = await MemoryReranker.rerank(q, rerankCandidates, Math.max(limit * 2, 50))

        // Replace with reranked results
        semanticVec = reranked.map((r) => ({
          fact: r.metadata?.fact ?? r,
          similarity: r.rerankScore,
        }))
        log.debug("semantic reranking applied", { original: rerankCandidates.length, reranked: semanticVec.length })
      } catch (err) {
        log.error("semantic reranking failed, using original scores", { err })
      }
    }

    for (const row of semanticVec) {
      const fact = row.fact
      // BP-09: Apply metadata filters to semantic facts
      if (options.actorType && fact.actor_type !== options.actorType) continue
      if (options.actorId && fact.actor_id !== options.actorId) continue
      if (options.since && (fact.created_at ?? 0) < options.since) continue
      if (options.until && (fact.created_at ?? Infinity) > options.until) continue

      const graphScore = computeGraphBoost(graphBoost, fact)
      candidates.push({
        item: { layer: "semantic" as const, ...fact },
        score: 0,
        factors: {
          relevanceVector: Math.min(1, row.similarity + graphScore),
          recencyNorm: recencyNorm(now, fact.updated_at ?? fact.created_at ?? now),
          confidence: normalize100(fact.confidence),
          successSignal: 0.8,
          provenanceQuality: provenanceQuality(fact.provenance),
          actorType: fact.actor_type ?? undefined,
          userPreferenceMatch: prefMatch,
          sensitivityPenalty: 0,
          contradictionPenalty: 0,
        },
        explain:
          graphScore > 0 ? ["semantic_candidate", `graph_boost:${graphScore.toFixed(2)}`] : ["semantic_candidate"],
      })
    }

    const procs = await ProceduralMemoryRepo.list(TENANT, { status: "active" })
    for (const proc of procs) {
      const text = `${proc.name} ${proc.description ?? ""} ${proc.scope}`
      const relevance = lexicalRelevance(q, text)
      candidates.push({
        item: { layer: "procedural" as const, ...proc },
        score: 0,
        factors: {
          relevanceVector: relevance,
          recencyNorm: recencyNorm(now, proc.updated_at ?? proc.created_at ?? now),
          confidence: normalize100(proc.success_rate),
          successSignal: normalize100(proc.success_rate),
          provenanceQuality: 0.75,
          userPreferenceMatch: prefMatch,
          sensitivityPenalty: 0,
          contradictionPenalty: 0,
        },
        explain: ["procedural_candidate"],
      })
    }

    // BP-03: Apply scope-based ranking if user/session/agent scope provided
    let ranked = rank(candidates, weights, DEFAULT_THRESHOLDS)
    if (options.userId || options.sessionId || options.agentId) {
      const scopeResult = rankByScope(ranked, {
        userId: options.userId,
        sessionId: options.sessionId,
        agentId: options.agentId,
      })
      ranked = scopeResult.composed
      log.debug("scope ranking applied", {
        user: scopeResult.userMemories.length,
        session: scopeResult.sessionMemories.length,
        agent: scopeResult.agentMemories.length,
        global: scopeResult.globalMemories.length,
      })
    }

    const maxTokens = limit * 100
    const result = applyBudget(ranked, budget, maxTokens)

    const out = {
      items: result.selected,
      tokenUsage: result.tokenUsage,
    }

    MemoryMetrics.observeRetrieval(performance.now() - started, out.tokenUsage, out.items.length)
    return out
  },

  async feedback(vote: "up" | "down", reason: string, targetId: string, correction?: string): Promise<void> {
    if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      log.debug("feedback recorded (legacy)", { vote, reason, targetId })
      return
    }

    await FeedbackRepo.record({
      id: crypto.randomUUID(),
      tenant_id: TENANT,
      target_type: "memory_retrieval",
      target_id: targetId,
      vote,
      reason,
      correction_text: correction ?? null,
      ts: Date.now(),
      created_at: Date.now(),
    })

    await AuditRepo.log({
      id: crypto.randomUUID(),
      actor: "user",
      action: vote === "up" ? "feedback_positive" : "feedback_negative",
      target_type: "memory_retrieval",
      target_id: targetId,
      reason: `feedback:${reason}`,
      previous_hash: "",
      hash: "",
      metadata_json: { vote, reason, correction },
      ts: Date.now(),
      created_at: Date.now(),
    })
  },
}

function extractGraphTerms(query: string): string[] {
  const tokens = query
    .split(/[^A-Za-z0-9_.-]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3)

  const uniq = [...new Set(tokens)]
  return uniq.slice(0, 10)
}

function computeGraphBoost(boost: Map<string, number>, fact: any): number {
  const keys = [String(fact.subject ?? ""), String(fact.predicate ?? ""), String(fact.object ?? "")]
    .join(" ")
    .toLowerCase()

  let add = 0
  for (const [name, val] of boost.entries()) {
    if (keys.includes(name)) add = Math.max(add, val)
  }
  return add
}

function normalize100(value: number | null | undefined): number {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n / 100))
}

function recencyNorm(now: number, ts: number): number {
  const age = Math.max(0, now - ts)
  const halfLifeMs = 7 * 24 * 60 * 60 * 1000
  const decay = Math.exp(-(age / halfLifeMs) * Math.LN2)
  return Math.max(0, Math.min(1, decay))
}

function lexicalRelevance(query: string, content: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return 0.5
  const words = q.split(/\s+/).filter(Boolean)
  if (words.length === 0) return 0.5

  const c = content.toLowerCase()
  let hits = 0
  for (const w of words) {
    if (c.includes(w)) hits++
  }

  return Math.max(0, Math.min(1, hits / words.length))
}

function computePreferenceMatch(preferences: Record<string, unknown> | null | undefined, query: string): number {
  if (!preferences || query.trim().length === 0) return 0.7

  const preferred = preferences["topics"]
  if (!Array.isArray(preferred)) return 0.7

  const q = query.toLowerCase()
  const has = preferred.some((x) => typeof x === "string" && q.includes(x.toLowerCase()))
  return has ? 1 : 0.6
}

function provenanceQuality(provenance: string | null | undefined): number {
  if (!provenance) return 0.6
  const p = provenance.toLowerCase()
  if (p.includes("user")) return 0.95
  if (p.includes("task")) return 0.85
  if (p.includes("broker")) return 0.75
  return 0.65
}

function toText(value: unknown): string {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function vectorNorm(v: number[]): number {
  let sum = 0
  for (const x of v) sum += x * x
  return Math.sqrt(sum)
}
