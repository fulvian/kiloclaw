import { Log } from "@/util/log"

const log = Log.create({ service: "lmstudio.circuit-breaker" })

/**
 * Circuit breaker states
 */
export type CircuitState = "closed" | "open" | "half-open"

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit */
  failureThreshold: number
  /** Time in ms before attempting to close circuit */
  cooldownMs: number
  /** Number of successes needed to close circuit from half-open */
  successThreshold: number
}

/**
 * Circuit breaker state per operation/endpoint
 */
interface CircuitBreakerState {
  failures: number
  lastFailure: number
  state: CircuitState
  successes: number
}

/**
 * Default circuit breaker configuration
 */
const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  cooldownMs: 30000,
  successThreshold: 2,
}

const DEFAULT_NAME = "default"

/**
 * Circuit breaker implementation for LM Studio operations.
 *
 * Prevents repeated calls to failing endpoints by opening the circuit
 * after a threshold of failures, allowing trial requests after cooldown,
 * and closing the circuit after consecutive successes.
 */
export namespace CircuitBreaker {
  // Store circuit states per operation name
  const circuits = new Map<string, CircuitBreakerState>()

  /**
   * Get or create state for a circuit
   */
  function getState(name: string): CircuitBreakerState {
    let state = circuits.get(name)
    if (!state) {
      state = {
        failures: 0,
        lastFailure: 0,
        state: "closed",
        successes: 0,
      }
      circuits.set(name, state)
    }
    return state
  }

  /**
   * Check if a circuit allows requests
   */
  export function isAllowed(name: string = DEFAULT_NAME): boolean {
    const state = getState(name)

    if (state.state === "closed") {
      return true
    }

    if (state.state === "open") {
      // Check if cooldown has elapsed
      const elapsed = Date.now() - state.lastFailure
      if (elapsed >= getOptions(name).cooldownMs) {
        log.info("circuit transitioning to half-open", { name, elapsed })
        state.state = "half-open"
        state.successes = 0
        return true
      }
      return false
    }

    // half-open state - allow one trial request
    return true
  }

  /**
   * Record a successful operation
   */
  export function recordSuccess(name: string = DEFAULT_NAME): void {
    const state = getState(name)
    const opts = getOptions(name)

    if (state.state === "half-open") {
      state.successes++
      if (state.successes >= opts.successThreshold) {
        log.info("circuit closing after successes", { name, successes: state.successes })
        state.state = "closed"
        state.failures = 0
        state.successes = 0
      }
    } else if (state.state === "closed") {
      // Reset failure count on success
      state.failures = 0
    }
  }

  /**
   * Record a failed operation
   */
  export function recordFailure(name: string = DEFAULT_NAME): void {
    const state = getState(name)
    const opts = getOptions(name)

    state.failures++
    state.lastFailure = Date.now()

    if (state.state === "half-open") {
      // Any failure in half-open goes back to open
      log.warn("circuit reopened after failure in half-open", { name, failures: state.failures })
      state.state = "open"
      state.successes = 0
    } else if (state.state === "closed" && state.failures >= opts.failureThreshold) {
      log.warn("circuit opened after failure threshold", { name, failures: state.failures })
      state.state = "open"
    }
  }

  /**
   * Get current state of a circuit
   */
  export function getStateInfo(name: string = DEFAULT_NAME): {
    state: CircuitState
    failures: number
    lastFailure: number | null
    successes: number
  } {
    const state = getState(name)
    return {
      state: state.state,
      failures: state.failures,
      lastFailure: state.lastFailure > 0 ? state.lastFailure : null,
      successes: state.successes,
    }
  }

  /**
   * Reset a circuit to closed state
   */
  export function reset(name: string = DEFAULT_NAME): void {
    circuits.delete(name)
    log.info("circuit reset", { name })
  }

  /**
   * Reset all circuits
   */
  export function resetAll(): void {
    circuits.clear()
    log.info("all circuits reset")
  }

  // Per-circuit options storage
  const optionsStore = new Map<string, CircuitBreakerOptions>()

  /**
   * Set options for a circuit
   */
  export function setOptions(name: string = DEFAULT_NAME, opts: Partial<CircuitBreakerOptions>): void {
    const existing = optionsStore.get(name) ?? { ...DEFAULT_OPTIONS }
    optionsStore.set(name, { ...existing, ...opts })
  }

  /**
   * Get options for a circuit
   */
  function getOptions(name: string): CircuitBreakerOptions {
    return optionsStore.get(name) ?? DEFAULT_OPTIONS
  }

  /**
   * Execute a function with circuit breaker protection.
   * Returns result if allowed, throws if circuit is open.
   */
  export async function execute<T>(
    name: string,
    fn: () => Promise<T>,
    options?: Partial<CircuitBreakerOptions>,
  ): Promise<T> {
    if (options) {
      setOptions(name, options)
    }

    if (!isAllowed(name)) {
      throw new CircuitOpenError(name)
    }

    try {
      const result = await fn()
      recordSuccess(name)
      return result
    } catch (err) {
      recordFailure(name)
      throw err
    }
  }
}

/**
 * Error thrown when circuit is open
 */
export class CircuitOpenError extends Error {
  constructor(public readonly circuitName: string) {
    super(`Circuit breaker is open: ${circuitName}`)
    this.name = "CircuitOpenError"
  }
}
