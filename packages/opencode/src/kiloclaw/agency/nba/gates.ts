import z from "zod"

export const NbaRolloutTargetSchema = z.object({
  slateCoverageMin: z.number().finite(),
  signalPrecisionAt5pctEdgeMin: z.number().finite(),
  staleDataBlockRateEq: z.number().finite(),
  policyViolationEscapeRateEq: z.number().finite(),
  toolSchemaTokensDeltaPctMax: z.number().finite(),
  p95LatencySecondsMax: z.number().finite(),
  availability7dMin: z.number().finite(),
})

export const NBA_ROLLOUT_TARGETS = NbaRolloutTargetSchema.parse({
  slateCoverageMin: 0.95,
  signalPrecisionAt5pctEdgeMin: 0.55,
  staleDataBlockRateEq: 1,
  policyViolationEscapeRateEq: 0,
  toolSchemaTokensDeltaPctMax: -0.35,
  p95LatencySecondsMax: 7,
  availability7dMin: 0.995,
})

export const NbaGateInputSchema = z.object({
  slateCoverage: z.number().finite(),
  signalPrecisionAt5pctEdge: z.number().finite(),
  staleDataBlockRate: z.number().finite(),
  policyViolationEscapeRate: z.number().finite(),
  toolSchemaTokensDeltaPct: z.number().finite(),
  p95LatencySeconds: z.number().finite(),
  availability7d: z.number().finite(),
  latencyBreachOver30m: z.boolean(),
})

const RollbackTriggerSchema = z.enum(["policy_violation_escape", "stale_data_bypass", "sustained_latency_breach"])

const NbaMetricResultSchema = z.object({
  pass: z.boolean(),
  target: z.string().min(1),
  observed: z.number().finite(),
  reason: z.string().min(1),
})

const NbaPerMetricSchema = z.object({
  slateCoverage: NbaMetricResultSchema,
  signalPrecisionAt5pctEdge: NbaMetricResultSchema,
  staleDataBlockRate: NbaMetricResultSchema,
  policyViolationEscapeRate: NbaMetricResultSchema,
  toolSchemaTokensDeltaPct: NbaMetricResultSchema,
  p95LatencySeconds: NbaMetricResultSchema,
  availability7d: NbaMetricResultSchema,
})

export const NbaGateReportSchema = z.object({
  overall: z.enum(["pass", "fail"]),
  recommendation: z.enum(["go", "canary_only", "no_go"]),
  rollbackTriggers: z.array(RollbackTriggerSchema),
  perMetric: NbaPerMetricSchema,
})

function result(observed: number, pass: boolean, target: string, reason: string) {
  return NbaMetricResultSchema.parse({
    pass,
    target,
    observed,
    reason,
  })
}

export function evaluateNbaRolloutGate(input: z.input<typeof NbaGateInputSchema>) {
  const parsed = NbaGateInputSchema.parse(input)

  const perMetric = {
    slateCoverage: result(
      parsed.slateCoverage,
      parsed.slateCoverage >= NBA_ROLLOUT_TARGETS.slateCoverageMin,
      ">= 0.95",
      parsed.slateCoverage >= NBA_ROLLOUT_TARGETS.slateCoverageMin ? "coverage meets target" : "coverage below target",
    ),
    signalPrecisionAt5pctEdge: result(
      parsed.signalPrecisionAt5pctEdge,
      parsed.signalPrecisionAt5pctEdge >= NBA_ROLLOUT_TARGETS.signalPrecisionAt5pctEdgeMin,
      ">= 0.55",
      parsed.signalPrecisionAt5pctEdge >= NBA_ROLLOUT_TARGETS.signalPrecisionAt5pctEdgeMin
        ? "precision meets target"
        : "precision below target",
    ),
    staleDataBlockRate: result(
      parsed.staleDataBlockRate,
      parsed.staleDataBlockRate === NBA_ROLLOUT_TARGETS.staleDataBlockRateEq,
      "== 1",
      parsed.staleDataBlockRate === NBA_ROLLOUT_TARGETS.staleDataBlockRateEq
        ? "stale data blocking is complete"
        : "stale data blocking is incomplete",
    ),
    policyViolationEscapeRate: result(
      parsed.policyViolationEscapeRate,
      parsed.policyViolationEscapeRate === NBA_ROLLOUT_TARGETS.policyViolationEscapeRateEq,
      "== 0",
      parsed.policyViolationEscapeRate === NBA_ROLLOUT_TARGETS.policyViolationEscapeRateEq
        ? "no policy violations escaped"
        : "policy violations escaped",
    ),
    toolSchemaTokensDeltaPct: result(
      parsed.toolSchemaTokensDeltaPct,
      parsed.toolSchemaTokensDeltaPct <= NBA_ROLLOUT_TARGETS.toolSchemaTokensDeltaPctMax,
      "<= -0.35",
      parsed.toolSchemaTokensDeltaPct <= NBA_ROLLOUT_TARGETS.toolSchemaTokensDeltaPctMax
        ? "token delta meets reduction target"
        : "token delta reduction below target",
    ),
    p95LatencySeconds: result(
      parsed.p95LatencySeconds,
      parsed.p95LatencySeconds <= NBA_ROLLOUT_TARGETS.p95LatencySecondsMax,
      "<= 7",
      parsed.p95LatencySeconds <= NBA_ROLLOUT_TARGETS.p95LatencySecondsMax
        ? "latency meets target"
        : "latency above target",
    ),
    availability7d: result(
      parsed.availability7d,
      parsed.availability7d >= NBA_ROLLOUT_TARGETS.availability7dMin,
      ">= 0.995",
      parsed.availability7d >= NBA_ROLLOUT_TARGETS.availability7dMin
        ? "availability meets target"
        : "availability below target",
    ),
  }

  const rollbackTriggers = [
    ...(parsed.policyViolationEscapeRate > 0 ? (["policy_violation_escape"] as const) : []),
    ...(parsed.staleDataBlockRate < 1 ? (["stale_data_bypass"] as const) : []),
    ...(parsed.latencyBreachOver30m ? (["sustained_latency_breach"] as const) : []),
  ]

  const allPass = Object.values(perMetric).every((item) => item.pass)
  const criticalSafetyMiss = !perMetric.staleDataBlockRate.pass || !perMetric.policyViolationEscapeRate.pass
  const hasRollbackTrigger = rollbackTriggers.length > 0

  const recommendation = (() => {
    if (hasRollbackTrigger || criticalSafetyMiss) return "no_go" as const
    if (allPass) return "go" as const
    return "canary_only" as const
  })()

  const overall = allPass && !hasRollbackTrigger ? "pass" : "fail"

  return NbaGateReportSchema.parse({
    overall,
    recommendation,
    rollbackTriggers,
    perMetric,
  })
}
