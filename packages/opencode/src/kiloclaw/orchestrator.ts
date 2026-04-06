import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import { type Intent, type Action, type PolicyContext, type PolicyResult, type AgencyAssignment } from "./types"
import { getOrchestratorMemory } from "./memory.adapter"
import { Router } from "./router"
import { CapabilityRouter, CapabilityDeniedError } from "./agency/routing/capability-router"
import { AgencyRegistry } from "./agency/registry/agency-registry"
import { bootstrapRegistries } from "./agency/bootstrap"
import type { RouteResult } from "./agency/routing/types"
import { Flag } from "@/flag/flag"
import { RoutingMetrics } from "./telemetry/routing.metrics"
import { AuditRepo } from "./memory/memory.repository"

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
        const startTime = Date.now()
        log.info("routing intent", { intentId: intent.id, type: intent.type })

        try {
          // Step 1: Use keyword-based Router to determine domain (L0 - Agency Routing)
          const routingResult = await router.route(intent)
          const agencyId = routingResult.agencyId

          const l0LatencyMs = Date.now() - startTime

          log.debug("domain routed", {
            intentId: intent.id,
            matchedDomain: routingResult.matchedDomain,
            confidence: routingResult.confidence,
          })

          // Emit L0 event (agency routing decision)
          if (Flag.KILO_ROUTING_SHADOW_ENABLED) {
            RoutingMetrics.recordLayer0({
              correlationId: intent.id,
              intent: intent.description || intent.type,
              intentType: intent.type,
              domain: routingResult.matchedDomain,
              agencyId,
              agencyDomain: routingResult.matchedDomain,
              confidence: routingResult.confidence,
              decision: "allowed",
              reason: routingResult.reasoning,
              latencyMs: l0LatencyMs,
            })
          }

          // Step 2: Try capability-based routing via CapabilityRouter (L1 - Skill Discovery)
          let routeResult: RouteResult | null = null
          const l1StartTime = Date.now()

          try {
            // Map intent risk to urgency (critical -> high)
            const urgency = intent.risk === "critical" ? "high" : intent.risk || "medium"
            const capabilities = extractCapabilitiesFromIntent(intent)

            const taskIntent = {
              intent: intent.type,
              parameters: {
                capabilities,
                ...(intent.parameters || {}),
              },
              context: {
                domain: routingResult.matchedDomain,
                urgency,
                correlationId: intent.id,
              },
            }

            routeResult = CapabilityRouter.routeTask(taskIntent, agencyId)

            const l1LatencyMs = Date.now() - l1StartTime

            log.debug("capability routed", {
              intentId: intent.id,
              routeType: routeResult.type,
              routeTarget: routeResult.skill || routeResult.chain || routeResult.agent,
              confidence: routeResult.confidence,
            })

            // Emit L1 event (skill/agent discovery)
            if (Flag.KILO_ROUTING_SHADOW_ENABLED) {
              RoutingMetrics.recordLayer1({
                correlationId: intent.id,
                agencyId,
                capabilities,
                skillsFound: routeResult.skill ? 1 : 0,
                bestSkill: routeResult.skill,
                bestSkillScore: routeResult.confidence,
                decision: "allowed",
                reason: routeResult.reason || `Route via ${routeResult.type}`,
                latencyMs: l1LatencyMs,
              })
            }
          } catch (capabilityError) {
            const l1LatencyMs = Date.now() - l1StartTime

            // Check if it was a policy denial
            if (capabilityError instanceof CapabilityDeniedError) {
              const agency = AgencyRegistry.getAgency(agencyId)
              log.debug("capability routing denied by policy", {
                intentId: intent.id,
                capability: capabilityError.message,
                agency: agencyId,
              })

              // Emit policy denied event
              if (Flag.KILO_ROUTING_SHADOW_ENABLED) {
                RoutingMetrics.recordPolicyDenied({
                  correlationId: intent.id,
                  agencyId,
                  capability: capabilityError.message,
                  policy: "deniedCapabilities",
                  reason: capabilityError.message,
                })
              }

              // Emit fallback event
              RoutingMetrics.recordFallback({
                correlationId: intent.id,
                layer: "L1",
                originalRoute: "capability",
                fallbackRoute: "domain-fallback",
                reason: `Policy denied: ${capabilityError.message}`,
                latencyMs: l1LatencyMs,
              })
            } else {
              log.debug("capability routing failed, using domain fallback", {
                intentId: intent.id,
                error: capabilityError instanceof Error ? capabilityError.message : String(capabilityError),
              })

              // Emit fallback event for non-policy errors
              if (Flag.KILO_ROUTING_SHADOW_ENABLED) {
                RoutingMetrics.recordFallback({
                  correlationId: intent.id,
                  layer: "L1",
                  originalRoute: "capability",
                  fallbackRoute: "domain-fallback",
                  reason: capabilityError instanceof Error ? capabilityError.message : String(capabilityError),
                  latencyMs: l1LatencyMs,
                })
              }
            }
          }

          // Step 3: Return agency assignment
          return {
            agencyId,
            confidence: routingResult.confidence,
            reason: routeResult
              ? `${routeResult.reason || routeResult.type} via ${routeResult.skill || routeResult.chain || routeResult.agent || "agent"}`
              : routingResult.reasoning,
          }
        } catch (error) {
          const totalLatencyMs = Date.now() - startTime

          log.error("routing failed, using fallback", {
            intentId: intent.id,
            error: error instanceof Error ? error.message : String(error),
          })

          // Emit fallback event for complete routing failure
          if (Flag.KILO_ROUTING_SHADOW_ENABLED) {
            RoutingMetrics.recordFallback({
              correlationId: intent.id,
              layer: "L0",
              originalRoute: "domain",
              fallbackRoute: "default-domain",
              reason: error instanceof Error ? error.message : String(error),
              latencyMs: totalLatencyMs,
            })
          }

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

        const risk = context.intent?.risk ?? "low"
        const approval = context.userApproved ?? false
        const highRiskActions = ["delete", "rm", "remove", "drop", "destroy", "truncate", "wipe"]
        const hasHighRiskAction = highRiskActions.some((item) => action.type.toLowerCase().includes(item))
        const hasNetwork = action.type.toLowerCase().includes("network") || action.type.toLowerCase().includes("http")

        const requiresApproval = risk === "high" || risk === "critical" || hasHighRiskAction

        if (requiresApproval && !approval) {
          void AuditRepo.log({
            id: crypto.randomUUID(),
            actor: context.agentId ?? "system",
            action: "policy_denied",
            target_type: "policy",
            target_id: action.type,
            reason: "action requires explicit approval by policy",
            correlation_id: context.correlationId,
            previous_hash: "",
            hash: "",
            metadata_json: {
              action,
              agencyId: context.agencyId,
              risk,
              approval,
            },
            ts: Date.now(),
            created_at: Date.now(),
          }).catch((err) => {
            log.warn("policy audit write failed", { err: err instanceof Error ? err.message : String(err) })
          })

          return {
            allowed: false,
            reason: "action requires explicit approval by policy",
            requiresApproval: true,
          }
        }

        if (hasNetwork && risk === "critical" && !approval) {
          void AuditRepo.log({
            id: crypto.randomUUID(),
            actor: context.agentId ?? "system",
            action: "policy_denied",
            target_type: "policy",
            target_id: action.type,
            reason: "critical network action denied without approval",
            correlation_id: context.correlationId,
            previous_hash: "",
            hash: "",
            metadata_json: {
              action,
              agencyId: context.agencyId,
              risk,
              approval,
            },
            ts: Date.now(),
            created_at: Date.now(),
          }).catch((err) => {
            log.warn("policy audit write failed", { err: err instanceof Error ? err.message : String(err) })
          })

          return {
            allowed: false,
            reason: "critical network action denied without approval",
            requiresApproval: true,
          }
        }

        if (requiresApproval) {
          void AuditRepo.log({
            id: crypto.randomUUID(),
            actor: context.agentId ?? "system",
            action: "policy_approved",
            target_type: "policy",
            target_id: action.type,
            reason: "approved high-risk action",
            correlation_id: context.correlationId,
            previous_hash: "",
            hash: "",
            metadata_json: {
              action,
              agencyId: context.agencyId,
              risk,
              approval,
            },
            ts: Date.now(),
            created_at: Date.now(),
          }).catch((err) => {
            log.warn("policy audit write failed", { err: err instanceof Error ? err.message : String(err) })
          })
        }

        return {
          allowed: true,
          reason: requiresApproval ? "approved high-risk action" : "policy checks passed",
          requiresApproval,
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
