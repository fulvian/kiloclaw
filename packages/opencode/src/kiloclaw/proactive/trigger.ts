import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"

// Trigger signal types
export const TriggerSignal = z.enum(["schedule", "reminder", "anomaly", "threshold"])
export type TriggerSignal = z.infer<typeof TriggerSignal>

// Proaction types
export const ProactionType = z.enum(["suggest", "notify", "act_low_risk"])
export type ProactionType = z.infer<typeof ProactionType>

// Trigger condition definition
export interface TriggerCondition {
  readonly signal: TriggerSignal
  readonly name: string
  readonly description: string
  readonly enabled: boolean
  readonly config: TriggerConfig
}

// Trigger configuration
export interface TriggerConfig {
  readonly frequency?: string // cron expression for schedule
  readonly threshold?: number // for threshold triggers
  readonly patterns?: string[] // for anomaly detection
  readonly reminderId?: string // for reminder triggers
}

// Trigger event
export interface TriggerEvent {
  readonly signal: TriggerSignal
  readonly triggeredAt: Date
  readonly condition: string
  readonly metadata?: Record<string, unknown>
}

// Trigger evaluator - matches events against conditions
export class TriggerEvaluator {
  private readonly log: ReturnType<typeof Log.create>
  private readonly conditions: Map<string, TriggerCondition>

  constructor() {
    this.log = Log.create({ service: "kiloclaw.proactive.trigger" })
    this.conditions = new Map()
  }

  // Register a trigger condition
  register(condition: TriggerCondition): void {
    this.conditions.set(condition.name, condition)
    this.log.info("trigger condition registered", {
      name: condition.name,
      signal: condition.signal,
      enabled: condition.enabled,
    })
  }

  // Unregister a trigger condition
  unregister(name: string): void {
    this.conditions.delete(name)
    this.log.info("trigger condition unregistered", { name })
  }

  // Evaluate an event against registered conditions
  evaluate(event: TriggerEvent): MatchingResult {
    this.log.debug("evaluating trigger event", { signal: event.signal, condition: event.condition })

    const matches: TriggerCondition[] = []

    for (const condition of this.conditions.values()) {
      if (!condition.enabled) continue

      if (this.matches(event, condition)) {
        matches.push(condition)
        this.log.info("trigger matched", { conditionName: condition.name })
      }
    }

    return {
      matched: matches.length > 0,
      conditions: matches,
      timestamp: event.triggeredAt,
    }
  }

  // Check if event matches a condition
  private matches(event: TriggerEvent, condition: TriggerCondition): boolean {
    // Signal must match
    if (event.signal !== condition.signal) return false

    // Condition name or pattern must match
    if (event.condition === condition.name) return true

    // Check patterns if defined
    if (condition.config.patterns) {
      return condition.config.patterns.some((p) => event.condition.includes(p))
    }

    return false
  }

  // Check if a specific trigger is enabled
  isEnabled(name: string): boolean {
    const condition = this.conditions.get(name)
    return condition?.enabled ?? false
  }

  // Enable/disable a trigger
  setEnabled(name: string, enabled: boolean): void {
    const condition = this.conditions.get(name)
    if (condition) {
      condition.enabled = enabled
      this.log.info("trigger enabled state changed", { name, enabled })
    }
  }

  // Get all registered conditions
  getConditions(): TriggerCondition[] {
    return [...this.conditions.values()]
  }

  // Get conditions by signal type
  getConditionsBySignal(signal: TriggerSignal): TriggerCondition[] {
    return [...this.conditions.values()].filter((c) => c.signal === signal)
  }
}

// Matching result
export interface MatchingResult {
  readonly matched: boolean
  readonly conditions: TriggerCondition[]
  readonly timestamp: Date
}

// Namespace exports
export namespace Trigger {
  export const Signal = TriggerSignal
  export const ProactionType = ProactionType

  export function createCondition(input: {
    signal: TriggerSignal
    name: string
    description: string
    enabled?: boolean
    config?: TriggerConfig
  }): TriggerCondition {
    return {
      signal: input.signal,
      name: input.name,
      description: input.description,
      enabled: input.enabled ?? true,
      config: input.config ?? {},
    }
  }

  export function createEvent(input: {
    signal: TriggerSignal
    condition: string
    metadata?: Record<string, unknown>
  }): TriggerEvent {
    return {
      signal: input.signal,
      triggeredAt: new Date(),
      condition: input.condition,
      metadata: input.metadata,
    }
  }
}

// Default trigger conditions
export const DEFAULT_TRIGGERS: TriggerCondition[] = [
  {
    signal: "schedule",
    name: "daily_digest",
    description: "Daily summary of activities and recommendations",
    enabled: true,
    config: { frequency: "0 9 * * *" },
  },
  {
    signal: "reminder",
    name: "user_reminder",
    description: "User-set reminders",
    enabled: true,
    config: {},
  },
  {
    signal: "anomaly",
    name: "behavioral_anomaly",
    description: "Detected anomalies in user behavior",
    enabled: true,
    config: { patterns: ["unusual_time", "unusual_frequency", "unusual_action"] },
  },
  {
    signal: "threshold",
    name: "metric_threshold",
    description: "Metric thresholds exceeded",
    enabled: true,
    config: { threshold: 0.8 },
  },
]
