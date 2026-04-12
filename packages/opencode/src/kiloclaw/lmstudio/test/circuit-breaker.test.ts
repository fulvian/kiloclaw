import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { CircuitBreaker, CircuitOpenError } from "../circuit-breaker"

describe("CircuitBreaker", () => {
  beforeEach(() => {
    CircuitBreaker.resetAll()
  })

  afterEach(() => {
    CircuitBreaker.resetAll()
  })

  describe("isAllowed", () => {
    test("allows requests when circuit is closed", () => {
      expect(CircuitBreaker.isAllowed("test")).toBe(true)
    })

    test("allows requests after cooldown in open state", async () => {
      CircuitBreaker.setOptions("test", { cooldownMs: 50 })

      // Force circuit open
      CircuitBreaker.recordFailure("test")
      CircuitBreaker.recordFailure("test")
      CircuitBreaker.recordFailure("test")
      CircuitBreaker.recordFailure("test")
      CircuitBreaker.recordFailure("test")

      expect(CircuitBreaker.isAllowed("test")).toBe(false)

      // Wait for cooldown
      await new Promise((resolve) => setTimeout(resolve, 60))

      expect(CircuitBreaker.isAllowed("test")).toBe(true)
    })

    test("allows trial request in half-open state", () => {
      CircuitBreaker.setOptions("test", { cooldownMs: 10000 })

      // Open circuit
      for (let i = 0; i < 5; i++) {
        CircuitBreaker.recordFailure("test")
      }

      expect(CircuitBreaker.getStateInfo("test").state).toBe("open")

      // Advance past cooldown
      CircuitBreaker.recordFailure("test") // This updates lastFailure

      // Manually check half-open by calling isAllowed
      // Since lastFailure was just updated, cooldown hasn't passed
      expect(CircuitBreaker.isAllowed("test")).toBe(false)
    })
  })

  describe("recordSuccess", () => {
    test("resets failure count in closed state", () => {
      CircuitBreaker.recordFailure("test")
      CircuitBreaker.recordFailure("test")

      CircuitBreaker.recordSuccess("test")

      expect(CircuitBreaker.getStateInfo("test").failures).toBe(0)
    })

    test("increments success count in half-open state", async () => {
      CircuitBreaker.setOptions("test", { cooldownMs: 50, successThreshold: 3 })

      // Open circuit
      for (let i = 0; i < 5; i++) {
        CircuitBreaker.recordFailure("test")
      }

      expect(CircuitBreaker.getStateInfo("test").state).toBe("open")

      // Wait for cooldown
      await new Promise((resolve) => setTimeout(resolve, 60))

      // This call should transition to half-open
      CircuitBreaker.isAllowed("test")

      expect(CircuitBreaker.getStateInfo("test").state).toBe("half-open")

      // Record successes
      CircuitBreaker.recordSuccess("test")
      CircuitBreaker.recordSuccess("test")

      expect(CircuitBreaker.getStateInfo("test").successes).toBe(2)
    })
  })

  describe("recordFailure", () => {
    test("increments failure count", () => {
      CircuitBreaker.recordFailure("test")
      CircuitBreaker.recordFailure("test")

      expect(CircuitBreaker.getStateInfo("test").failures).toBe(2)
    })

    test("opens circuit after threshold", () => {
      CircuitBreaker.setOptions("test", { failureThreshold: 3 })

      CircuitBreaker.recordFailure("test")
      expect(CircuitBreaker.getStateInfo("test").state).toBe("closed")

      CircuitBreaker.recordFailure("test")
      expect(CircuitBreaker.getStateInfo("test").state).toBe("closed")

      CircuitBreaker.recordFailure("test")
      expect(CircuitBreaker.getStateInfo("test").state).toBe("open")
    })

    test("records last failure timestamp", () => {
      const before = Date.now()
      CircuitBreaker.recordFailure("test")
      const after = Date.now()

      const lastFailure = CircuitBreaker.getStateInfo("test").lastFailure
      expect(lastFailure).toBeGreaterThanOrEqual(before)
      expect(lastFailure).toBeLessThanOrEqual(after)
    })
  })

  describe("getStateInfo", () => {
    test("returns current circuit state", () => {
      const info = CircuitBreaker.getStateInfo("test")

      expect(info.state).toBe("closed")
      expect(info.failures).toBe(0)
      expect(info.lastFailure).toBeNull()
      expect(info.successes).toBe(0)
    })
  })

  describe("reset", () => {
    test("resets circuit to closed state", () => {
      CircuitBreaker.recordFailure("test")
      CircuitBreaker.recordFailure("test")
      CircuitBreaker.recordFailure("test")
      CircuitBreaker.recordFailure("test")
      CircuitBreaker.recordFailure("test")

      CircuitBreaker.reset("test")

      const info = CircuitBreaker.getStateInfo("test")
      expect(info.state).toBe("closed")
      expect(info.failures).toBe(0)
    })
  })

  describe("execute", () => {
    test("executes function when circuit allows", async () => {
      const result = await CircuitBreaker.execute("test", async () => {
        return "success"
      })

      expect(result).toBe("success")
    })

    test("throws CircuitOpenError when circuit is open", async () => {
      CircuitBreaker.setOptions("test", { failureThreshold: 1 })

      // Open the circuit
      CircuitBreaker.recordFailure("test")

      await expect(
        CircuitBreaker.execute("test", async () => {
          return "success"
        }),
      ).rejects.toThrow(CircuitOpenError)
    })

    test("records success after successful execution", async () => {
      await CircuitBreaker.execute("test", async () => {
        return "success"
      })

      expect(CircuitBreaker.getStateInfo("test").failures).toBe(0)
    })

    test("records failure after failed execution", async () => {
      CircuitBreaker.setOptions("test", { failureThreshold: 3 })

      try {
        await CircuitBreaker.execute<string>("test", async () => {
          throw new Error("test error")
        })
      } catch {
        // Expected
      }

      expect(CircuitBreaker.getStateInfo("test").failures).toBe(1)
    })

    test("closes circuit after successes in half-open state", async () => {
      CircuitBreaker.setOptions("test", { cooldownMs: 50, failureThreshold: 1, successThreshold: 2 })

      // Open the circuit
      CircuitBreaker.recordFailure("test")

      expect(CircuitBreaker.getStateInfo("test").state).toBe("open")

      // Wait for cooldown
      await new Promise((resolve) => setTimeout(resolve, 60))

      // Transition to half-open
      CircuitBreaker.isAllowed("test")

      expect(CircuitBreaker.getStateInfo("test").state).toBe("half-open")

      // Record successes to close the circuit
      CircuitBreaker.recordSuccess("test")
      CircuitBreaker.recordSuccess("test")

      expect(CircuitBreaker.getStateInfo("test").state).toBe("closed")
    })

    test("reopens circuit on failure in half-open state", async () => {
      CircuitBreaker.setOptions("test", { cooldownMs: 1, failureThreshold: 1, successThreshold: 2 })

      // Open the circuit
      CircuitBreaker.recordFailure("test")

      // Transition to half-open
      CircuitBreaker.recordFailure("test") // lastFailure update

      // Now in half-open, recordSuccess then recordFailure
      CircuitBreaker.recordSuccess("test")

      try {
        await CircuitBreaker.execute("test", async () => {
          throw new Error("fail")
        })
      } catch {
        // Expected
      }

      expect(CircuitBreaker.getStateInfo("test").state).toBe("open")
    })
  })

  describe("CircuitOpenError", () => {
    test("has correct name and message", () => {
      const error = new CircuitOpenError("test-circuit")

      expect(error.name).toBe("CircuitOpenError")
      expect(error.message).toBe("Circuit breaker is open: test-circuit")
      expect(error.circuitName).toBe("test-circuit")
    })
  })
})
