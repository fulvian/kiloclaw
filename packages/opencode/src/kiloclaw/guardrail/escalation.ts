import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import type { Action } from "../types"
import { RISK_THRESHOLDS } from "../policy/rules"
import type { Guardrail, GuardrailResult, ActionContext } from "../policy/rules"

// Escalation contact types
export type EscalationContact = "user" | "admin" | "audit"

// Escalation policy for high-risk actions
export interface EscalationPolicy {
  readonly requiresExplicitConsent: boolean
  readonly requiresDoubleGate: boolean
  readonly escalationContact: EscalationContact
}

// Escalation result
export interface EscalationResult {
  readonly requiresEscalation: boolean
  readonly contact: EscalationContact
  readonly reason: string
  readonly policy: EscalationPolicy
}

// Escalation audit entry
interface EscalationEntry {
  timestamp: Date
  correlationId: string
  actionType: string
  contact: EscalationContact
  reason: string
  requiresExplicitConsent: boolean
  requiresDoubleGate: boolean
}

// Escalation handler - routes high-risk actions to appropriate contacts
export class EscalationHandler implements Guardrail {
  readonly id: string
  readonly name: string
  readonly type: "static" | "dynamic" = "dynamic"
  private readonly log: ReturnType<typeof Log.create>
  private readonly policies: Map<string, EscalationPolicy>
  private readonly auditLog: EscalationEntry[]

  constructor() {
    this.id = "escalation-handler"
    this.name = "Escalation Handler"
    this.log = Log.create({ service: "kiloclaw.guardrail.escalation" })
    this.policies = new Map()
    this.auditLog = []

    // Register default escalation policies
    this.registerDefaultPolicies()
  }

  // Register default escalation policies based on action types
  private registerDefaultPolicies(): void {
    // Critical actions requiring explicit consent
    const criticalActions = [
      "delete_data",
      "external_api_write",
      "file_system_write_irreversible",
      "consent_data_sharing",
      "financial_transaction",
    ]

    for (const action of criticalActions) {
      this.policies.set(action, {
        requiresExplicitConsent: true,
        requiresDoubleGate: true,
        escalationContact: "admin",
      })
    }

    // High-risk actions requiring user consent
    const highRiskActions = ["network_request", "external_fetch", "data_export", "config_change"]

    for (const action of highRiskActions) {
      this.policies.set(action, {
        requiresExplicitConsent: true,
        requiresDoubleGate: false,
        escalationContact: "user",
      })
    }

    // Audit-only actions (log but allow)
    const auditActions = ["read_file", "list_directory", "get_status"]

    for (const action of auditActions) {
      this.policies.set(action, {
        requiresExplicitConsent: false,
        requiresDoubleGate: false,
        escalationContact: "audit",
      })
    }
  }

  // Evaluate action and determine if escalation is needed
  evaluate(context: ActionContext, action: Action): GuardrailResult {
    this.log.info("evaluating escalation", {
      actionType: action.type,
      correlationId: context.correlationId,
    })

    const escalationResult = this.checkEscalation(action)

    if (!escalationResult.requiresEscalation) {
      return {
        allowed: true,
        reason: "action does not require escalation",
        escalationRequired: false,
      }
    }

    // Log escalation decision
    this.logEscalation(context, action, escalationResult)

    if (escalationResult.policy.requiresDoubleGate) {
      return {
        allowed: false,
        reason: `double-gate approval required - contacting ${escalationResult.contact}`,
        riskScore: 0.9,
        escalationRequired: true,
      }
    }

    if (escalationResult.policy.requiresExplicitConsent) {
      return {
        allowed: true,
        reason: `escalation required - pending ${escalationResult.contact} approval`,
        riskScore: 0.75,
        escalationRequired: true,
      }
    }

    // Audit-only - log and continue
    return {
      allowed: true,
      reason: `audit logged - ${escalationResult.contact} notified`,
      riskScore: 0.5,
      escalationRequired: false,
    }
  }

  // Check if action requires escalation
  checkEscalation(action: Action): EscalationResult {
    const actionType = action.type.toLowerCase()

    // Check for exact match
    for (const [pattern, policy] of this.policies) {
      if (actionType.includes(pattern)) {
        return {
          requiresEscalation: policy.requiresExplicitConsent || policy.requiresDoubleGate,
          contact: policy.escalationContact,
          reason: `matched policy for ${pattern}`,
          policy,
        }
      }
    }

    // Default: no escalation for unknown actions
    return {
      requiresEscalation: false,
      contact: "audit",
      reason: "no matching escalation policy",
      policy: {
        requiresExplicitConsent: false,
        requiresDoubleGate: false,
        escalationContact: "audit",
      },
    }
  }

  // Register or update escalation policy for action pattern
  registerPolicy(actionPattern: string, policy: EscalationPolicy): void {
    this.policies.set(actionPattern, policy)
    this.log.info("escalation policy registered", { actionPattern, policy })
  }

  // Check if explicit consent is required
  requiresExplicitConsent(actionType: string): boolean {
    for (const [pattern, policy] of this.policies) {
      if (actionType.includes(pattern)) {
        return policy.requiresExplicitConsent
      }
    }
    return false
  }

  // Check if double gate is required
  requiresDoubleGate(actionType: string): boolean {
    for (const [pattern, policy] of this.policies) {
      if (actionType.includes(pattern)) {
        return policy.requiresDoubleGate
      }
    }
    return false
  }

  // Get escalation contact for action
  getEscalationContact(actionType: string): EscalationContact {
    const result = this.checkEscalation({ type: actionType } as Action)
    return result.contact
  }

  // Log escalation decision
  private logEscalation(context: ActionContext, action: Action, result: EscalationResult): void {
    this.auditLog.push({
      timestamp: new Date(),
      correlationId: context.correlationId,
      actionType: action.type,
      contact: result.contact,
      reason: result.reason,
      requiresExplicitConsent: result.policy.requiresExplicitConsent,
      requiresDoubleGate: result.policy.requiresDoubleGate,
    })
  }

  // Get audit log
  getAuditLog(): ReadonlyArray<EscalationEntry> {
    return [...this.auditLog]
  }

  // Clear audit log
  clearAuditLog(): void {
    this.auditLog.length = 0
    this.log.info("audit log cleared")
  }
}

// Factory function
export const EscalationHandler$ = {
  create: fn(z.object({}), () => new EscalationHandler()),
}
