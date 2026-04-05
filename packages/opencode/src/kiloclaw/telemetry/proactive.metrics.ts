/**
 * Proactive Telemetry - Metrics for Scheduler and Task Execution
 * Phase 5: Eval/Observability/Operations
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 *
 * Provides metrics computed from proactive_task_runs table:
 * - executionSuccessRate: tasks executed successfully
 * - retryRate: retry count / total runs
 * - dlqRate: DLQ entries / total runs
 * - budgetUtilization: budget consumed / total budget
 * - suggestionAcceptanceRate: suggest-then-act acceptance
 */

import { z } from "zod"
import { Log } from "@/util/log"
import type { ProactiveTaskRun } from "../proactive/scheduler.store"

const log = Log.create({ service: "kilocclaw.telemetry.proactive" })

// =============================================================================
// Run Outcome Types (aligned with scheduler.store.ts)
// =============================================================================

export const RunOutcome = z.enum(["success", "failed", "blocked", "budget_exceeded", "policy_denied"])
export type RunOutcome = z.infer<typeof RunOutcome>

// =============================================================================
// Metric Schemas
// =============================================================================

export const ExecutionSuccessRateSchema = z.object({
  total: z.number().int().nonnegative(),
  successful: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
})
export type ExecutionSuccessRate = z.infer<typeof ExecutionSuccessRateSchema>

export const RetryRateSchema = z.object({
  totalRuns: z.number().int().nonnegative(),
  totalRetries: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
})
export type RetryRate = z.infer<typeof RetryRateSchema>

export const DlqRateSchema = z.object({
  totalRuns: z.number().int().nonnegative(),
  dlqEntries: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
})
export type DlqRate = z.infer<typeof DlqRateSchema>

export const BudgetUtilizationSchema = z.object({
  consumed: z.number().nonnegative(),
  total: z.number().positive(),
  rate: z.number().min(0).max(1),
})
export type BudgetUtilization = z.infer<typeof BudgetUtilizationSchema>

export const SuggestionAcceptanceRateSchema = z.object({
  total: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
})
export type SuggestionAcceptanceRate = z.infer<typeof SuggestionAcceptanceRateSchema>

// =============================================================================
// ProactiveMetrics Namespace
// =============================================================================

export namespace ProactiveMetrics {
  /**
   * Calculate execution success rate from task runs
   */
  export function calculateExecutionSuccessRate(runs: ProactiveTaskRun[]): ExecutionSuccessRate {
    const successful = runs.filter((r) => r.outcome === "success").length
    const failed = runs.filter((r) => r.outcome === "failed").length
    const total = runs.length
    const rate = total > 0 ? successful / total : 0

    return {
      total,
      successful,
      failed,
      rate,
    }
  }

  /**
   * Calculate retry rate from task runs
   * Retry rate = runs with retries / total runs
   */
  export function calculateRetryRate(runs: ProactiveTaskRun[], retryCounts: Map<string, number>): RetryRate {
    const totalRuns = runs.length
    let totalRetries = 0

    for (const run of runs) {
      totalRetries += retryCounts.get(run.taskId) ?? 0
    }

    const rate = totalRuns > 0 ? totalRetries / totalRuns : 0

    return {
      totalRuns,
      totalRetries,
      rate,
    }
  }

  /**
   * Calculate DLQ rate from task runs
   * DLQ rate = tasks in DLQ / total runs
   */
  export function calculateDlqRate(runs: ProactiveTaskRun[], dlqEntries: number): DlqRate {
    const totalRuns = runs.length
    const rate = totalRuns > 0 ? dlqEntries / totalRuns : 0

    return {
      totalRuns,
      dlqEntries,
      rate,
    }
  }

  /**
   * Calculate budget utilization
   */
  export function calculateBudgetUtilization(consumed: number, total: number): BudgetUtilization {
    const rate = total > 0 ? consumed / total : 0

    return {
      consumed,
      total,
      rate: Math.min(rate, 1),
    }
  }

  /**
   * Calculate suggestion acceptance rate
   * Requires gate decisions tracking suggest-then-act outcomes
   */
  export function calculateSuggestionAcceptanceRate(
    runs: ProactiveTaskRun[],
    suggestionGateDecisions: Map<string, { accepted?: boolean }>,
  ): SuggestionAcceptanceRate {
    let accepted = 0
    let rejected = 0

    for (const run of runs) {
      const decision = suggestionGateDecisions.get(run.id)
      if (decision?.accepted === true) {
        accepted++
      } else if (decision?.accepted === false) {
        rejected++
      }
    }

    const total = accepted + rejected
    const rate = total > 0 ? accepted / total : 0

    return {
      total,
      accepted,
      rejected,
      rate,
    }
  }

  /**
   * Get all proactive metrics from runs and state
   */
  export function getMetrics(input: {
    runs: ProactiveTaskRun[]
    retryCounts: Map<string, number>
    dlqEntries: number
    budgetConsumed: number
    budgetTotal: number
    suggestionGateDecisions: Map<string, { accepted?: boolean }>
  }): {
    executionSuccessRate: ExecutionSuccessRate
    retryRate: RetryRate
    dlqRate: DlqRate
    budgetUtilization: BudgetUtilization
    suggestionAcceptanceRate: SuggestionAcceptanceRate
  } {
    return {
      executionSuccessRate: calculateExecutionSuccessRate(input.runs),
      retryRate: calculateRetryRate(input.runs, input.retryCounts),
      dlqRate: calculateDlqRate(input.runs, input.dlqEntries),
      budgetUtilization: calculateBudgetUtilization(input.budgetConsumed, input.budgetTotal),
      suggestionAcceptanceRate: calculateSuggestionAcceptanceRate(input.runs, input.suggestionGateDecisions),
    }
  }

  /**
   * Extract retry counts from runs
   */
  export function extractRetryCounts(runs: ProactiveTaskRun[]): Map<string, number> {
    const counts = new Map<string, number>()

    for (const run of runs) {
      const current = counts.get(run.taskId) ?? 0
      // Count failed runs as potential retries
      if (run.outcome === "failed") {
        counts.set(run.taskId, current + 1)
      }
    }

    return counts
  }

  /**
   * Count DLQ entries from gate decisions
   */
  export function countDlqFromGateDecisions(runs: ProactiveTaskRun[]): number {
    return runs.filter((r) => r.gateDecisions?.["dlq"] === true).length
  }
}

// =============================================================================
// Exports
// =============================================================================

export const calculateExecutionSuccessRate = ProactiveMetrics.calculateExecutionSuccessRate
export const calculateRetryRate = ProactiveMetrics.calculateRetryRate
export const calculateDlqRate = ProactiveMetrics.calculateDlqRate
export const calculateBudgetUtilization = ProactiveMetrics.calculateBudgetUtilization
export const calculateSuggestionAcceptanceRate = ProactiveMetrics.calculateSuggestionAcceptanceRate
export const getProactiveMetrics = ProactiveMetrics.getMetrics
export const extractRetryCounts = ProactiveMetrics.extractRetryCounts
