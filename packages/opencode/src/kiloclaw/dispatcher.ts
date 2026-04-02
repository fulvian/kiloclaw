import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import { type CorrelationId, CorrelationId } from "./types"
import { type Task, type TaskResult, Task } from "./agency"

export namespace Dispatcher {
  const log = Log.create({ service: "kiloclaw.dispatcher" })

  // Priority queue item
  interface QueueItem {
    task: Task
    correlationId: CorrelationId
    enqueuedAt: number
  }

  // Priority queue implementation using a sorted array
  class PriorityQueue {
    private items: QueueItem[] = []

    enqueue(item: QueueItem): void {
      const priority = item.task.priority
      let index = this.items.findIndex((i) => i.task.priority < priority)
      if (index === -1) index = this.items.length
      this.items.splice(index, 0, item)
      log.debug("task enqueued", { taskId: item.task.id, priority, queueSize: this.items.length })
    }

    dequeue(): QueueItem | undefined {
      return this.items.shift()
    }

    peek(): QueueItem | undefined {
      return this.items[0]
    }

    size(): number {
      return this.items.length
    }

    clear(): void {
      this.items = []
    }

    remove(predicate: (item: QueueItem) => boolean): void {
      this.items = this.items.filter((item) => !predicate(item))
    }
  }

  export interface Stats {
    queued: number
    processed: number
    failed: number
  }

  export const Stats = z.object({
    queued: z.number().int().nonnegative(),
    processed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })
  export type Stats = z.infer<typeof Stats>
}

export interface TaskDispatcher {
  enqueue(task: Task, correlationId: CorrelationId): void
  dequeue(): { task: Task; correlationId: CorrelationId } | undefined
  cancel(taskId: string): boolean
  pause(): void
  resume(): void
  getStats(): Dispatcher.Stats
}

export namespace Dispatcher {
  export const create = fn(z.object({}), () => {
    const queue = new PriorityQueue()
    let paused = false
    let processed = 0
    let failed = 0

    return {
      enqueue(task: Task, correlationId: CorrelationId): void {
        if (paused) {
          log.warn("dispatcher is paused, task not enqueued", { taskId: task.id })
          return
        }
        queue.enqueue({ task, correlationId, enqueuedAt: Date.now() })
        log.info("task enqueued", { taskId: task.id, priority: task.priority, correlationId })
      },
      dequeue(): { task: Task; correlationId: CorrelationId } | undefined {
        const item = queue.dequeue()
        if (item) {
          log.info("task dequeued", { taskId: item.task.id, correlationId: item.correlationId })
        }
        return item
      },
      cancel(taskId: string): boolean {
        let cancelled = false
        queue.remove((item) => {
          if (item.task.id === taskId) {
            cancelled = true
            return true
          }
          return false
        })
        if (cancelled) {
          log.info("task cancelled", { taskId })
        }
        return cancelled
      },
      pause(): void {
        paused = true
        log.info("dispatcher paused")
      },
      resume(): void {
        paused = false
        log.info("dispatcher resumed")
      },
      getStats(): Dispatcher.Stats {
        return {
          queued: queue.size(),
          processed,
          failed,
        }
      },
    } satisfies TaskDispatcher
  })
}

// Correlation ID generation
export namespace CorrelationId {
  const log = Log.create({ service: "kiloclaw.correlation" })

  // Generate a unique correlation ID
  export function generate(): CorrelationId {
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 10)
    const id = `kiloclaw-${timestamp}-${random}` as CorrelationId
    log.debug("correlation ID generated", { correlationId: id })
    return id
  }

  export const schema = z.string().brand<"CorrelationId">()
}
