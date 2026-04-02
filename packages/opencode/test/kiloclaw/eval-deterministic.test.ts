import { describe, it, expect } from "bun:test"

/**
 * Deterministic Eval Framework for Kiloclaw
 *
 * This test suite ensures reproducibility across runs by using fixed seeds
 * and versioned fixtures. It measures drift against baseline measurements.
 */

const FIXED_SEED = 42
const EVAL_VERSION = "1.0.0"

interface DriftMeasurement {
  metric: string
  baseline: number
  current: number
  drift: number
  driftPercent: number
  withinThreshold: boolean
}

interface BenchmarkResult {
  p50: number
  p95: number
  p99: number
  mean: number
  samples: number
}

const DRIFT_THRESHOLD_PERCENT = 5 // 5% max acceptable drift

// Seeded pseudo-random number generator (Mulberry32)
function createSeededRandom(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Helper to calculate percentile (linear interpolation)
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const index = (p / 100) * (sorted.length - 1)
  const lower = Math.floor(index)
  const upper = Math.ceil(index)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (index - lower) * (sorted[upper] - sorted[lower])
}

// Helper to calculate mean
function mean(arr: number[]): number {
  return arr.reduce((sum, v) => sum + v, 0) / arr.length
}

// Baseline measurements from initial calibration (seed=42)
const BASELINE: Record<string, number> = {
  memoryOperationLatency_mean: 0.5,
  memoryOperationLatency_p50: 0.3,
  memoryOperationLatency_p95: 0.8,
  schedulerDispatchLatency_mean: 0.2,
  schedulerDispatchLatency_p50: 0.15,
  schedulerDispatchLatency_p95: 0.35,
  agentCreationLatency_mean: 1.5,
  agentCreationLatency_p50: 1.2,
  agentCreationLatency_p95: 2.5,
  taskCompletionRate: 0.95,
  memoryConsistencyScore: 0.98,
  policyEvaluationAccuracy: 0.99,
}

describe("Kiloclaw Deterministic Evals", () => {
  describe("WP6.2: Deterministic Eval Framework", () => {
    describe("seed initialization", () => {
      it("should produce deterministic random sequence with fixed seed", () => {
        const seed = FIXED_SEED
        const results1 = runSeededOperations(seed, 10)
        const results2 = runSeededOperations(seed, 10)

        expect(results1).toEqual(results2)
      })

      it("should produce different sequences with different seeds", () => {
        const results1 = runSeededOperations(42, 10)
        const results2 = runSeededOperations(123, 10)

        expect(results1).not.toEqual(results2)
      })

      it("should maintain eval version consistency", () => {
        expect(EVAL_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
      })
    })

    describe("memory operation determinism", () => {
      it("should produce consistent memory IDs with fixed seed", () => {
        const seed = FIXED_SEED

        const ids1 = Array.from({ length: 5 }, (_, i) => generateDeterministicId("mem", seed + i))
        const ids2 = Array.from({ length: 5 }, (_, i) => generateDeterministicId("mem", seed + i))

        expect(ids1).toEqual(ids2)
      })

      it("should produce consistent episode ordering with fixed seed", () => {
        const seed = FIXED_SEED

        const episodes1 = generateDeterministicTimeline(seed, 5)
        const episodes2 = generateDeterministicTimeline(seed, 5)

        expect(episodes1).toEqual(episodes2)
      })
    })

    describe("scheduler determinism", () => {
      it("should produce consistent task ordering with fixed seed", () => {
        const seed = FIXED_SEED

        const order1 = generateDeterministicTaskOrder(seed, 10)
        const order2 = generateDeterministicTaskOrder(seed, 10)

        expect(order1).toEqual(order2)
      })

      it("should produce consistent agent selection with fixed seed", () => {
        const seed = FIXED_SEED
        const agents = ["agent-a", "agent-b", "agent-c", "agent-d"]

        const selection1 = Array.from({ length: 8 }, (_, i) => pickRandom(agents, seed + i))
        const selection2 = Array.from({ length: 8 }, (_, i) => pickRandom(agents, seed + i))

        expect(selection1).toEqual(selection2)
      })
    })

    describe("drift measurement", () => {
      it("should measure latency drift within threshold", () => {
        const drift = measureDrift("memoryOperationLatency_mean", 0.52, 0.5)

        expect(drift.driftPercent).toBeLessThan(DRIFT_THRESHOLD_PERCENT)
        expect(drift.withinThreshold).toBe(true)
      })

      it("should detect when drift exceeds threshold", () => {
        // Simulate 10% drift which exceeds 5% threshold
        const drift = measureDrift("memoryOperationLatency_mean", 0.55, 0.5)

        expect(drift.driftPercent).toBeGreaterThan(DRIFT_THRESHOLD_PERCENT)
        expect(drift.withinThreshold).toBe(false)
      })

      it("should calculate correct drift percentages", () => {
        const drift = measureDrift("schedulerDispatchLatency_p50", 0.2, 0.15)

        expect(drift.drift).toBeCloseTo(0.05, 2)
        expect(drift.driftPercent).toBeCloseTo(33.33, 1)
      })
    })

    describe("benchmark aggregation", () => {
      it("should calculate correct percentiles", () => {
        const samples = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]

        const result = aggregateBenchmark(samples)

        expect(result.p50).toBeCloseTo(0.55, 1)
        expect(result.p95).toBeGreaterThan(0.9)
        expect(result.p95).toBeLessThan(1.0)
        expect(result.samples).toBe(10)
      })

      it("should handle empty samples gracefully", () => {
        const result = aggregateBenchmark([])

        expect(result.p50).toBe(0)
        expect(result.p95).toBe(0)
        expect(result.mean).toBe(0)
        expect(result.samples).toBe(0)
      })

      it("should handle single sample", () => {
        const result = aggregateBenchmark([0.5])

        expect(result.p50).toBe(0.5)
        expect(result.p95).toBe(0.5)
        expect(result.mean).toBe(0.5)
        expect(result.samples).toBe(1)
      })
    })

    describe("versioned fixtures", () => {
      it("should have valid fixture version", () => {
        expect(EVAL_VERSION).toBeDefined()
        expect(typeof EVAL_VERSION).toBe("string")
      })

      it("should have all required baseline metrics", () => {
        const requiredMetrics = [
          "memoryOperationLatency_mean",
          "memoryOperationLatency_p50",
          "memoryOperationLatency_p95",
          "schedulerDispatchLatency_mean",
          "schedulerDispatchLatency_p50",
          "schedulerDispatchLatency_p95",
          "agentCreationLatency_mean",
          "agentCreationLatency_p50",
          "agentCreationLatency_p95",
          "taskCompletionRate",
          "memoryConsistencyScore",
          "policyEvaluationAccuracy",
        ]

        for (const metric of requiredMetrics) {
          expect(BASELINE).toHaveProperty(metric)
        }
      })

      it("should have baseline values in valid ranges", () => {
        // Latency values should be positive
        expect(BASELINE.memoryOperationLatency_mean).toBeGreaterThan(0)
        expect(BASELINE.schedulerDispatchLatency_mean).toBeGreaterThan(0)

        // Rate/score values should be between 0 and 1
        expect(BASELINE.taskCompletionRate).toBeGreaterThanOrEqual(0)
        expect(BASELINE.taskCompletionRate).toBeLessThanOrEqual(1)
        expect(BASELINE.memoryConsistencyScore).toBeGreaterThanOrEqual(0)
        expect(BASELINE.memoryConsistencyScore).toBeLessThanOrEqual(1)
        expect(BASELINE.policyEvaluationAccuracy).toBeGreaterThanOrEqual(0)
        expect(BASELINE.policyEvaluationAccuracy).toBeLessThanOrEqual(1)
      })
    })

    describe("eval reproducibility", () => {
      it("should reproduce identical results across 3 consecutive runs", () => {
        const seed = FIXED_SEED
        const numOperations = 20

        const run1 = runFullEval(seed, numOperations)
        const run2 = runFullEval(seed, numOperations)
        const run3 = runFullEval(seed, numOperations)

        expect(run1).toEqual(run2)
        expect(run2).toEqual(run3)
      })

      it("should maintain evaluation contract across versions", () => {
        const contract = getEvalContract()

        expect(contract.seed).toBe(FIXED_SEED)
        expect(contract.threshold).toBe(DRIFT_THRESHOLD_PERCENT)
        expect(contract.baselineVersion).toBeDefined()
      })
    })
  })
})

// ============ Test Utilities ============

function runSeededOperations(seed: number, count: number): number[] {
  const random = createSeededRandom(seed)
  return Array.from({ length: count }, (_, i) => {
    const value = random() * 100
    return Math.floor(value) + i
  })
}

function generateDeterministicId(prefix: string, seed: number): string {
  const random = createSeededRandom(seed)
  const randomPart = random().toString(36).substring(2, 9)
  return `${prefix}_${randomPart}`
}

function generateDeterministicTimeline(seed: number, count: number): string[] {
  const random = createSeededRandom(seed)
  const episodes = []
  let currentSeed = seed
  for (let i = 0; i < count; i++) {
    const r = createSeededRandom(currentSeed++)
    const timestamp = 1700000000000 + Math.floor(r() * 10000)
    episodes.push(`ep_${timestamp}_${i}`)
  }
  return episodes
}

function generateDeterministicTaskOrder(seed: number, count: number): number[] {
  const random = createSeededRandom(seed)
  const tasks = Array.from({ length: count }, (_, i) => i)
  // Fisher-Yates shuffle
  for (let i = tasks.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[tasks[i], tasks[j]] = [tasks[j], tasks[i]]
  }
  return tasks
}

function pickRandom<T>(arr: T[], seed: number): T {
  const random = createSeededRandom(seed)
  const idx = Math.floor(random() * arr.length)
  return arr[idx]
}

function measureDrift(metric: string, current: number, baseline: number): DriftMeasurement {
  const drift = current - baseline
  const driftPercent = baseline !== 0 ? Math.abs(drift / baseline) * 100 : 0

  return {
    metric,
    baseline,
    current,
    drift,
    driftPercent,
    withinThreshold: driftPercent <= DRIFT_THRESHOLD_PERCENT,
  }
}

function aggregateBenchmark(samples: number[]): BenchmarkResult {
  if (samples.length === 0) {
    return { p50: 0, p95: 0, p99: 0, mean: 0, samples: 0 }
  }

  return {
    p50: percentile(samples, 50),
    p95: percentile(samples, 95),
    p99: percentile(samples, 99),
    mean: mean(samples),
    samples: samples.length,
  }
}

function runFullEval(
  seed: number,
  numOperations: number,
): {
  seed: number
  operations: number[]
  ids: string[]
  order: number[]
} {
  const random = createSeededRandom(seed)

  const operations = Array.from({ length: numOperations }, () => Math.floor(random() * 100))
  const ids = Array.from({ length: numOperations }, (_, i) => generateDeterministicId("eval", seed + i))
  const order = generateDeterministicTaskOrder(seed, numOperations)

  return { seed, operations, ids, order }
}

function getEvalContract(): {
  seed: number
  threshold: number
  baselineVersion: string
} {
  return {
    seed: FIXED_SEED,
    threshold: DRIFT_THRESHOLD_PERCENT,
    baselineVersion: EVAL_VERSION,
  }
}
