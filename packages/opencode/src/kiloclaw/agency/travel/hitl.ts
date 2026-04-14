// Travel HITL Gates - Human-in-the-loop triggers for high-impact operations
import { Log } from "@/util/log"
import * as z from "zod"

const log = Log.create({ service: "travel.hitl" })

// ============================================================================
// HITL Trigger Types
// ============================================================================

export enum TravelHITLTrigger {
  HIGH_COST = "high_cost",
  NON_REFUNDABLE = "non_refundable",
  MINORS = "minors",
  ACCESSIBILITY = "accessibility",
  MEDICAL = "medical",
  EMBASSY = "embassy",
  EMERGENCY = "emergency",
  SENSITIVE_DATA = "sensitive_data",
}

export interface HITLGateResult {
  requiresApproval: boolean
  trigger?: TravelHITLTrigger
  reason: string
  severity: "low" | "medium" | "high" | "critical"
  recommendedAction: "auto_approve" | "confirm_user" | "block" | "escalate"
  metadata?: Record<string, unknown>
}

// ============================================================================
// Configuration
// ============================================================================

export interface HITLConfig {
  highCostThreshold: number // Default: 1000 EUR
  highCostCurrency: string // Default: EUR
  allowNonRefundable: boolean // Default: false
  allowMinors: boolean // Default: false
  allowMedicalRequests: boolean // Default: false
}

export const DEFAULT_HITL_CONFIG: HITLConfig = {
  highCostThreshold: 1000,
  highCostCurrency: "EUR",
  allowNonRefundable: false,
  allowMinors: false,
  allowMedicalRequests: false,
}

// ============================================================================
// Input Schema
// ============================================================================

export const EvaluateGateInput = z.object({
  totalCost: z.number().describe("Total trip cost in cents/minor units"),
  currency: z.string().default("EUR"),
  isRefundable: z.boolean().default(true),
  hasMinors: z.boolean().default(false),
  hasAccessibilityNeeds: z.boolean().default(false),
  hasMedicalRequest: z.boolean().default(false),
  involvesDocuments: z.boolean().default(false), // passport, visa, etc.
  involvesEmergency: z.boolean().default(false),
  userConfirmationReceived: z.boolean().default(false),
})

export type EvaluateGateInput = z.infer<typeof EvaluateGateInput>

// ============================================================================
// HITL Gate Evaluator
// ============================================================================

export class TravelHITLGate {
  private config: HITLConfig

  constructor(config: Partial<HITLConfig> = {}) {
    this.config = { ...DEFAULT_HITL_CONFIG, ...config }
  }

  // Evaluate if operation requires human approval
  evaluate(input: EvaluateGateInput): HITLGateResult {
    log.info("Evaluating HITL gate", { input })

    // Check high cost threshold
    if (input.totalCost > this.config.highCostThreshold * 100) {
      return {
        requiresApproval: true,
        trigger: TravelHITLTrigger.HIGH_COST,
        reason: `Total cost (${input.totalCost / 100} ${input.currency}) exceeds threshold (${this.config.highCostThreshold} ${input.currency})`,
        severity: "high",
        recommendedAction: input.userConfirmationReceived ? "confirm_user" : "block",
        metadata: { threshold: this.config.highCostThreshold, actual: input.totalCost / 100 },
      }
    }

    // Check non-refundable booking
    if (!input.isRefundable && !this.config.allowNonRefundable) {
      return {
        requiresApproval: true,
        trigger: TravelHITLTrigger.NON_REFUNDABLE,
        reason: "Booking is non-refundable - user confirmation required",
        severity: "medium",
        recommendedAction: "confirm_user",
      }
    }

    // Check minors in travel party
    if (input.hasMinors && !this.config.allowMinors) {
      return {
        requiresApproval: true,
        trigger: TravelHITLTrigger.MINORS,
        reason: "Travel party includes minors - enhanced verification required",
        severity: "high",
        recommendedAction: "escalate",
      }
    }

    // Check accessibility needs
    if (input.hasAccessibilityNeeds) {
      return {
        requiresApproval: true,
        trigger: TravelHITLTrigger.ACCESSIBILITY,
        reason: "Traveler has accessibility needs - verify accommodations",
        severity: "medium",
        recommendedAction: "confirm_user",
      }
    }

    // Check medical requests
    if (input.hasMedicalRequest && !this.config.allowMedicalRequests) {
      return {
        requiresApproval: true,
        trigger: TravelHITLTrigger.MEDICAL,
        reason: "Medical assistance requested - requires human review",
        severity: "critical",
        recommendedAction: "escalate",
        metadata: { note: "Do not automate medical decisions" },
      }
    }

    // Check sensitive documents
    if (input.involvesDocuments) {
      return {
        requiresApproval: true,
        trigger: TravelHITLTrigger.SENSITIVE_DATA,
        reason: "Operation involves travel documents - verify consent",
        severity: "medium",
        recommendedAction: "confirm_user",
      }
    }

    // Check emergency
    if (input.involvesEmergency) {
      return {
        requiresApproval: true,
        trigger: TravelHITLTrigger.EMERGENCY,
        reason: "Emergency situation detected - immediate human contact required",
        severity: "critical",
        recommendedAction: "escalate",
        metadata: { note: "Priority: highest - contact support immediately" },
      }
    }

    // All checks passed - no approval needed
    return {
      requiresApproval: false,
      reason: "All checks passed - operation approved",
      severity: "low",
      recommendedAction: "auto_approve",
    }
  }

  // Update configuration
  updateConfig(config: Partial<HITLConfig>): void {
    this.config = { ...this.config, ...config }
    log.info("HITL config updated", { config: this.config })
  }
}

// ============================================================================
// Skill Namespace for Tool Integration
// ============================================================================

export namespace TravelHITL {
  const log = Log.create({ service: "travel.hitl.skill" })
  const gate = new TravelHITLGate()

  // Evaluate HITL gate for a travel operation
  export async function evaluate(input: EvaluateGateInput): Promise<HITLGateResult> {
    log.info("Evaluating HITL gate", { input })
    return gate.evaluate(input)
  }

  // Configure HITL gate settings
  export async function configure(config?: Partial<HITLConfig>): Promise<void> {
    if (config) {
      gate.updateConfig(config)
    }
  }
}

export const travelHITL = TravelHITL
