/**
 * Embedding Pipeline - Batch Processing for Embedding Requests
 * Queues embedding requests and processes them in batches with timing
 *
 * This reduces API overhead by batching multiple embedding requests
 * into single API calls, improving throughput for high-frequency usage.
 */

import { Log } from "@/util/log"
import { MemoryEmbedding } from "./memory.embedding"

const log = Log.create({ service: "kiloclaw.memory.embedding.pipeline" })

type PendingEmbedding = {
  id: string
  content: string
  resolve: (embedding: number[]) => void
  reject: (err: Error) => void
}

export namespace EmbeddingPipeline {
  let queue: PendingEmbedding[] = []
  let isProcessing = false
  let processTimer: ReturnType<typeof setTimeout> | null = null

  const BATCH_SIZE = 20 // Embed up to 20 texts per API call
  const PROCESS_INTERVAL_MS = 100 // Flush every 100ms

  /**
   * Queue an embedding request (non-blocking)
   * Returns a promise that resolves with the embedding
   */
  export function embed(content: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID()
      queue.push({ id, content, resolve, reject })
      scheduleFlush()
    })
  }

  function scheduleFlush(): void {
    if (processTimer) return
    processTimer = setTimeout(processQueue, PROCESS_INTERVAL_MS)
  }

  async function processQueue(): Promise<void> {
    processTimer = null
    if (queue.length === 0) return
    if (isProcessing) {
      scheduleFlush()
      return
    }

    isProcessing = true
    const batch = queue.splice(0, BATCH_SIZE)

    log.debug("processing embedding batch", { size: batch.length, remaining: queue.length })

    try {
      const contents = batch.map((b) => b.content)
      const embeddings = await MemoryEmbedding.embedBatch(contents)

      for (let i = 0; i < batch.length; i++) {
        batch[i].resolve(embeddings[i])
      }
    } catch (err) {
      for (const item of batch) {
        item.reject(err instanceof Error ? err : new Error(String(err)))
      }
    }

    isProcessing = false
    if (queue.length > 0) scheduleFlush()
  }

  /**
   * Get queue status for diagnostics
   */
  export function getStatus(): { queued: number; processing: boolean } {
    return {
      queued: queue.length,
      processing: isProcessing,
    }
  }

  /**
   * Clear the queue and reset state
   * Useful for testing or shutdown
   */
  export function clear(): void {
    queue = []
    if (processTimer) {
      clearTimeout(processTimer)
      processTimer = null
    }
    isProcessing = false
  }
}
