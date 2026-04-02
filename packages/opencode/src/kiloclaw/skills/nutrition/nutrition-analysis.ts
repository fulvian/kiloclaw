import { Log } from "@/util/log"
import { Skill, SkillContext } from "../skill"
import { SkillId } from "../types"

// Macros nutrient data
export interface Macros {
  readonly protein: number // grams
  readonly carbs: number // grams
  readonly fat: number // grams
  readonly fiber?: number // grams
  readonly sugar?: number // grams
  readonly sodium?: number // mg
}

// Nutrition analysis input
interface NutritionAnalysisInput {
  food_item: string
  serving: string
}

// Nutrition analysis output
interface NutritionAnalysisOutput {
  macros: Macros
  score: number
  serving_size: string
  calories: number
}

// Common food nutritional data (mock database)
// In production, this would integrate with USDA FoodData Central or Edamam API
const FOOD_DATABASE: Record<string, { calories: number; protein: number; carbs: number; fat: number; fiber?: number }> =
  {
    apple: { calories: 95, protein: 0.5, carbs: 25, fat: 0.3, fiber: 4.4 },
    banana: { calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1 },
    chicken_breast: { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0 },
    salmon: { calories: 208, protein: 20, carbs: 0, fat: 13, fiber: 0 },
    brown_rice: { calories: 216, protein: 5, carbs: 45, fat: 1.8, fiber: 3.5 },
    broccoli: { calories: 55, protein: 3.7, carbs: 11, fat: 0.6, fiber: 5.1 },
    oatmeal: { calories: 158, protein: 6, carbs: 27, fat: 3.2, fiber: 4 },
    egg: { calories: 78, protein: 6, carbs: 0.6, fat: 5, fiber: 0 },
    greek_yogurt: { calories: 100, protein: 17, carbs: 6, fat: 0.7, fiber: 0 },
    almond: { calories: 7, protein: 0.3, carbs: 0.3, fat: 0.6, fiber: 0.1 },
    avocado: { calories: 240, protein: 3, carbs: 13, fat: 22, fiber: 10 },
    sweet_potato: { calories: 103, protein: 2.3, carbs: 24, fat: 0.1, fiber: 3.8 },
    spinach: { calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2 },
    quinoa: { calories: 222, protein: 8, carbs: 39, fat: 3.6, fiber: 5 },
    tofu: { calories: 144, protein: 15, carbs: 3.5, fat: 9, fiber: 2 },
    lentil: { calories: 230, protein: 18, carbs: 40, fat: 0.8, fiber: 16 },
    oats: { calories: 389, protein: 17, carbs: 66, fat: 7, fiber: 11 },
    peanut_butter: { calories: 188, protein: 8, carbs: 6, fat: 16, fiber: 2 },
    whole_wheat_bread: { calories: 81, protein: 4, carbs: 14, fat: 1.1, fiber: 2 },
    pasta: { calories: 220, protein: 8, carbs: 43, fat: 1.3, fiber: 2.5 },
  }

// Parse serving size to get multiplier
function parseServing(serving: string, baseAmount: number): number {
  // Common serving patterns: "100g", "1 cup", "2 tbsp", "1 medium", "3 oz"
  const lowerServing = serving.toLowerCase().trim()

  // Handle numeric values directly
  const numericMatch = lowerServing.match(/^(\d+(?:\.\d+)?)\s*(g|gram|oz|ounce)?$/)
  if (numericMatch) {
    const num = parseFloat(numericMatch[1])
    const unit = numericMatch[2] || ""
    if (unit === "oz" || unit === "ounce") return num / 100 // assume oz is relative to 100g base
    return num / 100 // normalize to per 100g
  }

  // Handle cup/tbsp/spoon etc
  const cupMatch = lowerServing.match(/^(\d+(?:\.\d+)?)\s*(cup|cups)$/)
  if (cupMatch) return parseFloat(cupMatch[1]) * 1.5 // approximate 1 cup = 150g for mixed foods

  const tbspMatch = lowerServing.match(/^(\d+(?:\.\d+)?)\s*(tbsp|tablespoon)$/)
  if (tbspMatch) return parseFloat(tbspMatch[1]) * 0.5 // approximate 1 tbsp = 15g

  const sliceMatch = lowerServing.match(/^(\d+(?:\.\d+)?)\s*(slice|pieces?)$/)
  if (sliceMatch) return parseFloat(sliceMatch[1]) * 1.2 // approximate per slice

  const mediumMatch = lowerServing.match(/^(\d+(?:\.\d+)?)?\s*(medium|small|large)$/)
  if (mediumMatch) {
    const size = mediumMatch[2] || "medium"
    const multipliers = { small: 0.8, medium: 1, large: 1.3 }
    return multipliers[size as keyof typeof multipliers] || 1
  }

  return 1 // default to 1 serving
}

// Lookup food in database
function lookupFood(
  foodItem: string,
): { calories: number; protein: number; carbs: number; fat: number; fiber?: number } | null {
  const normalized = foodItem
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")

  // Direct match
  if (FOOD_DATABASE[normalized]) return FOOD_DATABASE[normalized]

  // Partial match
  for (const [key, value] of Object.entries(FOOD_DATABASE)) {
    if (key.includes(normalized) || normalized.includes(key)) return value
  }

  return null
}

// Calculate nutrition score (0-100)
function calculateNutritionScore(macros: Macros, calories: number): number {
  let score = 100

  // Penalize high calories
  if (calories > 500) score -= Math.min(20, (calories - 500) / 25)

  // Penalize unbalanced macros
  const totalMacros = macros.protein + macros.carbs + macros.fat
  if (totalMacros > 0) {
    const proteinRatio = macros.protein / totalMacros
    const carbsRatio = macros.carbs / totalMacros
    const fatRatio = macros.fat / totalMacros

    // Ideal: ~30% protein, ~40% carbs, ~30% fat
    const proteinDev = Math.abs(proteinRatio - 0.3)
    const carbsDev = Math.abs(carbsRatio - 0.4)
    const fatDev = Math.abs(fatRatio - 0.3)

    score -= (proteinDev + carbsDev + fatDev) * 25
  }

  // Bonus for fiber
  if (macros.fiber && macros.fiber > 5) score += Math.min(10, macros.fiber - 5)

  return Math.max(0, Math.min(100, Math.round(score)))
}

export const NutritionAnalysisSkill: Skill = {
  id: "nutrition-analysis" as SkillId,
  version: { major: 1, minor: 0, patch: 0 },
  name: "Nutrition Analysis",
  inputSchema: {
    type: "object",
    properties: {
      food_item: { type: "string", description: "Name of the food item" },
      serving: { type: "string", description: "Serving size (e.g., '100g', '1 cup', '2 slices')" },
    },
    required: ["food_item"],
  },
  outputSchema: {
    type: "object",
    properties: {
      macros: {
        type: "object",
        properties: {
          protein: { type: "number", description: "Protein in grams" },
          carbs: { type: "number", description: "Carbohydrates in grams" },
          fat: { type: "number", description: "Fat in grams" },
          fiber: { type: "number" },
          sugar: { type: "number" },
          sodium: { type: "number" },
        },
      },
      score: { type: "number", description: "Nutrition score 0-100" },
      serving_size: { type: "string", description: "Actual serving size analyzed" },
      calories: { type: "number", description: "Total calories" },
    },
  },
  capabilities: ["food_analysis", "macro_calculation", "nutrition_scoring"],
  tags: ["nutrition", "diet", "health", "food-analysis"],
  async execute(input: unknown, context: SkillContext): Promise<NutritionAnalysisOutput> {
    const log = Log.create({ service: "kiloclaw.skill.nutrition-analysis" })
    log.info("analyzing nutrition", {
      correlationId: context.correlationId,
      food: (input as NutritionAnalysisInput).food_item,
    })

    const { food_item, serving } = input as NutritionAnalysisInput

    if (!food_item) {
      log.warn("empty food item provided")
      return {
        macros: { protein: 0, carbs: 0, fat: 0 },
        score: 0,
        serving_size: serving || "unknown",
        calories: 0,
      }
    }

    // Look up food in database
    const foodData = lookupFood(food_item)

    if (!foodData) {
      log.info("food not found in database, returning estimate", {
        correlationId: context.correlationId,
        food: food_item,
      })
      // Return a generic estimate for unknown foods
      const servingMultiplier = parseServing(serving || "100g", 100)
      return {
        macros: { protein: 5 * servingMultiplier, carbs: 20 * servingMultiplier, fat: 3 * servingMultiplier },
        score: 50,
        serving_size: serving || "100g",
        calories: Math.round(150 * servingMultiplier),
      }
    }

    const servingMultiplier = parseServing(serving || "100g", 100)

    const macros: Macros = {
      protein: Math.round(foodData.protein * servingMultiplier * 10) / 10,
      carbs: Math.round(foodData.carbs * servingMultiplier * 10) / 10,
      fat: Math.round(foodData.fat * servingMultiplier * 10) / 10,
      fiber: foodData.fiber ? Math.round(foodData.fiber * servingMultiplier * 10) / 10 : undefined,
    }

    const calories = Math.round(foodData.calories * servingMultiplier)
    const score = calculateNutritionScore(macros, calories)

    log.info("nutrition analysis completed", {
      correlationId: context.correlationId,
      food: food_item,
      calories,
      score,
    })

    return {
      macros,
      score,
      serving_size: serving || "100g",
      calories,
    }
  },
}
