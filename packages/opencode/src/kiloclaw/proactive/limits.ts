import z from "zod"
import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import { TriggerSignal, ProactionType } from "./trigger"

// Confirmation modes
export const ConfirmationMode = z.enum(["none", "suggest_then_act", "explicit_approval"])
export type ConfirmationMode = z.infer<typeof ConfirmationMode>

// Proactivity policy interface
export interface ProactivityPolicy {
  readonly allowedTriggers: TriggerSignal[]
  readonly allowedProactions: ProactionType[]
  readonly dailyBudget: number
  readonly confirmationMode: ConfirmationMode
  readonly maxTasksPerDay: number
}

// Proactivity limits configuration
export interface ProactivityLimitsConfig {
  readonly maxProactiveActionsPerDay: number
  readonly maxSuggestionsPerDay: number
  readonly maxNotificationsPerDay: number
  readonly maxLowRiskActionsPerDay: number
  readonly confirmationMode: ConfirmationMode
  readonly allowedTriggers: TriggerSignal[]
  readonly allowOverBudget: boolean
}

// Policy validator
export const ProactivityLimitsSchema = z.object({
  maxProactiveActionsPerDay: z.number().int().positive().default(100),
  maxSuggestionsPerDay: z.number().int().positive().default(50),
  maxNotificationsPerDay: z.number().int().positive().default(30),
  maxLowRiskActionsPerDay: z.number().int().positive().default(10),
  confirmationMode: ConfirmationMode.default("suggest_then_act"),
  allowedTriggers: z.array(TriggerSignal).default(["schedule", "reminder", "anomaly", "threshold"]),
  allowOverBudget: z.boolean().default(false),
})

// Default proactivity limits
export const DEFAULT_PROACTIVITY_LIMITS: ProactivityLimitsConfig = {
  maxProactiveActionsPerDay: 100,
  maxSuggestionsPerDay: 50,
  maxNotificationsPerDay: 30,
  maxLowRiskActionsPerDay: 10,
  confirmationMode: "suggest_then_act",
  allowedTriggers: ["schedule", "reminder", "anomaly", "threshold"],
  allowOverBudget: false,
}

// Proactivity limits manager
export class ProactivityLimitsManager {
  private readonly log: ReturnType<typeof Log.create>
  private limits: ProactivityLimitsConfig

  constructor(limits?: Partial<ProactivityLimitsConfig>) {
    this.log = Log.create({ service: "kiloclaw.proactive.limits" })
    this.limits = { ...DEFAULT_PROACTIVITY_LIMITS, ...limits }

    this.log.info("proactivity limits initialized", { limits: this.limits })
  }

  // Get current limits
  getLimits(): ProactivityLimitsConfig {
    return { ...this.limits }
  }

  // Update limits
  updateLimits(limits: Partial<ProactivityLimitsConfig>): void {
    this.limits = { ...this.limits, ...limits }
    this.log.info("proactivity limits updated", { limits })
  }

  // Check if a proaction type is allowed
  isProactionAllowed(type: ProactionType): boolean {
    return true // All proactions allowed by default
  }

  // Check if a trigger is allowed
  isTriggerAllowed(trigger: TriggerSignal): boolean {
    return this.limits.allowedTriggers.includes(trigger)
  }

  // Get max actions for a proaction type
  getMaxActions(type: ProactionType): number {
    switch (type) {
      case "suggest":
        return this.limits.maxSuggestionsPerDay
      case "notify":
        return this.limits.maxNotificationsPerDay
      case "act_low_risk":
        return this.limits.maxLowRiskActionsPerDay
      default:
        return this.limits.maxProactiveActionsPerDay
    }
  }

  // Check if budget allows action
  canConsumeBudget(currentUsage: number, type: ProactionType): boolean {
    const max = this.getMaxActions(type)
    return currentUsage < max
  }

  // Get confirmation mode
  getConfirmationMode(): ConfirmationMode {
    return this.limits.confirmationMode
  }

  // Check if explicit approval is required
  requiresExplicitApproval(): boolean {
    return this.limits.confirmationMode === "explicit_approval"
  }

  // Check if suggestion-then-act mode is enabled
  isSuggestThenAct(): boolean {
    return this.limits.confirmationMode === "suggest_then_act"
  }

  // Check if over-budget is allowed
  isOverBudgetAllowed(): boolean {
    return this.limits.allowOverBudget
  }

  // Create policy from limits
  toPolicy(): ProactivityPolicy {
    return {
      allowedTriggers: this.limits.allowedTriggers,
      allowedProactions: ["suggest", "notify", "act_low_risk"],
      dailyBudget: this.limits.maxProactiveActionsPerDay,
      confirmationMode: this.limits.confirmationMode,
      maxTasksPerDay: this.limits.maxProactiveActionsPerDay,
    }
  }
}

// Factory function
export const ProactivityLimitsManager$ = {
  create: fn(ProactivityLimitsSchema.partial(), (limits) => new ProactivityLimitsManager(limits)),
}

// Helper to validate proactivity config
export function validateProactivityConfig(config: unknown): ProactivityLimitsConfig {
  return ProactivityLimitsSchema.parse(config)
}

// Safe parse version
export function safeParseProactivityConfig(
  config: unknown,
): { success: true; data: ProactivityLimitsConfig } | { success: false; error: z.ZodError } {
  const result = ProactivityLimitsSchema.safeParse(config)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
}

// Namespace exports
export namespace ProactivityLimits {
  export const Schema = ProactivityLimitsSchema
  export const Mode = ConfirmationMode

  export function create(limits?: Partial<ProactivityLimitsConfig>): ProactivityLimitsManager {
    return new ProactivityLimitsManager(limits)
  }

  export function getDefault(): ProactivityLimitsConfig {
    return { ...DEFAULT_PROACTIVITY_LIMITS }
  }

  export function isValidTrigger(trigger: string): boolean {
    return TriggerSignal.options.includes(trigger as TriggerSignal)
  }

  export function isValidProaction(proaction: string): boolean {
    return ProactionType.options.includes(proaction as ProactionType)
  }
}
