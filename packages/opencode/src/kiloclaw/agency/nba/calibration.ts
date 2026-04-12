import z from "zod"

const ProbabilitySchema = z.number().finite().min(0).max(1)

export const CALIBRATION_ISOTONIC_MIN_SAMPLE = 1000

export const CalibrationPointSchema = z.object({
  predicted: ProbabilitySchema,
  actual: z.union([z.literal(0), z.literal(1)]),
})

export const ReliabilityBucketSchema = z.object({
  count: z.number().int().nonnegative(),
  avgPred: ProbabilitySchema,
  empiricalRate: ProbabilitySchema,
  absGap: z.number().finite().nonnegative(),
})

export const EdgeOutcomeSchema = z.object({
  edge: z.number().finite(),
  win: z.boolean(),
})

export type CalibrationPoint = z.infer<typeof CalibrationPointSchema>
export type ReliabilityBucket = z.infer<typeof ReliabilityBucketSchema>
export type EdgeOutcome = z.infer<typeof EdgeOutcomeSchema>

function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function bucketIndex(predicted: number, count: number): number {
  const scaled = Math.floor(predicted * count)
  if (scaled >= count) return count - 1
  return scaled
}

export function computeBrier(points: readonly z.input<typeof CalibrationPointSchema>[]): number {
  const parsed = z.array(CalibrationPointSchema).parse(points)
  if (parsed.length === 0) return 0
  const squared = parsed.map((point) => (point.predicted - point.actual) ** 2)
  return mean(squared)
}

export function computeLogLoss(points: readonly z.input<typeof CalibrationPointSchema>[], epsilon = 1e-15): number {
  const parsed = z.array(CalibrationPointSchema).parse(points)
  const eps = z.number().finite().positive().max(0.5).parse(epsilon)
  if (parsed.length === 0) return 0

  const values = parsed.map((point) => {
    const predicted = Math.min(1 - eps, Math.max(eps, point.predicted))
    return -(point.actual * Math.log(predicted) + (1 - point.actual) * Math.log(1 - predicted))
  })

  return mean(values)
}

export function buildReliabilityBuckets(
  points: readonly z.input<typeof CalibrationPointSchema>[],
  bucketCount = 10,
): ReliabilityBucket[] {
  const parsed = z.array(CalibrationPointSchema).parse(points)
  const count = z.number().int().positive().parse(bucketCount)
  const all = Array.from({ length: count }, () => [] as CalibrationPoint[])

  parsed.forEach((point) => {
    const index = bucketIndex(point.predicted, count)
    all[index]?.push(point)
  })

  const out = all.map((bucket) => {
    const avgPred = mean(bucket.map((point) => point.predicted))
    const empiricalRate = mean(bucket.map((point) => point.actual))
    const absGap = Math.abs(avgPred - empiricalRate)
    return {
      count: bucket.length,
      avgPred,
      empiricalRate,
      absGap,
    }
  })

  return z.array(ReliabilityBucketSchema).parse(out)
}

export function chooseCalibrationMethod(sampleSize: number, preserveRanking = false): "sigmoid" | "isotonic" {
  const parsed = z.number().int().nonnegative().parse(sampleSize)
  if (preserveRanking) return "sigmoid"
  if (parsed < CALIBRATION_ISOTONIC_MIN_SAMPLE) return "sigmoid"
  return "isotonic"
}

export function computePrecisionAtEdgeThreshold(
  rows: readonly z.input<typeof EdgeOutcomeSchema>[],
  threshold = 0.05,
): number {
  const parsed = z.array(EdgeOutcomeSchema).parse(rows)
  const minEdge = z.number().finite().parse(threshold)
  const selected = parsed.filter((row) => row.edge >= minEdge)
  if (selected.length === 0) return 0
  const wins = selected.filter((row) => row.win).length
  return wins / selected.length
}
