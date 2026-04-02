import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import { type Intent, type Action, type PolicyContext, type PolicyResult, type AgencyAssignment } from "./types"

export namespace CoreOrchestrator {
  const log = Log.create({ service: "kiloclaw.orchestrator" })

  export interface Info {
    readonly startedAt: number
  }
}

// Memory broker interface
export interface MemoryBroker {
  read(key: string): Promise<unknown>
  write(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
}

// Scheduler interface
export interface Scheduler {
  schedule(task: { id: string; priority: number; run: () => Promise<void> }): void
  cancel(id: string): void
  pause(): void
  resume(): void
}

// Audit logger interface
export interface AuditLogger {
  log(event: string, data: Record<string, unknown>): void
  correlation(correlationId: string): AuditLogger
}

export interface CoreOrchestrator {
  routeIntent(intent: Intent): Promise<AgencyAssignment>
  enforcePolicy(action: Action, context: PolicyContext): PolicyResult
  memory(): MemoryBroker
  scheduler(): Scheduler
  audit(): AuditLogger
}

export namespace CoreOrchestrator {
  export const create = fn(z.object({}), () => {
    const auditLogs: Array<{ event: string; data: Record<string, unknown>; timestamp: number }> = []

    return {
      async routeIntent(intent: Intent): Promise<AgencyAssignment> {
        log.info("routing intent", { intentId: intent.id, type: intent.type })
        return {
          agencyId: "agency-default" as any,
          confidence: 0.9,
          reason: "Default routing",
        }
      },
      enforcePolicy(action: Action, context: PolicyContext): PolicyResult {
        log.info("enforcing policy", { actionType: action.type, correlationId: context.correlationId })
        return {
          allowed: true,
          requiresApproval: false,
        }
      },
      memory(): MemoryBroker {
        const store = new Map<string, unknown>()
        return {
          async read(key: string): Promise<unknown> {
            return store.get(key)
          },
          async write(key: string, value: unknown): Promise<void> {
            store.set(key, value)
          },
          async delete(key: string): Promise<void> {
            store.delete(key)
          },
          async list(prefix: string): Promise<string[]> {
            return [...store.keys()].filter((k) => k.startsWith(prefix))
          },
        }
      },
      scheduler(): Scheduler {
        const tasks = new Map<string, { id: string; priority: number; run: () => Promise<void> }>()
        return {
          schedule(task: { id: string; priority: number; run: () => Promise<void> }) {
            tasks.set(task.id, task)
            log.debug("task scheduled", { taskId: task.id, priority: task.priority })
          },
          cancel(id: string) {
            tasks.delete(id)
            log.debug("task cancelled", { taskId: id })
          },
          pause() {
            log.info("scheduler paused")
          },
          resume() {
            log.info("scheduler resumed")
          },
        }
      },
      audit(): AuditLogger {
        return {
          log(event: string, data: Record<string, unknown>) {
            auditLogs.push({ event, data, timestamp: Date.now() })
            log.debug("audit event", { event, data })
          },
          correlation(correlationId: string): AuditLogger {
            return {
              log(event: string, data: Record<string, unknown>) {
                auditLogs.push({ event, data: { ...data, correlationId }, timestamp: Date.now() })
                log.debug("audit event with correlation", { event, correlationId, data })
              },
              correlation() {
                return this as AuditLogger
              },
            }
          },
        }
      },
    } satisfies CoreOrchestrator
  })
}
