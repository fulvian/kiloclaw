/**
 * Memory Background Jobs - Background Processing for Memory Operations
 * Based on BP-10 of KILOCLAW_MEMORY_ENHANCEMENT_PLAN
 * Post-conversation memory extraction and consolidation without blocking
 */

import { Log } from "@/util/log"
import { MemoryConsolidation } from "./memory.consolidation"
import { MemoryWriteback } from "./memory.writeback"
import { MemoryExtractor } from "./memory.extractor"

const log = Log.create({ service: "kiloclaw.memory.background" })

type BackgroundJob = {
  id: string
  type: "consolidation" | "extraction" | "summarization" | "purge"
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
  export function scheduleExtraction(sessionId: string, content: string): void {
    if (!MemoryExtractor.isWorthExtracting(content)) {
      return
    }

    const job: BackgroundJob = {
      id: crypto.randomUUID(),
      type: "extraction",
      scheduledAt: Date.now(),
      execute: async () => {
        log.info("running background extraction", { sessionId })
        const facts = await MemoryExtractor.extractFacts(content, {
          sessionId,
        })
        log.debug("extraction complete", { sessionId, factCount: facts.length })

        // Store extracted facts
        for (const fact of facts) {
          // Import broker dynamically to avoid circular deps
          const { MemoryBrokerV2 } = await import("./memory.broker.v2")
          await MemoryBrokerV2.semantic().assert(fact.subject, fact.predicate, fact.object, fact.confidence)
        }
      },
    }

    backgroundQueue.push(job)
    scheduleNext()
    log.debug("extraction scheduled", { jobId: job.id, sessionId })
  }

  /**
   * Schedule summarization for a session.
   */
  export function scheduleSummarization(sessionId: string): void {
    const job: BackgroundJob = {
      id: crypto.randomUUID(),
      type: "summarization",
      scheduledAt: Date.now(),
      execute: async () => {
        log.info("running background summarization", { sessionId })
        // Summarization logic would go here
        // For now, just log - full implementation would analyze episode history
        log.debug("summarization complete", { sessionId })
      },
    }

    backgroundQueue.push(job)
    scheduleNext()
  }

  /**
   * Schedule purge job for expired memories.
   */
  export function schedulePurge(tenantId: string): void {
    const job: BackgroundJob = {
      id: crypto.randomUUID(),
      type: "purge",
      scheduledAt: Date.now(),
      execute: async () => {
        log.info("running background purge", { tenantId })
        // Import retention to run purge
        const { MemoryRetention } = await import("./memory.retention")
        try {
          await MemoryRetention.enforceAll(tenantId)
          log.debug("purge complete", { tenantId })
        } catch (err) {
          log.error("purge failed", { err: String(err) })
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
      log.error("background job failed", { jobId: job.id, type: job.type, err: String(err) })
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

  /**
   * Flush all pending jobs (used at shutdown).
   */
  export async function flush(): Promise<void> {
    if (processTimer) {
      clearTimeout(processTimer)
      processTimer = null
    }
    isProcessing = true
    while (backgroundQueue.length > 0) {
      const job = backgroundQueue.shift()!
      try {
        await job.execute()
      } catch (err) {
        log.error("flush job failed", { jobId: job.id, err: String(err) })
      }
    }
    isProcessing = false
    log.info("background flush complete")
  }
}
