import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import { tmpdir } from "node:os"
import { join } from "node:path"
import z from "zod"
import { type Intent, type Action, type PolicyContext, type PolicyResult, type AgencyAssignment } from "./types"
import { Router } from "./router"
import { PolicyEngine } from "./policy/engine"
import { Policy } from "./policy/rules"
import { AuditStore, type AuditEntry } from "./audit/store"
import { getOrchestratorMemory } from "./memory.adapter"

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
  byCorrelation(correlationId: string): AuditEntry[]
  byEvent(event: string): AuditEntry[]
}

// Core orchestrator interface
export interface CoreOrchestrator {
  routeIntent(intent: Intent): Promise<AgencyAssignment>
  enforcePolicy(action: Action, context: PolicyContext): PolicyResult
  memory(): MemoryBroker
  scheduler(): Scheduler
  audit(): AuditLogger
}

// Orchestrator factory
export const CoreOrchestrator = {
  create: fn(
    z
      .object({
        policyMode: z.enum(["strict", "compat"]).default("strict"),
        auditPath: z.string().default(join(tmpdir(), "kiloclaw", "audit", "events.jsonl")),
      })
      .partial(),
    (input) => {
      const log = Log.create({ service: "kiloclaw.orchestrator" })
      const envMode = process.env.KILOCLAW_POLICY_ENFORCEMENT_MODE === "compat" ? "compat" : "strict"
      const policyMode = input.policyMode ?? envMode
      const auditPath = input.auditPath ?? join(tmpdir(), "kiloclaw", "audit", "events.jsonl")
      const auditStore = AuditStore.create({ path: auditPath })
      const auditLogs: AuditEntry[] = []
      const mem = getOrchestratorMemory()
      const router = Router.create({})
      const policy = new PolicyEngine({ enableCaching: true, fallbackToConsultative: false })

      const writeAudit = (corr: string, event: string, payload: Record<string, unknown>) => {
        const record = auditStore.append({ correlationId: corr, event, payload })
        auditLogs.push(record)
        log.debug("audit event", { event, correlationId: corr })
        return record
      }

      const byCorr = (correlationId: string) => {
        const mem = auditLogs.filter((row) => row.correlationId === correlationId)
        if (mem.length > 0) return mem
        return auditStore.byCorrelation({ correlationId })
      }

      const byEvent = (event: string) => {
        const mem = auditLogs.filter((row) => row.event === event)
        if (mem.length > 0) return mem
        return auditStore.byEvent({ event })
      }

      const getToolIds = (action: Action): string[] => {
        const ids = action.parameters?.toolIds
        if (!Array.isArray(ids)) return []
        return ids.filter((x): x is string => typeof x === "string")
      }

      const getDataClassification = (ctx: PolicyContext) => {
        if (ctx.intent?.risk === "critical") return ["P0_Critical"] as const
        if (ctx.intent?.risk === "high") return ["P1_High"] as const
        if (ctx.intent?.risk === "medium") return ["P2_Medium"] as const
        return [] as const
      }

      const orchestrator: CoreOrchestrator = {
        async routeIntent(intent: Intent): Promise<AgencyAssignment> {
          const route = await router.route(intent)
          log.info("routing intent", { intentId: intent.id, type: intent.type, agencyId: route.agencyId })

          return {
            agencyId: route.agencyId,
            confidence: route.confidence,
            reason: route.reasoning,
          }
        },
        enforcePolicy(action: Action, context: PolicyContext): PolicyResult {
          const corr = context.correlationId
          const audit = orchestrator.audit().correlation(corr)
          const actionCtx = Policy.createContext({
            sessionId: corr,
            agencyId: context.agencyId,
            agentId: context.agentId,
            toolIds: getToolIds(action),
            dataClassification: [...getDataClassification(context)],
            correlationId: corr,
          })

          const evalResult = policy.evaluate(actionCtx, action)
          const isCriticalIntent = context.intent?.risk === "critical"
          const isHighIntent = context.intent?.risk === "high"
          const hasHighRiskAction = /delete|rm|remove|drop|destroy|truncate|wipe/i.test(action.type)
          const baseRequiresApproval =
            evalResult.escalationRequired || isHighIntent || isCriticalIntent || hasHighRiskAction
          const approved = !!context.userApproved
          const missingApproval = baseRequiresApproval && !approved
          const strictOut = {
            allowed: evalResult.allowed && !missingApproval,
            reason: missingApproval ? "action requires explicit approval by policy" : evalResult.reason,
            requiresApproval: baseRequiresApproval,
          }
          const compatFallback = !strictOut.allowed || isCriticalIntent || isHighIntent || hasHighRiskAction
          const compatOut = {
            allowed: true,
            reason: compatFallback ? `[compat-fallback] ${evalResult.reason}` : evalResult.reason,
            requiresApproval: baseRequiresApproval || compatFallback,
          }
          const out = policyMode === "compat" ? compatOut : strictOut
          const evidenceId = crypto.randomUUID()

          audit.log("policy.decision", {
            evidenceId,
            actionType: action.type,
            target: action.target,
            allowed: out.allowed,
            requiresApproval: out.requiresApproval,
            reason: out.reason,
            riskScore: evalResult.riskScore,
            escalationRequired: evalResult.escalationRequired,
            intentRisk: context.intent?.risk,
            policyMode,
            compatFallback,
            correlationEvidence: {
              correlationId: corr,
              event: "policy.decision",
              evidenceId,
            },
          })

          log.info("enforcing policy", {
            actionType: action.type,
            correlationId: corr,
            allowed: out.allowed,
            requiresApproval: out.requiresApproval,
          })

          return out
        },
        memory(): MemoryBroker {
          return mem
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
              const corr = typeof data.correlationId === "string" ? data.correlationId : "uncorrelated"
              writeAudit(corr, event, data)
            },
            correlation(correlationId: string): AuditLogger {
              return {
                log(event: string, data: Record<string, unknown>) {
                  writeAudit(correlationId, event, {
                    ...data,
                    correlationId,
                  })
                },
                correlation() {
                  return this as AuditLogger
                },
                byCorrelation(corr: string) {
                  return byCorr(corr)
                },
                byEvent(event: string) {
                  return byEvent(event)
                },
              }
            },
            byCorrelation(correlationId: string) {
              return byCorr(correlationId)
            },
            byEvent(event: string) {
              return byEvent(event)
            },
          }
        },
      }

      return orchestrator
    },
  ),
}
