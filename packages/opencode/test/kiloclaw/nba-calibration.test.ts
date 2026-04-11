import { describe, expect, it } from "bun:test"
import {
  CALIBRATION_ISOTONIC_MIN_SAMPLE,
  buildReliabilityBuckets,
  chooseCalibrationMethod,
  computeBrier,
  computeLogLoss,
  computePrecisionAtEdgeThreshold,
} from "@/kiloclaw/agency/nba/calibration"

describe("nba calibration", () => {
  it("computes brier and log-loss sanity values", () => {
    const points = [
      { predicted: 0.9, actual: 1 },
      { predicted: 0.1, actual: 0 },
      { predicted: 0.8, actual: 1 },
      { predicted: 0.2, actual: 0 },
    ] as const

    expect(computeBrier(points)).toBeCloseTo(0.025, 10)

    const loss = computeLogLoss(points)
    expect(loss).toBeGreaterThan(0)
    expect(loss).toBeLessThan(0.3)
  })

  it("builds reliability buckets with expected shape", () => {
    const buckets = buildReliabilityBuckets(
      [
        { predicted: 0.05, actual: 0 },
        { predicted: 0.15, actual: 0 },
        { predicted: 0.55, actual: 1 },
        { predicted: 0.95, actual: 1 },
      ],
      5,
    )

    expect(buckets.length).toBe(5)
    expect(buckets[0]).toEqual({
      count: 2,
      avgPred: 0.1,
      empiricalRate: 0,
      absGap: 0.1,
    })
    expect(buckets[2]?.count).toBe(1)
    expect(buckets[2]?.avgPred).toBeCloseTo(0.55, 10)
    expect(buckets[2]?.empiricalRate).toBe(1)
    expect(buckets[2]?.absGap).toBeCloseTo(0.45, 10)
    expect(buckets[4]?.count).toBe(1)
    expect(buckets[4]?.avgPred).toBeCloseTo(0.95, 10)
    expect(buckets[4]?.empiricalRate).toBe(1)
    expect(buckets[4]?.absGap).toBeCloseTo(0.05, 10)
  })

  it("selects calibration method based on sample size and ranking preference", () => {
    expect(chooseCalibrationMethod(CALIBRATION_ISOTONIC_MIN_SAMPLE - 1, false)).toBe("sigmoid")
    expect(chooseCalibrationMethod(CALIBRATION_ISOTONIC_MIN_SAMPLE, false)).toBe("isotonic")
    expect(chooseCalibrationMethod(CALIBRATION_ISOTONIC_MIN_SAMPLE + 100, true)).toBe("sigmoid")
  })

  it("computes precision at 5pct edge threshold", () => {
    const rows = [
      { edge: 0.06, win: true },
      { edge: 0.08, win: false },
      { edge: 0.04, win: true },
      { edge: 0.07, win: true },
    ]

    expect(computePrecisionAtEdgeThreshold(rows)).toBeCloseTo(2 / 3, 8)
    expect(computePrecisionAtEdgeThreshold(rows, 0.07)).toBe(0.5)
    expect(computePrecisionAtEdgeThreshold(rows, 0.5)).toBe(0)
  })
})
