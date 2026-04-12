import { RecommendationPolicySchema } from "./schema"
import z from "zod"

const ModeSchema = z.enum(["normal", "deep"])
const RiskSchema = z.enum(["low", "medium", "high"])
const LatencyClassSchema = z.enum(["fast", "medium", "slow"])

export const NbaToolMetadataSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  capability: z.string().min(1),
  risk: RiskSchema,
  provider: z.string().min(1),
  tokenSize: z.number().int().nonnegative(),
  latencyClass: LatencyClassSchema,
  quotaCost: z.number().finite().nonnegative(),
  relevanceScore: z.number().finite(),
})

export const NbaBudgetingInputSchema = z.object({
  mode: ModeSchema,
  tools: z.array(NbaToolMetadataSchema),
  requestedCapabilities: z.array(z.string().min(1)).min(1),
  policyByCapability: z.record(z.string().min(1), RecommendationPolicySchema),
})

export const NbaBudgetMetricsSchema = z.object({
  selectedCount: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative(),
  estimatedQuotaCost: z.number().finite().nonnegative(),
  droppedReasons: z.record(z.string().min(1), z.number().int().positive()),
})

export const NbaBudgetingResultSchema = z.object({
  selected: z.array(NbaToolMetadataSchema),
  metrics: NbaBudgetMetricsSchema,
})

export type NbaToolMetadata = z.infer<typeof NbaToolMetadataSchema>
export type NbaBudgetingInput = z.infer<typeof NbaBudgetingInputSchema>
export type NbaBudgetingResult = z.infer<typeof NbaBudgetingResultSchema>

const MODE_LIMIT: Record<z.infer<typeof ModeSchema>, number> = {
  normal: 7,
  deep: 12,
}

const RISK_WEIGHT: Record<z.infer<typeof RiskSchema>, number> = {
  low: 1,
  medium: 2,
  high: 3,
}

function bump(reasons: Record<string, number>, key: string, amount = 1): Record<string, number> {
  const next = reasons[key] ? reasons[key] + amount : amount
  return {
    ...reasons,
    [key]: next,
  }
}

function rankTools(tools: NbaToolMetadata[]): NbaToolMetadata[] {
  return [...tools].sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore
    if (a.quotaCost !== b.quotaCost) return a.quotaCost - b.quotaCost
    if (a.id !== b.id) return a.id.localeCompare(b.id)
    return a.provider.localeCompare(b.provider)
  })
}

export namespace NbaBudgeting {
  export function select(input: z.input<typeof NbaBudgetingInputSchema>): NbaBudgetingResult {
    const parsed = NbaBudgetingInputSchema.parse(input)
    const capSet = new Set(parsed.requestedCapabilities)

    const filtered = parsed.tools.reduce(
      (acc, tool) => {
        if (!capSet.has(tool.capability)) {
          return {
            kept: acc.kept,
            reasons: bump(acc.reasons, "irrelevant_capability"),
          }
        }

        const policy = parsed.policyByCapability[tool.capability] ?? "DENY"
        if (policy === "DENY") {
          return {
            kept: acc.kept,
            reasons: bump(acc.reasons, "policy_denied"),
          }
        }

        return {
          kept: [...acc.kept, tool],
          reasons: acc.reasons,
        }
      },
      {
        kept: [] as NbaToolMetadata[],
        reasons: {} as Record<string, number>,
      },
    )

    const ranked = rankTools(filtered.kept)
    const limit = MODE_LIMIT[parsed.mode]
    if (ranked.length <= limit) {
      const estimatedTokens = ranked.reduce((sum, tool) => sum + tool.tokenSize, 0)
      const estimatedQuotaCost = ranked.reduce((sum, tool) => sum + tool.quotaCost, 0)
      return NbaBudgetingResultSchema.parse({
        selected: ranked,
        metrics: {
          selectedCount: ranked.length,
          estimatedTokens,
          estimatedQuotaCost,
          droppedReasons: filtered.reasons,
        },
      })
    }

    const overflow = ranked.length - limit
    const drops = [...ranked]
      .sort((a, b) => {
        const riskDelta = RISK_WEIGHT[b.risk] - RISK_WEIGHT[a.risk]
        if (riskDelta !== 0) return riskDelta
        if (a.relevanceScore !== b.relevanceScore) return a.relevanceScore - b.relevanceScore
        if (b.quotaCost !== a.quotaCost) return b.quotaCost - a.quotaCost
        if (a.id !== b.id) return a.id.localeCompare(b.id)
        return a.provider.localeCompare(b.provider)
      })
      .slice(0, overflow)

    const dropSet = new Set(drops)
    const selected = ranked.filter((tool) => !dropSet.has(tool))

    const reasonAfterBudget = drops.reduce((acc, tool) => {
      if (tool.risk === "high") return bump(acc, "budget_high_risk")
      if (tool.risk === "medium") return bump(acc, "budget_medium_risk")
      return bump(acc, "budget_low_risk")
    }, filtered.reasons)

    const estimatedTokens = selected.reduce((sum, tool) => sum + tool.tokenSize, 0)
    const estimatedQuotaCost = selected.reduce((sum, tool) => sum + tool.quotaCost, 0)

    return NbaBudgetingResultSchema.parse({
      selected,
      metrics: {
        selectedCount: selected.length,
        estimatedTokens,
        estimatedQuotaCost,
        droppedReasons: reasonAfterBudget,
      },
    })
  }
}
