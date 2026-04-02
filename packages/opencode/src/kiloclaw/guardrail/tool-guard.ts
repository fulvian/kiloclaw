import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import type { Action } from "../types"
import { PermissionScope, DataClassification, RISK_THRESHOLDS } from "../policy/rules"
import type { ActionContext } from "../policy/rules"

// Guardrail interface
export interface Guardrail {
  readonly id: string
  readonly name: string
  readonly type: "static" | "dynamic"
  evaluate(context: ActionContext, action: Action): GuardrailResult
}

// Guardrail result
export interface GuardrailResult {
  readonly allowed: boolean
  readonly reason: string
  readonly riskScore?: number
  readonly escalationRequired: boolean
}

// Guardrail configuration
export interface GuardrailConfig {
  riskThreshold: number
  globalKillSwitch: boolean
  perAgencyKillSwitch: Record<string, boolean>
  fallbackToConsultative: boolean
}

// Audit entry structure
interface AuditEntry {
  timestamp: Date
  correlationId: string
  actionType: string
  agencyId?: string
  decision: "approved" | "blocked" | "escalated"
  reason: string
}

// Tool call guardrail - validates tool execution permissions
export class ToolCallGuardrail implements Guardrail {
  readonly id: string
  readonly name: string
  readonly type: "static" | "dynamic" = "static"
  private readonly log: ReturnType<typeof Log.create>
  private readonly config: GuardrailConfig
  private readonly auditLog: AuditEntry[]

  constructor(config: Partial<GuardrailConfig> = {}) {
    this.id = "tool-call-guardrail"
    this.name = "Tool Call Guardrail"
    this.log = Log.create({ service: "kiloclaw.guardrail.tool" })
    this.auditLog = []
    this.config = {
      riskThreshold: config.riskThreshold ?? RISK_THRESHOLDS.medium,
      globalKillSwitch: config.globalKillSwitch ?? false,
      perAgencyKillSwitch: config.perAgencyKillSwitch ?? {},
      fallbackToConsultative: config.fallbackToConsultative ?? true,
    }
  }

  // Evaluate tool call against permissions and scopes
  evaluate(context: ActionContext, action: Action): GuardrailResult {
    this.log.info("evaluating tool call", {
      actionType: action.type,
      correlationId: context.correlationId,
    })

    // Check global kill switch
    if (this.config.globalKillSwitch) {
      this.log.warn("global kill switch active - blocking all tool calls")
      this.logAudit(context, action, "blocked", "global kill switch")
      return {
        allowed: false,
        reason: "global kill switch is active",
        escalationRequired: true,
      }
    }

    // Check per-agency kill switch
    if (context.agencyId && this.config.perAgencyKillSwitch[context.agencyId]) {
      this.log.warn("agency kill switch active", { agencyId: context.agencyId })
      this.logAudit(context, action, "blocked", "agency kill switch")
      return {
        allowed: false,
        reason: `kill switch active for agency ${context.agencyId}`,
        escalationRequired: true,
      }
    }

    // Validate scope based on action type
    const requiredScopes = this.getRequiredScopes(action)
    const hasValidScopes = this.validateScopes(context, requiredScopes)

    if (!hasValidScopes.valid) {
      this.log.warn("insufficient scopes", {
        required: requiredScopes,
        available: context.toolIds,
      })
      this.logAudit(context, action, "blocked", "insufficient scopes")
      return {
        allowed: false,
        reason: `insufficient scopes: missing ${hasValidScopes.missing.join(", ")}`,
        escalationRequired: false,
      }
    }

    // Log successful pre-execution validation
    this.logAudit(context, action, "approved", "scopes validated")
    return {
      allowed: true,
      reason: "tool call approved",
      escalationRequired: false,
    }
  }

  // Determine required scopes for an action
  private getRequiredScopes(action: Action): PermissionScope[] {
    const actionType = action.type.toLowerCase()

    // Read operations
    if (actionType.includes("read") || actionType.includes("get") || actionType.includes("list")) {
      return ["read"]
    }

    // Write operations
    if (
      actionType.includes("write") ||
      actionType.includes("create") ||
      actionType.includes("update") ||
      actionType.includes("edit")
    ) {
      return ["write"]
    }

    // Execute operations (running commands, tools)
    if (actionType.includes("execute") || actionType.includes("run") || actionType.includes("invoke")) {
      return ["execute"]
    }

    // Network operations
    if (actionType.includes("network") || actionType.includes("http") || actionType.includes("fetch")) {
      return ["network"]
    }

    // External API operations
    if (actionType.includes("external") || actionType.includes("api")) {
      return ["external_api"]
    }

    // Filesystem operations
    if (actionType.includes("file") || actionType.includes("fs")) {
      return ["filesystem"]
    }

    // Default to read scope for unknown actions
    return ["read"]
  }

  // Validate that context has required scopes
  private validateScopes(
    context: ActionContext,
    required: PermissionScope[],
  ): { valid: boolean; missing: PermissionScope[] } {
    const available = context.toolIds ?? []
    const missing = required.filter((r) => !available.some((t) => String(t).includes(r)))

    return {
      valid: missing.length === 0,
      missing,
    }
  }

  // Audit logging for post-execution tracking
  private logAudit(
    context: ActionContext,
    action: Action,
    decision: "approved" | "blocked" | "escalated",
    reason: string,
  ): void {
    this.auditLog.push({
      timestamp: new Date(),
      correlationId: context.correlationId,
      actionType: action.type,
      agencyId: context.agencyId,
      decision,
      reason,
    })
  }

  // Get audit log entries
  getAuditLog(): ReadonlyArray<AuditEntry> {
    return [...this.auditLog]
  }

  // Check if kill switch is active
  isKillSwitchActive(agencyId?: string): boolean {
    if (this.config.globalKillSwitch) return true
    if (agencyId && this.config.perAgencyKillSwitch[agencyId]) return true
    return false
  }

  // Toggle kill switch
  setKillSwitch(active: boolean, agencyId?: string): void {
    if (agencyId) {
      this.config.perAgencyKillSwitch[agencyId] = active
      this.log.info("agency kill switch updated", { agencyId, active })
    } else {
      this.config.globalKillSwitch = active
      this.log.info("global kill switch updated", { active })
    }
  }
}

// Factory function
export const ToolCallGuardrail$ = {
  create: fn(
    z.object({
      riskThreshold: z.number().min(0).max(1).optional(),
      globalKillSwitch: z.boolean().optional(),
      perAgencyKillSwitch: z.record(z.string(), z.boolean()).optional(),
      fallbackToConsultative: z.boolean().optional(),
    }),
    (config) => new ToolCallGuardrail(config),
  ),
}
