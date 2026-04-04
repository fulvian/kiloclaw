/**
 * Memory Writeback - Async Write Operations
 * Based on BP-04 of KILOCLAW_MEMORY_ENHANCEMENT_PLAN
 * Non-blocking memory writes to avoid blocking response generation
 */

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
      }).catch((err) => {
        log.error("working memory write failed", { err: String(err) })
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
      }).catch((err) => {
        log.error("episodic memory write failed", { err: String(err) })
      })

      // Selective extraction → semantic (async)
      if (MemoryExtractor.isWorthExtracting(params.text)) {
        try {
          const facts = await MemoryExtractor.extractFacts(params.text, {
            sessionId: params.sessionId,
            agentId: params.agent,
            correlationId: params.messageID,
          })

          for (const fact of facts) {
            await MemoryBrokerV2.semantic().assert(fact.subject, fact.predicate, fact.object, fact.confidence)
          }
        } catch (err) {
          log.error("selective extraction failed", { err: String(err) })
        }
      }
    })
  }

  /**
   * Record agent response (non-blocking).
   */
  export function recordAgentTurn(params: {
    sessionId: string
    messageID?: string
    agent?: string
    text: string
  }): void {
    schedule("low", async () => {
      const ts = Date.now()

      // Working memory update
      await MemoryBrokerV2.write({
        layer: "working",
        key: `session:${params.sessionId}:last_agent_response`,
        value: { text: params.text.slice(0, 1200), at: ts },
        ttlMs: 6 * 60 * 60 * 1000,
      }).catch((err) => {
        log.error("working memory write failed", { err: String(err) })
      })

      // Episodic for agent action
      await MemoryBrokerV2.write({
        layer: "episodic",
        key: `session:${params.sessionId}:agent_turn:${params.messageID ?? "none"}`,
        value: {
          taskDescription: params.text.slice(0, 1200),
          outcome: "agent_response",
          correlationId: params.messageID,
          startedAt: ts,
          completedAt: ts,
          agentId: params.agent,
        },
      }).catch((err) => {
        log.error("episodic memory write failed", { err: String(err) })
      })
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
   * Force flush all pending writebacks (used at shutdown).
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
    log.info("writeback flush complete")
  }

  /**
   * Get queue status for diagnostics.
   */
  export function getStatus(): { queued: number; processing: boolean } {
    return {
      queued: writebackQueue.length,
      processing: isProcessing,
    }
  }
}
