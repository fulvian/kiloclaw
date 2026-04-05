/**
 * Proactive Policy Gate - Unified gate integrating budget, limits, guardrails, HITL
 * Evaluates whether a proactive task should be allowed to execute
 */

import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import { BudgetManager, type BudgetStats } from "./budget"
import { ProactivityLimitsManager, type ProactivityLimitsConfig } from "./limits"
import type { ProactiveTask } from "./scheduler.store"
import type { TriggerEvent } from "./trigger"
import type { ExecutionContext, GateResult } from "./scheduler.engine"
import {
  ProactiveUserControls,
  type ProactiveUserControls as UserControls,
  isKillSwitchEnabled,
  isQuietHours,
  getUserControls,
} from "./user-controls"

// =============================================================================
// Types
// =============================================================================

/**
 * Risk level for proactive actions
 */
export const RiskLevel = z.enum(["low", "medium", "high", "critical"])
export type RiskLevel = z.infer<typeof RiskLevel>

/**
 * Gate decision with full context
 */
export interface GateDecision {
  allowed: boolean
  reasons: string[]
  blockers: string[]
  riskLevel: RiskLevel
  requiresHitl: boolean
  metadata: Record<string, unknown>
}

/**
 * Gate configuration
 */
export const PolicyGateConfigSchema = z.object({
  budgetManager: z.instanceof(BudgetManager).optional(),
  limitsManager: z.instanceof(ProactivityLimitsManager).optional(),
  hitlEnabled: z.boolean().default(false),
  riskThreshold: RiskLevel.default("high"), // Max risk level allowed without HITL
  allowOverBudget: z.boolean().default(false),
})

export type PolicyGateConfig = z.infer<typeof PolicyGateConfigSchema>

/**
 * HITL approval status
 */
export const HitlStatus = z.enum(["pending", "approved", "denied", "expired"])
export type HitlStatus = z.infer<typeof HitlStatus>

/**
 * HITL checkpoint
 */
export interface HitlCheckpoint {
  taskId: string
  runId: string
  status: HitlStatus
  requestedAt: number
  approvedAt?: number
  deniedAt?: number
  expiresAt: number
  requester?: string
  reason?: string
}

// =============================================================================
// PolicyGate implementations
// =============================================================================

/**
 * Unified policy gate that integrates all checks
 */
export class ProactivePolicyGate {
  private readonly log: ReturnType<typeof Log.create>
  private readonly budgetManager: BudgetManager | null
  private readonly limitsManager: ProactivityLimitsManager | null
  private readonly hitlEnabled: boolean
  private readonly riskThreshold: RiskLevel
  private readonly allowOverBudget: boolean

  // HITL checkpoints in memory (in production, would persist to DB)
  private hitlCheckpoints: Map<string, HitlCheckpoint> = new Map()

  // Risk evaluation weights
  private readonly riskWeights: Record<string, number> = {
    suggest: 1,
    notify: 2,
    act_low_risk: 3,
  }

  constructor(config?: Partial<PolicyGateConfig>) {
    this.log = Log.create({ service: "kilocclaw.proactive.policy_gate" })
    this.budgetManager = config?.budgetManager ?? null
    this.limitsManager = config?.limitsManager ?? null
    this.hitlEnabled = config?.hitlEnabled ?? false
    this.riskThreshold = config?.riskThreshold ?? "high"
    this.allowOverBudget = config?.allowOverBudget ?? false

    this.log.info("policy gate initialized", {
      hasBudgetManager: !!this.budgetManager,
      hasLimitsManager: !!this.limitsManager,
      hitlEnabled: this.hitlEnabled,
      riskThreshold: this.riskThreshold,
    })
  }

  /**
   * Evaluate a task against all policy gates
   */
  async evaluate(task: ProactiveTask, context?: ExecutionContext): Promise<GateResult> {
    const decision = await this.evaluateWithDecision(task, context)

    return {
      allowed: decision.allowed,
      reasons: decision.reasons,
      blockers: decision.blockers,
      metadata: decision.metadata,
    }
  }

  /**
   * Evaluate a task with full decision context
   */
  async evaluateWithDecision(task: ProactiveTask, context?: ExecutionContext): Promise<GateDecision> {
    const reasons: string[] = []
    const blockers: string[] = []
    const metadata: Record<string, unknown> = {}

    // Parse trigger config to determine action type and risk
    let actionType: keyof typeof this.riskWeights = "suggest"
    let riskLevel: RiskLevel = "low"

    try {
      const triggerConfig = JSON.parse(task.triggerConfig)
      actionType = (triggerConfig.signal as keyof typeof this.riskWeights) ?? "suggest"
      riskLevel = this.assessRiskLevel(triggerConfig)
    } catch {
      // Default to low risk if parse fails
      actionType = "suggest"
      riskLevel = "low"
    }

    metadata.actionType = actionType
    metadata.riskLevel = riskLevel

    // 0. User controls check (kill switch, quiet hours, override)
    const userControlsCheck = await this.checkUserControls(task, context)
    if (!userControlsCheck.allowed) {
      blockers.push(...userControlsCheck.blockers)
    }
    reasons.push(...userControlsCheck.reasons)
    metadata.userControls = userControlsCheck.metadata

    if (!userControlsCheck.allowed) {
      return {
        allowed: false,
        reasons,
        blockers,
        riskLevel,
        requiresHitl: false,
        metadata,
      }
    }

    // 1. Budget check
    const budgetCheck = this.checkBudget(actionType)
    if (!budgetCheck.allowed) {
      blockers.push(...budgetCheck.blockers)
    }
    reasons.push(...budgetCheck.reasons)
    metadata.budget = budgetCheck.metadata

    if (!budgetCheck.allowed && !this.allowOverBudget) {
      return {
        allowed: false,
        reasons,
        blockers,
        riskLevel,
        requiresHitl: false,
        metadata,
      }
    }

    // 2. Policy limits check
    const limitsCheck = this.checkLimits(task)
    if (!limitsCheck.allowed) {
      blockers.push(...limitsCheck.blockers)
    }
    reasons.push(...limitsCheck.reasons)
    metadata.limits = limitsCheck.metadata

    // 3. Risk check
    const riskCheck = this.checkRisk(riskLevel)
    if (!riskCheck.allowed) {
      blockers.push(...riskCheck.blockers)
    }
    reasons.push(...riskCheck.reasons)
    metadata.risk = riskCheck.metadata

    // 4. HITL check (if required)
    let requiresHitl = false
    if (this.hitlEnabled && this.requiresHitlApproval(riskLevel, actionType)) {
      requiresHitl = true

      if (context) {
        const hitlResult = await this.checkHitl(context)
        if (!hitlResult.approved) {
          blockers.push("HITL approval required but not granted")
          metadata.hitl = hitlResult
        } else {
          reasons.push("HITL approval granted")
          metadata.hitl = hitlResult
        }
      } else {
        blockers.push("HITL approval required")
        metadata.hitl = { status: "pending", reason: "No execution context provided" }
      }
    }

    const allowed = blockers.length === 0

    this.log.info("policy gate evaluation complete", {
      taskId: task.id,
      allowed,
      reasons,
      blockers,
      riskLevel,
      requiresHitl,
    })

    return {
      allowed,
      reasons,
      blockers,
      riskLevel,
      requiresHitl,
      metadata,
    }
  }

  /**
   * Check user-specific controls (kill switch, quiet hours, override)
   */
  private async checkUserControls(
    task: ProactiveTask,
    context?: ExecutionContext,
  ): Promise<{
    allowed: boolean
    reasons: string[]
    blockers: string[]
    metadata: Record<string, unknown>
  }> {
    const reasons: string[] = []
    const blockers: string[] = []
    const metadata: Record<string, unknown> = {}

    // Extract tenant from task
    const tenantId = task.tenantId

    // UserId would come from context in a real implementation
    // For now, we'll check at tenant level only
    if (!tenantId) {
      reasons.push("No tenant context available, skipping user controls")
      metadata.status = "no_tenant_context"
      return { allowed: true, reasons, blockers, metadata }
    }

    // In a full implementation, userId would come from context or task metadata
    // For tenant-level checks, we use a wildcard userId "*" to check tenant-wide settings
    // Note: ExecutionContext doesn't have userId, so we default to "*" for tenant-level checks
    const userId = "*"

    try {
      // For tenant-level checks, use userId="*" which returns default controls
      // In production, this would be replaced with actual per-user checks
      const controls = await getUserControls({ tenantId, userId })
      metadata.userId = userId
      metadata.overrideLevel = controls.overrideLevel

      // Check kill switch
      if (controls.killSwitch) {
        blockers.push("Kill switch is enabled for this user")
        metadata.killSwitchEnabled = true
        return { allowed: false, reasons, blockers, metadata }
      }

      // Check quiet hours (only if not using wildcard userId)
      if (userId !== "*" && isQuietHours(controls)) {
        blockers.push("Current time is within user's quiet hours")
        metadata.quietHoursActive = true
        return { allowed: false, reasons, blockers, metadata }
      }

      // Check override level (only if not using wildcard userId)
      if (userId !== "*") {
        switch (controls.overrideLevel) {
          case "none":
            reasons.push("User override: none (normal operation)")
            break
          case "suggest":
            reasons.push("User override: suggest mode (suggestions only)")
            metadata.mode = "suggest"
            break
          case "act":
            reasons.push("User override: act mode (all actions allowed)")
            break
        }
      }

      metadata.userControlsChecked = true
      return { allowed: true, reasons, blockers, metadata }
    } catch (err) {
      // If we can't get user controls, allow the action but log
      reasons.push("Could not retrieve user controls, allowing action")
      metadata.status = "error_fetching_controls"
      metadata.error = err instanceof Error ? err.message : String(err)
      return { allowed: true, reasons, blockers, metadata }
    }
  }

  /**
   * Check budget availability
   */
  private checkBudget(actionType: keyof typeof this.riskWeights): {
    allowed: boolean
    reasons: string[]
    blockers: string[]
    metadata: Record<string, unknown>
  } {
    const reasons: string[] = []
    const blockers: string[] = []
    const metadata: Record<string, unknown> = {}

    if (!this.budgetManager) {
      reasons.push("No budget manager configured")
      metadata.status = "no_budget_manager"
      return { allowed: true, reasons, blockers, metadata }
    }

    const stats = this.budgetManager.getStats()
    metadata.stats = stats

    // Map action type to proaction type for budget check
    const proactionMap: Record<string, "suggest" | "notify" | "act_low_risk"> = {
      suggest: "suggest",
      notify: "notify",
      act_low_risk: "act_low_risk",
    }

    const proactionType = proactionMap[actionType] ?? "suggest"
    const limit = stats.limits[proactionType] ?? 0
    const used = stats.byType[proactionType] ?? 0
    const remaining = limit - used

    metadata.proactionType = proactionType
    metadata.limit = limit
    metadata.used = used
    metadata.remaining = remaining

    if (remaining <= 0) {
      blockers.push(`Budget exhausted for ${proactionType}`)
      return { allowed: false, reasons, blockers, metadata }
    }

    if (!this.budgetManager.checkLimit(proactionType)) {
      blockers.push(`Budget limit reached for ${proactionType}`)
      return { allowed: false, reasons, blockers, metadata }
    }

    reasons.push(`Budget available: ${remaining}/${limit} for ${proactionType}`)
    return { allowed: true, reasons, blockers, metadata }
  }

  /**
   * Check against proactivity limits
   */
  private checkLimits(task: ProactiveTask): {
    allowed: boolean
    reasons: string[]
    blockers: string[]
    metadata: Record<string, unknown>
  } {
    const reasons: string[] = []
    const blockers: string[] = []
    const metadata: Record<string, unknown> = {}

    if (!this.limitsManager) {
      reasons.push("No limits manager configured")
      metadata.status = "no_limits_manager"
      return { allowed: true, reasons, blockers, metadata }
    }

    const limits = this.limitsManager.getLimits()
    metadata.limits = limits

    // Check confirmation mode
    const confirmationMode = limits.confirmationMode
    metadata.confirmationMode = confirmationMode

    if (confirmationMode === "explicit_approval") {
      blockers.push("Explicit approval mode enabled - all actions require approval")
      return { allowed: false, reasons, blockers, metadata }
    }

    if (confirmationMode === "suggest_then_act") {
      reasons.push("Suggest-then-act mode allows actions")
    }

    // Check if trigger is allowed
    try {
      const triggerConfig = JSON.parse(task.triggerConfig)
      if (!limits.allowedTriggers.includes(triggerConfig.signal)) {
        blockers.push(`Trigger ${triggerConfig.signal} not in allowed list`)
        return { allowed: false, reasons, blockers, metadata }
      }
    } catch {
      blockers.push("Failed to parse trigger config")
      return { allowed: false, reasons, blockers, metadata }
    }

    reasons.push("Policy limits passed")
    return { allowed: true, reasons, blockers, metadata }
  }

  /**
   * Check risk level
   */
  private checkRisk(riskLevel: RiskLevel): {
    allowed: boolean
    reasons: string[]
    blockers: string[]
    metadata: Record<string, unknown>
  } {
    const reasons: string[] = []
    const blockers: string[] = []
    const metadata: Record<string, unknown> = {}

    const riskOrder: RiskLevel[] = ["low", "medium", "high", "critical"]
    const thresholdIndex = riskOrder.indexOf(this.riskThreshold)
    const taskRiskIndex = riskOrder.indexOf(riskLevel)

    metadata.threshold = this.riskThreshold
    metadata.taskRisk = riskLevel
    metadata.thresholdIndex = thresholdIndex
    metadata.taskRiskIndex = taskRiskIndex

    if (taskRiskIndex > thresholdIndex) {
      blockers.push(`Risk level ${riskLevel} exceeds threshold ${this.riskThreshold}`)
      return { allowed: false, reasons, blockers, metadata }
    }

    reasons.push(`Risk level ${riskLevel} is within threshold ${this.riskThreshold}`)
    return { allowed: true, reasons, blockers, metadata }
  }

  /**
   * Determine if HITL is required
   */
  private requiresHitlApproval(riskLevel: RiskLevel, actionType: string): boolean {
    // Critical actions always require HITL
    if (riskLevel === "critical") return true

    // High-risk actions require HITL if enabled
    if (riskLevel === "high" && this.hitlEnabled) return true

    // Act_low_risk actions might require HITL based on configuration
    if (actionType === "act_low_risk" && this.hitlEnabled) {
      // Could add more sophisticated logic here
      return true
    }

    return false
  }

  /**
   * Check HITL approval status
   */
  private async checkHitl(context: ExecutionContext): Promise<{
    approved: boolean
    status: HitlStatus
    reason?: string
  }> {
    const checkpointId = `${context.task.id}-${context.runId}`
    const checkpoint = this.hitlCheckpoints.get(checkpointId)

    if (!checkpoint) {
      // No checkpoint exists - in a real system, would create one and wait
      return {
        approved: false,
        status: "pending",
        reason: "No HITL checkpoint found",
      }
    }

    if (checkpoint.status === "approved") {
      return { approved: true, status: checkpoint.status }
    }

    if (checkpoint.status === "denied") {
      return { approved: false, status: checkpoint.status, reason: checkpoint.reason }
    }

    if (checkpoint.status === "expired" || Date.now() > checkpoint.expiresAt) {
      return { approved: false, status: "expired", reason: "HITL request expired" }
    }

    return { approved: false, status: checkpoint.status, reason: "Awaiting approval" }
  }

  /**
   * Create a HITL checkpoint (called by HITL system)
   */
  createHitlCheckpoint(
    taskId: string,
    runId: string,
    options?: {
      requester?: string
      reason?: string
      ttlMs?: number
    },
  ): HitlCheckpoint {
    const checkpoint: HitlCheckpoint = {
      taskId,
      runId,
      status: "pending",
      requestedAt: Date.now(),
      expiresAt: Date.now() + (options?.ttlMs ?? 3600000), // Default 1 hour
      requester: options?.requester,
      reason: options?.reason,
    }

    const checkpointId = `${taskId}-${runId}`
    this.hitlCheckpoints.set(checkpointId, checkpoint)

    this.log.info("HITL checkpoint created", {
      taskId,
      runId,
      expiresAt: checkpoint.expiresAt,
    })

    return checkpoint
  }

  /**
   * Approve a HITL request
   */
  approveHitl(taskId: string, runId: string, approver?: string): boolean {
    const checkpointId = `${taskId}-${runId}`
    const checkpoint = this.hitlCheckpoints.get(checkpointId)

    if (!checkpoint) {
      this.log.warn("HITL checkpoint not found for approval", { taskId, runId })
      return false
    }

    checkpoint.status = "approved"
    checkpoint.approvedAt = Date.now()

    this.log.info("HITL request approved", { taskId, runId, approver })
    return true
  }

  /**
   * Deny a HITL request
   */
  denyHitl(taskId: string, runId: string, reason?: string): boolean {
    const checkpointId = `${taskId}-${runId}`
    const checkpoint = this.hitlCheckpoints.get(checkpointId)

    if (!checkpoint) {
      this.log.warn("HITL checkpoint not found for denial", { taskId, runId })
      return false
    }

    checkpoint.status = "denied"
    checkpoint.deniedAt = Date.now()
    checkpoint.reason = reason

    this.log.info("HITL request denied", { taskId, runId, reason })
    return true
  }

  /**
   * Assess risk level from trigger config
   */
  private assessRiskLevel(triggerConfig: Record<string, unknown>): RiskLevel {
    // Custom risk assessment logic
    // In production, would be more sophisticated

    const signal = triggerConfig["signal"] as string

    switch (signal) {
      case "anomaly":
        return "high"
      case "threshold":
        return "medium"
      case "schedule":
        return "low"
      case "reminder":
        return "low"
      default:
        return "medium"
    }
  }

  /**
   * Get budget stats from configured budget manager
   */
  getBudgetStats(): BudgetStats | null {
    return this.budgetManager?.getStats() ?? null
  }

  /**
   * Get limits config from configured limits manager
   */
  getLimitsConfig(): ProactivityLimitsConfig | null {
    return this.limitsManager?.getLimits() ?? null
  }
}

// =============================================================================
// Factory functions
// =============================================================================

export const ProactivePolicyGate$ = {
  create: fn(PolicyGateConfigSchema, (config) => new ProactivePolicyGate(config)),

  /**
   * Create a policy gate with all default checks
   */
  createDefault: fn(
    z.object({
      dailyBudget: z.number().int().positive().optional(),
      hitlEnabled: z.boolean().optional(),
    }),
    (config) => {
      const budgetManager = config.dailyBudget ? new BudgetManager(config.dailyBudget) : null

      const limitsManager = new ProactivityLimitsManager()

      return new ProactivePolicyGate({
        budgetManager: budgetManager ?? undefined,
        limitsManager,
        hitlEnabled: config.hitlEnabled ?? false,
      })
    },
  ),
}

// =============================================================================
// Helper functions
// =============================================================================

export namespace PolicyGateHelpers {
  /**
   * Get risk level as numeric score for comparisons
   */
  export function riskLevelToScore(level: RiskLevel): number {
    const scores: Record<RiskLevel, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    }
    return scores[level]
  }

  /**
   * Check if a risk level exceeds a threshold
   */
  export function riskExceedsThreshold(risk: RiskLevel, threshold: RiskLevel): boolean {
    return riskLevelToScore(risk) > riskLevelToScore(threshold)
  }

  /**
   * Format gate decision for logging/display
   */
  export function formatDecision(decision: GateDecision): string {
    const lines = [
      `Decision: ${decision.allowed ? "ALLOWED" : "BLOCKED"}`,
      `Risk Level: ${decision.riskLevel}`,
      decision.requiresHitl ? "Requires HITL: YES" : "Requires HITL: NO",
    ]

    if (decision.reasons.length > 0) {
      lines.push("Reasons:")
      decision.reasons.forEach((r) => lines.push(`  - ${r}`))
    }

    if (decision.blockers.length > 0) {
      lines.push("Blockers:")
      decision.blockers.forEach((b) => lines.push(`  - ${b}`))
    }

    return lines.join("\n")
  }
}
