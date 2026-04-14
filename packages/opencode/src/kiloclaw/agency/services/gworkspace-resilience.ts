// Google Workspace Error Recovery & Resilience
// Error classification, circuit breaker, and recovery strategies

import { CircuitBreaker } from "@/kiloclaw/lmstudio/circuit-breaker"
import { GoogleAPIError } from "../adapters/gworkspace-adapter"
import { Log } from "@/util/log"

// ============================================================================
// Error Classification
// ============================================================================

export type ErrorCategory = "transient" | "auth" | "quota" | "permanent" | "network"

/**
 * Classify a Google Workspace API error into a recovery category
 */
export function classifyGWorkspaceError(error: unknown): ErrorCategory {
  if (error instanceof GoogleAPIError) {
    // Authentication errors - need re-auth
    if (error.status === 401) return "auth"

    // Rate limiting and quota exhaustion
    if (error.status === 403) return "quota" // often quota exhaustion
    if (error.status === 429) return "quota" // explicit rate limit

    // Transient server errors - safe to retry
    if (error.status >= 500 && error.status < 600) return "transient"

    // Other 4xx errors are permanent
    return "permanent"
  }

  // Network and timeout errors - transient
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    if (
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("aborterror") ||
      msg.includes("timeout") ||
      msg.includes("network")
    ) {
      return "network"
    }
  }

  // Unknown error - treat as permanent
  return "permanent"
}

// ============================================================================
// Circuit Breaker Integration
// ============================================================================

export namespace GWorkspaceCircuitBreaker {
  const log = Log.create({ service: "gworkspace.resilience" })

  /**
   * Execute a Google Workspace operation with circuit breaker protection
   * Prevents thundering herd on sustained service degradation
   */
  export async function execute<T>(service: string, fn: () => Promise<T>): Promise<T> {
    const circuitName = `gworkspace.${service}`

    try {
      return await CircuitBreaker.execute(circuitName, fn, {
        failureThreshold: 5, // Open after 5 consecutive failures
        cooldownMs: 30_000, // Try again after 30 seconds
        successThreshold: 2, // Need 2 successes to fully close
      })
    } catch (error) {
      if (error instanceof Error && error.name === "CircuitOpenError") {
        log.warn("circuit open", { service, circuitName })
      }
      throw error
    }
  }

  /**
   * Check circuit state (for monitoring/debugging)
   */
  export function getState(service: string): "closed" | "open" | "half-open" {
    const circuitName = `gworkspace.${service}`
    // This would require exposing state from CircuitBreaker
    // For now, just document the API
    return "closed"
  }
}

// ============================================================================
// Error Context Builder
// ============================================================================

export interface ErrorContext {
  category: ErrorCategory
  retryable: boolean
  requiresReauth: boolean
  quotaExhausted: boolean
  message: string
}

/**
 * Build structured error context for logging and decision-making
 */
export function buildErrorContext(error: unknown): ErrorContext {
  const category = classifyGWorkspaceError(error)
  const message = error instanceof Error ? error.message : String(error)

  return {
    category,
    retryable: category === "transient" || category === "network",
    requiresReauth: category === "auth",
    quotaExhausted: category === "quota",
    message,
  }
}
