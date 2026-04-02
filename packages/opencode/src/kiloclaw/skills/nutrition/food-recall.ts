import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Food recall item
export interface Recall {
  readonly id: string
  readonly product: string
  readonly brand: string
  readonly reason: string
  readonly date: string
  readonly status: "active" | "terminated" | "ongoing"
  readonly country: string
  readonly category?: string
}

// Food recall input
interface FoodRecallInput {
  product: string
}

// Food recall output
interface FoodRecallOutput {
  recalls: Recall[]
  severity: "none" | "low" | "medium" | "high" | "critical"
  lastUpdated: string
}

// Mock FDA recall data
// In production, this would integrate with FDA openFDA API
const MOCK_RECALLS: Recall[] = [
  {
    id: "FDA-2026-001",
    product: "Organic Baby Spinach",
    brand: "Fresh Greens Inc",
    reason: "Potential Salmonella contamination",
    date: "2026-03-15",
    status: "ongoing",
    country: "USA",
    category: "Produce",
  },
  {
    id: "FDA-2026-002",
    product: "Ground Beef 80/20",
    brand: "Prime Meats",
    reason: "Possible E. coli O157:H7 contamination",
    date: "2026-03-10",
    status: "active",
    country: "USA",
    category: "Meat",
  },
  {
    id: "FDA-2026-003",
    product: "Almond Butter",
    brand: "Nutty Naturals",
    reason: "Recall due to undeclared peanuts - allergen risk",
    date: "2026-02-28",
    status: "terminated",
    country: "USA",
    category: "Nuts",
  },
  {
    id: "FDA-2025-045",
    product: "Raw Oysters",
    brand: "Pacific Shellfish",
    reason: "Norovirus contamination detected",
    date: "2025-12-20",
    status: "terminated",
    country: "USA",
    category: "Seafood",
  },
  {
    id: "FDA-2026-004",
    product: "Organic Whole Milk",
    brand: "Dairy Farm Co",
    reason: "Pasturization deviation - potential pathogen presence",
    date: "2026-03-20",
    status: "active",
    country: "USA",
    category: "Dairy",
  },
]

// Search recalls by product
function searchRecalls(product: string): Recall[] {
  const normalizedProduct = product.toLowerCase().trim()
  const keywords = normalizedProduct.split(/\s+/)

  return MOCK_RECALLS.filter((recall) => {
    const searchText = `${recall.product} ${recall.brand} ${recall.reason}`.toLowerCase()
    return keywords.some((keyword) => keyword.length > 2 && searchText.includes(keyword))
  }).map((recall) => ({
    ...recall,
    // Recalculate severity based on reason
    id: recall.id,
  }))
}

// Determine severity based on recall type and status
function determineSeverity(recalls: Recall[]): "none" | "low" | "medium" | "high" | "critical" {
  if (recalls.length === 0) return "none"

  // Active recalls are higher severity
  const hasActive = recalls.some((r) => r.status === "active")
  const hasOngoing = recalls.some((r) => r.status === "ongoing")

  // Pathogen-related (Salmonella, E. coli, Norovirus) are critical
  const hasPathogen = recalls.some((r) => /salmonella|e\.?\s*coli|norovirus|listeria|campylobacter/i.test(r.reason))

  // Allergen-related are medium-high
  const hasAllergen = recalls.some((r) => /allergen|undeclared|peanut|tree\s*nut|gluten|soy|dairy/i.test(r.reason))

  if (hasPathogen && (hasActive || hasOngoing)) return "critical"
  if (hasPathogen) return "high"
  if (hasAllergen) return "medium"
  if (hasActive) return "medium"
  return "low"
}

export const FoodRecallSkill: Skill = {
  id: "food-recall" as SkillId,
  version: "1.0.0",
  name: "Food Recall Monitoring",
  inputSchema: {
    type: "object",
    properties: {
      product: { type: "string", description: "Product name to check for recalls" },
    },
    required: ["product"],
  },
  outputSchema: {
    type: "object",
    properties: {
      recalls: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            product: { type: "string" },
            brand: { type: "string" },
            reason: { type: "string" },
            date: { type: "string" },
            status: { type: "string" },
            country: { type: "string" },
            category: { type: "string" },
          },
        },
      },
      severity: { type: "string", enum: ["none", "low", "medium", "high", "critical"] },
      lastUpdated: { type: "string" },
    },
  },
  capabilities: ["monitoring", "alerting", "safety_detection"],
  tags: ["nutrition", "food-safety", "recalls", "health"],
  async execute(input: unknown, context: SkillContext): Promise<FoodRecallOutput> {
    const log = Log.create({ service: "kiloclaw.skill.food-recall" })
    log.info("checking food recalls", {
      correlationId: context.correlationId,
      product: (input as FoodRecallInput).product,
    })

    const { product } = input as FoodRecallInput

    if (!product || product.trim().length === 0) {
      log.warn("empty product name provided")
      return {
        recalls: [],
        severity: "none",
        lastUpdated: new Date().toISOString(),
      }
    }

    const recalls = searchRecalls(product)
    const severity = determineSeverity(recalls)

    log.info("food recall check completed", {
      correlationId: context.correlationId,
      product,
      recallCount: recalls.length,
      severity,
    })

    return {
      recalls,
      severity,
      lastUpdated: new Date().toISOString(),
    }
  },
}
