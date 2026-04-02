import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import type { Task } from "./agency"

// Local CorrelationId type for this module
type CorrelationIdType = string & { readonly __brand: "CorrelationId" }

// Priority queue item
interface QueueItem {
  task: Task
  correlationId: string
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
  }

  dequeue(): QueueItem | undefined {
    return this.items.shift()
  }

  size(): number {
    return this.items.length
  }

  remove(predicate: (item: QueueItem) => boolean): void {
    this.items = this.items.filter((item) => !predicate(item))
  }
}

export interface DispatcherStats {
  queued: number
  processed: number
  failed: number
}

export interface TaskDispatcher {
  enqueue(task: Task, correlationId: string): void
  dequeue(): { task: Task; correlationId: string } | undefined
  cancel(taskId: string): boolean
  pause(): void
  resume(): void
  getStats(): DispatcherStats
}

export const Dispatcher = {
  create: fn(z.object({}), () => {
    const log = Log.create({ service: "kiloclaw.dispatcher" })
    const queue = new PriorityQueue()
    let paused = false

    return {
      enqueue(task: Task, correlationId: string): void {
        if (paused) {
          log.warn("dispatcher is paused, task not enqueued", { taskId: task.id })
          return
        }
        queue.enqueue({ task, correlationId, enqueuedAt: Date.now() })
        log.info("task enqueued", { taskId: task.id, priority: task.priority, correlationId })
      },
      dequeue(): { task: Task; correlationId: string } | undefined {
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
      getStats(): DispatcherStats {
        return {
          queued: queue.size(),
          processed: 0,
          failed: 0,
        }
      },
    } satisfies TaskDispatcher
  }),
}

// Correlation ID namespace with generate method
export namespace CorrelationId {
  export type CorrelationId = CorrelationIdType

  export function generate(): CorrelationIdType {
    const log = Log.create({ service: "kiloclaw.correlation" })
    const timestamp = Date.now().toString(36)
    const random = Math.random().toString(36).substring(2, 10)
    const id = `kiloclaw-${timestamp}-${random}` as CorrelationIdType
    log.debug("correlation ID generated", { correlationId: id })
    return id
  }

  export const schema = z.string().brand<"CorrelationId">()
}
