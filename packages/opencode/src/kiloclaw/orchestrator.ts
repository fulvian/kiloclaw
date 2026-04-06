import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import { type Intent, type Action, type PolicyContext, type PolicyResult, type AgencyAssignment } from "./types"
import { getOrchestratorMemory } from "./memory.adapter"
import { Router } from "./router"
import { CapabilityRouter } from "./agency/routing/capability-router"
import { bootstrapRegistries } from "./agency/bootstrap"
import type { RouteResult } from "./agency/routing/types"

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
  create: fn(z.object({}), () => {
    const log = Log.create({ service: "kiloclaw.orchestrator" })
    const auditLogs: Array<{ event: string; data: Record<string, unknown>; timestamp: number }> = []
    const memory = getOrchestratorMemory()

    // Bootstrap registries on first orchestrator creation
    bootstrapRegistries()

    // Create router instance
    const router = Router.create({})

    const orchestrator: CoreOrchestrator = {
      async routeIntent(intent: Intent): Promise<AgencyAssignment> {
        log.info("routing intent", { intentId: intent.id, type: intent.type })

        try {
          // Step 1: Use keyword-based Router to determine domain
          const routingResult = await router.route(intent)

          log.debug("domain routed", {
            intentId: intent.id,
            matchedDomain: routingResult.matchedDomain,
            confidence: routingResult.confidence,
          })

          // Step 2: Map domain to agency ID
          const agencyId = routingResult.agencyId

          // Step 3: Try capability-based routing via CapabilityRouter
          let routeResult: RouteResult | null = null
          try {
            // Map intent risk to urgency (critical -> high)
            const urgency = intent.risk === "critical" ? "high" : intent.risk || "medium"

            const taskIntent = {
              intent: intent.type,
              parameters: {
                capabilities: extractCapabilitiesFromIntent(intent),
                ...(intent.parameters || {}),
              },
              context: {
                domain: routingResult.matchedDomain,
                urgency,
                correlationId: intent.id,
              },
            }

            routeResult = CapabilityRouter.routeTask(taskIntent, routingResult.matchedDomain)

            log.debug("capability routed", {
              intentId: intent.id,
              routeType: routeResult.type,
              routeTarget: routeResult.skill || routeResult.chain || routeResult.agent,
              confidence: routeResult.confidence,
            })
          } catch (capabilityError) {
            // Capability routing failed, fall back to domain-based routing
            log.debug("capability routing failed, using domain fallback", {
              intentId: intent.id,
              error: capabilityError instanceof Error ? capabilityError.message : String(capabilityError),
            })
          }

          // Step 4: Return agency assignment
          return {
            agencyId,
            confidence: routingResult.confidence,
            reason: routeResult
              ? `${routeResult.reason || routeResult.type} via ${routeResult.skill || routeResult.chain || routeResult.agent || "agent"}`
              : routingResult.reasoning,
          }
        } catch (error) {
          log.error("routing failed, using fallback", {
            intentId: intent.id,
            error: error instanceof Error ? error.message : String(error),
          })

          // Fallback: return default agency based on domain keywords
          const domainFromType = inferDomainFromIntent(intent)
          return {
            agencyId: `agency-${domainFromType}` as AgencyAssignment["agencyId"],
            confidence: 0.5,
            reason: "fallback due to routing error",
          }
        }
      },

      enforcePolicy(action: Action, context: PolicyContext): PolicyResult {
        log.info("enforcing policy", { actionType: action.type, correlationId: context.correlationId })

        // TODO: Implement full policy enforcement
        // For now, allow most actions with basic checks
        const highRiskActions = ["delete", "rm", "remove", "drop"]
        const isHighRisk = highRiskActions.some((risk) => action.type.toLowerCase().includes(risk))

        return {
          allowed: true,
          requiresApproval: isHighRisk,
        }
      },

      memory(): MemoryBroker {
        return memory
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
                auditLogs.push({ event, data, timestamp: Date.now() })
                log.debug("audit event with correlation", { event, correlationId, data })
              },
              correlation() {
                return this as AuditLogger
              },
            }
          },
        }
      },
    }

    return orchestrator
  }),
}

// Helper: Extract capabilities from intent description
function extractCapabilitiesFromIntent(intent: Intent): string[] {
  const capabilities: string[] = []
  const text = `${intent.type} ${intent.description}`.toLowerCase()

  // Keyword-based capability extraction
  const capabilityMap: Record<string, string[]> = {
    search: ["search", "find", "lookup"],
    web: ["web", "online", "internet"],
    research: ["research", "investigate"],
    factcheck: ["fact", "verify", "check", "confirm"],
    synthesize: ["synthesize", "summarize", "combine"],
    analyze: ["analyze", "analysis", "examine"],
    code: ["code", "program", "develop", "implement"],
    debug: ["debug", "bug", "fix", "error"],
    review: ["review", "check", "examine"],
    test: ["test", "testing", "verify"],
    planning: ["plan", "planning", "roadmap"],
    nutrition: ["nutrition", "food", "diet", "meal", "calorie"],
    weather: ["weather", "temperature", "forecast", "rain"],
  }

  for (const [capability, keywords] of Object.entries(capabilityMap)) {
    if (keywords.some((kw) => text.includes(kw))) {
      capabilities.push(capability)
    }
  }

  // If no capabilities found, use intent type as capability
  if (capabilities.length === 0) {
    capabilities.push(intent.type.toLowerCase())
  }

  return [...new Set(capabilities)] // deduplicate
}

// Helper: Infer domain from intent type/description
function inferDomainFromIntent(intent: Intent): string {
  const text = `${intent.type} ${intent.description}`.toLowerCase()

  const domainKeywords: Record<string, string[]> = {
    knowledge: ["search", "find", "information", "research", "fact", "verify", "synthesize", "document"],
    development: ["code", "debug", "test", "build", "git", "function", "class", "file"],
    nutrition: ["food", "diet", "nutrition", "meal", "recipe", "calorie", "vitamin"],
    weather: ["weather", "temperature", "forecast", "rain", "sun", "climate"],
  }

  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    if (keywords.some((kw) => text.includes(kw))) {
      return domain
    }
  }

  // Default domain
  return "development"
}
