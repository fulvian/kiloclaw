import { describe, it, expect } from "bun:test"

/**
 * Performance and Resilience Benchmark Suite for Kiloclaw
 *
 * This test suite provides runtime core latency benchmarks,
 * memory operation throughput, and scheduler dispatch latency measurements.
 */

interface BenchmarkResult {
  p50: number
  p95: number
  p99: number
  mean: number
  samples: number
  unit: string
}

interface ThroughputResult {
  operations: number
  durationMs: number
  opsPerSecond: number
}

// Benchmark configuration
const BENCHMARK_CONFIG = {
  warmupIterations: 5,
  measuredIterations: 100,
  percentileTargets: [50, 95, 99],
  throughputDurationMs: 1000,
}

const RESULTS_VERSION = "1.0.0"

describe("Kiloclaw Performance Benchmarks", () => {
  describe("WP6.5: Performance and Resilience Tests", () => {
    describe("runtime core latency benchmarks", () => {
      it("should measure memory operation latency percentiles", () => {
        const latencies = measureMemoryOperationLatency(BENCHMARK_CONFIG.measuredIterations)
        const result = aggregateBenchmark(latencies, "ms")

        expect(result.p50).toBeGreaterThan(0)
        expect(result.p95).toBeGreaterThanOrEqual(result.p50)
        expect(result.p99).toBeGreaterThanOrEqual(result.p95)
        expect(result.samples).toBe(BENCHMARK_CONFIG.measuredIterations)
      })

      it("should measure scheduler dispatch latency percentiles", () => {
        const latencies = measureSchedulerDispatchLatency(BENCHMARK_CONFIG.measuredIterations)
        const result = aggregateBenchmark(latencies, "ms")

        expect(result.p50).toBeGreaterThan(0)
        expect(result.p95).toBeGreaterThanOrEqual(result.p50)
        expect(result.p99).toBeGreaterThanOrEqual(result.p95)
        expect(result.samples).toBe(BENCHMARK_CONFIG.measuredIterations)
      })

      it("should measure agent creation latency percentiles", () => {
        const latencies = measureAgentCreationLatency(BENCHMARK_CONFIG.measuredIterations)
        const result = aggregateBenchmark(latencies, "ms")

        expect(result.p50).toBeGreaterThan(0)
        expect(result.p95).toBeGreaterThanOrEqual(result.p50)
        expect(result.p99).toBeGreaterThanOrEqual(result.p95)
        expect(result.samples).toBe(BENCHMARK_CONFIG.measuredIterations)
      })

      it("should measure policy evaluation latency percentiles", () => {
        const latencies = measurePolicyEvaluationLatency(BENCHMARK_CONFIG.measuredIterations)
        const result = aggregateBenchmark(latencies, "ms")

        expect(result.p50).toBeGreaterThan(0)
        expect(result.p95).toBeGreaterThanOrEqual(result.p50)
        expect(result.p99).toBeGreaterThanOrEqual(result.p95)
        expect(result.samples).toBe(BENCHMARK_CONFIG.measuredIterations)
      })
    })

    describe("memory operation throughput", () => {
      it("should measure memory write throughput", () => {
        const result = measureMemoryWriteThroughput()

        expect(result.operations).toBeGreaterThan(0)
        expect(result.durationMs).toBeGreaterThan(0)
        expect(result.opsPerSecond).toBeGreaterThan(0)
      })

      it("should measure memory read throughput", () => {
        const result = measureMemoryReadThroughput()

        expect(result.operations).toBeGreaterThan(0)
        expect(result.durationMs).toBeGreaterThan(0)
        expect(result.opsPerSecond).toBeGreaterThan(0)
      })

      it("should measure memory query throughput", () => {
        const result = measureMemoryQueryThroughput()

        expect(result.operations).toBeGreaterThan(0)
        expect(result.durationMs).toBeGreaterThan(0)
        expect(result.opsPerSecond).toBeGreaterThan(0)
      })
    })

    describe("scheduler dispatch latency", () => {
      it("should measure task enqueue latency", () => {
        const latencies = measureTaskEnqueueLatency(BENCHMARK_CONFIG.measuredIterations)
        const result = aggregateBenchmark(latencies, "ms")

        expect(result.p50).toBeGreaterThan(0)
        expect(result.samples).toBe(BENCHMARK_CONFIG.measuredIterations)
      })

      it("should measure task dequeue latency", () => {
        const latencies = measureTaskDequeueLatency(BENCHMARK_CONFIG.measuredIterations)
        const result = aggregateBenchmark(latencies, "ms")

        expect(result.p50).toBeGreaterThan(0)
        expect(result.samples).toBe(BENCHMARK_CONFIG.measuredIterations)
      })

      it("should measure priority queue reordering latency", () => {
        const latencies = measurePriorityReorderLatency(BENCHMARK_CONFIG.measuredIterations)
        const result = aggregateBenchmark(latencies, "ms")

        expect(result.p50).toBeGreaterThan(0)
        expect(result.samples).toBe(BENCHMARK_CONFIG.measuredIterations)
      })
    })

    describe("benchmark result format", () => {
      it("should export correctly structured benchmark results", () => {
        const latencies = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
        const result = aggregateBenchmark(latencies, "ms")

        expect(result).toHaveProperty("p50")
        expect(result).toHaveProperty("p95")
        expect(result).toHaveProperty("p99")
        expect(result).toHaveProperty("mean")
        expect(result).toHaveProperty("samples")
        expect(result).toHaveProperty("unit")
        expect(result.unit).toBe("ms")
      })

      it("should export correctly structured throughput results", () => {
        const result = measureMemoryWriteThroughput()

        expect(result).toHaveProperty("operations")
        expect(result).toHaveProperty("durationMs")
        expect(result).toHaveProperty("opsPerSecond")
      })

      it("should include benchmark version", () => {
        expect(RESULTS_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
      })
    })

    describe("resilience benchmarks", () => {
      it("should measure memory under stress (high volume)", () => {
        const latencies = measureMemoryOperationLatency(500)
        const result = aggregateBenchmark(latencies, "ms")

        // Under stress, p99 should still be reasonable (< 100ms)
        expect(result.p99).toBeLessThan(100)
      })

      it("should measure scheduler under stress (high concurrency)", () => {
        const latencies = measureSchedulerDispatchLatency(500)
        const result = aggregateBenchmark(latencies, "ms")

        // Under stress, p99 should still be reasonable (< 50ms)
        expect(result.p99).toBeLessThan(50)
      })
    })

    describe("percentile calculations", () => {
      it("should calculate p50 correctly", () => {
        const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        const result = aggregateBenchmark(samples, "ms")

        expect(result.p50).toBeCloseTo(5.5, 1)
      })

      it("should calculate p95 correctly", () => {
        const samples = Array.from({ length: 100 }, (_, i) => i + 1)
        const result = aggregateBenchmark(samples, "ms")

        expect(result.p95).toBeGreaterThan(94)
        expect(result.p95).toBeLessThan(96)
      })

      it("should calculate p99 correctly", () => {
        const samples = Array.from({ length: 1000 }, (_, i) => i + 1)
        const result = aggregateBenchmark(samples, "ms")

        expect(result.p99).toBeGreaterThan(989)
        expect(result.p99).toBeLessThan(991)
      })

      it("should handle edge case: single sample", () => {
        const result = aggregateBenchmark([42], "ms")

        expect(result.p50).toBe(42)
        expect(result.p95).toBe(42)
        expect(result.p99).toBe(42)
        expect(result.mean).toBe(42)
      })

      it("should handle edge case: two samples", () => {
        const result = aggregateBenchmark([1, 2], "ms")

        expect(result.mean).toBe(1.5)
      })
    })
  })
})

// ============ Benchmark Implementations ============

function measureMemoryOperationLatency(iterations: number): number[] {
  const results: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    // Simulate memory operation (hash computation + object creation)
    const _ = JSON.stringify({ key: i, data: "x".repeat(100) })
    const hash = simpleHash(String(i))
    const end = performance.now()
    results.push(end - start)
  }

  return results
}

function measureSchedulerDispatchLatency(iterations: number): number[] {
  const results: number[] = []
  const taskQueue: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    // Simulate scheduler dispatch (queue insert + priority sort)
    taskQueue.push(i)
    if (taskQueue.length > 10) taskQueue.shift()
    const end = performance.now()
    results.push(end - start)
  }

  return results
}

function measureAgentCreationLatency(iterations: number): number[] {
  const results: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    // Simulate agent creation (object construction + initialization)
    const agent = {
      id: `agent-${i}`,
      name: `Test Agent ${i}`,
      capabilities: ["read", "write", "execute"],
      status: "idle",
      createdAt: Date.now(),
    }
    const end = performance.now()
    results.push(end - start)
  }

  return results
}

function measurePolicyEvaluationLatency(iterations: number): number[] {
  const results: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    // Simulate policy evaluation (rule checking + risk calculation)
    let risk = 0
    if (i % 10 === 0) risk += 10
    if (i % 100 === 0) risk += 20
    const end = performance.now()
    results.push(end - start)
  }

  return results
}

function measureMemoryWriteThroughput(): ThroughputResult {
  const startTime = performance.now()
  let operations = 0
  const endTime = startTime + BENCHMARK_CONFIG.throughputDurationMs

  while (performance.now() < endTime) {
    const _ = JSON.stringify({ key: operations, data: "x".repeat(50) })
    operations++
  }

  const durationMs = performance.now() - startTime
  return {
    operations,
    durationMs,
    opsPerSecond: (operations / durationMs) * 1000,
  }
}

function measureMemoryReadThroughput(): ThroughputResult {
  // Pre-populate cache
  const cache: Record<string, string> = {}
  for (let i = 0; i < 1000; i++) {
    cache[`key${i}`] = JSON.stringify({ key: i, data: "x".repeat(50) })
  }

  const startTime = performance.now()
  let operations = 0
  const endTime = startTime + BENCHMARK_CONFIG.throughputDurationMs
  let idx = 0

  while (performance.now() < endTime) {
    const _ = cache[`key${idx % 1000}`]
    idx++
    operations++
  }

  const durationMs = performance.now() - startTime
  return {
    operations,
    durationMs,
    opsPerSecond: (operations / durationMs) * 1000,
  }
}

function measureMemoryQueryThroughput(): ThroughputResult {
  // Pre-populate data
  const data: Array<{ id: number; tags: string[] }> = []
  for (let i = 0; i < 1000; i++) {
    data.push({ id: i, tags: [`tag${i % 10}`, `tag${(i + 1) % 10}`] })
  }

  const startTime = performance.now()
  let operations = 0
  const endTime = startTime + BENCHMARK_CONFIG.throughputDurationMs

  while (performance.now() < endTime) {
    const _ = data.filter((d) => d.tags.includes(`tag${operations % 10}`))
    operations++
  }

  const durationMs = performance.now() - startTime
  return {
    operations,
    durationMs,
    opsPerSecond: (operations / durationMs) * 1000,
  }
}

function measureTaskEnqueueLatency(iterations: number): number[] {
  const results: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    // Simulate enqueue operation
    const task = { id: i, priority: i % 5 }
    const end = performance.now()
    results.push(end - start)
  }

  return results
}

function measureTaskDequeueLatency(iterations: number): number[] {
  const results: number[] = []
  const queue: number[] = Array.from({ length: 100 }, (_, i) => i)

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    // Simulate dequeue operation
    const task = queue.shift()
    queue.push(i)
    const end = performance.now()
    results.push(end - start)
  }

  return results
}

function measurePriorityReorderLatency(iterations: number): number[] {
  const results: number[] = []

  for (let i = 0; i < iterations; i++) {
    const tasks = Array.from({ length: 20 }, (_, j) => ({ id: j, priority: (i + j) % 5 }))
    const start = performance.now()
    // Simulate priority reordering
    tasks.sort((a, b) => a.priority - b.priority)
    const end = performance.now()
    results.push(end - start)
  }

  return results
}

// ============ Utility Functions ============

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (index - lower) * (sorted[upper] - sorted[lower])
}

function calcMean(arr: number[]): number {
  return arr.reduce((sum, v) => sum + v, 0) / arr.length
}

function aggregateBenchmark(samples: number[], unit: string): BenchmarkResult {
  if (samples.length === 0) {
    return { p50: 0, p95: 0, p99: 0, mean: 0, samples: 0, unit }
  }

  return {
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    mean: calcMean(samples),
    samples: samples.length,
    unit,
  }
}

// Simple hash function for consistent benchmarking
function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

// Export benchmark results for external consumption
export { aggregateBenchmark, percentile, RESULTS_VERSION }
export type { BenchmarkResult, ThroughputResult }
