import z from "zod"

export const NbaChaosInputSchema = z.object({
  multiProviderOutage: z.boolean(),
  quotaExhausted: z.boolean(),
  staleOdds: z.boolean(),
  missingInjuryFeed: z.boolean(),
  recommendationAllowed: z.boolean(),
  degradedMode: z.boolean(),
  safeMode: z.boolean(),
  confidencePenaltyApplied: z.boolean(),
  noBetFlag: z.boolean(),
})

const NbaChaosViolationSchema = z.enum([
  "stale_odds_recommendation_allowed",
  "unsafe_mode_during_outage_or_quota",
  "missing_injury_feed_without_guardrail",
])

export const NbaChaosReportSchema = z.object({
  pass: z.boolean(),
  violations: z.array(NbaChaosViolationSchema),
})

export function evaluateNbaChaosScenario(input: z.input<typeof NbaChaosInputSchema>) {
  const parsed = NbaChaosInputSchema.parse(input)

  const staleViolation = parsed.staleOdds && parsed.recommendationAllowed
  const modeRequired = parsed.multiProviderOutage || parsed.quotaExhausted
  const modeViolation = modeRequired && !parsed.degradedMode && !parsed.safeMode
  const injuryViolation = parsed.missingInjuryFeed && !parsed.confidencePenaltyApplied && !parsed.noBetFlag

  const violations = [
    ...(staleViolation ? (["stale_odds_recommendation_allowed"] as const) : []),
    ...(modeViolation ? (["unsafe_mode_during_outage_or_quota"] as const) : []),
    ...(injuryViolation ? (["missing_injury_feed_without_guardrail"] as const) : []),
  ]

  return NbaChaosReportSchema.parse({
    pass: violations.length === 0,
    violations,
  })
}
