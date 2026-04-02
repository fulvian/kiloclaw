import { Log } from "@/util/log"
import { Skill, SkillContext } from "../skill"
import { SkillId } from "../types"

// User profile for diet planning
export interface Profile {
  readonly age: number
  readonly weight: number // kg
  readonly height: number // cm
  readonly activityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active"
  readonly dietaryRestrictions?: string[]
  readonly preferences?: string[]
}

// Goal for diet planning
export interface Goal {
  readonly type: "weight_loss" | "weight_gain" | "maintenance" | "muscle_gain" | "health"
  readonly targetWeight?: number
  readonly timeframe?: string
  readonly priority?: number
}

// Meal plan output
export interface MealPlan {
  readonly dailyCalories: number
  readonly meals: readonly Meal[]
  readonly recommendations: readonly string[]
}

// Individual meal
export interface Meal {
  readonly name: string
  readonly calories: number
  readonly protein: number // grams
  readonly carbs: number // grams
  readonly fat: number // grams
  readonly foods: readonly string[]
}

// Macros breakdown
export interface Macros {
  readonly protein: number // grams
  readonly carbs: number // grams
  readonly fat: number // grams
  readonly fiber?: number // grams
  readonly sodium?: number // mg
}

// Diet plan input
interface DietPlanInput {
  user_profile: Profile
  goals: Goal[]
}

// Diet plan output
interface DietPlanOutput {
  plan: MealPlan
  macros: Macros
}

// Calculate BMR using Mifflin-St Jeor equation
function calculateBMR(profile: Profile): number {
  // BMR = 10 * weight(kg) + 6.25 * height(cm) - 5 * age(years) + gender modifier
  // Assuming average gender modifier of 5 for simplicity
  return 10 * profile.weight + 6.25 * profile.height - 5 * profile.age + 5
}

// Calculate TDEE based on activity level
function calculateTDEE(bmr: number, activityLevel: Profile["activityLevel"]): number {
  const multipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  }
  return bmr * multipliers[activityLevel]
}

// Calculate daily calorie target based on goals
function calculateCalorieTarget(tdee: number, goals: Goal[]): number {
  if (goals.length === 0) return tdee

  const primaryGoal = goals.reduce((prev, curr) => ((curr.priority || 0) > (prev.priority || 0) ? curr : prev))

  switch (primaryGoal.type) {
    case "weight_loss":
      return tdee * 0.8 // 20% deficit
    case "weight_gain":
      return tdee * 1.15 // 15% surplus
    case "muscle_gain":
      return tdee * 1.1 // 10% surplus
    case "maintenance":
    case "health":
    default:
      return tdee
  }
}

// Generate meal plan
function generateMealPlan(dailyCalories: number, profile: Profile): MealPlan {
  const meals: Meal[] = [
    {
      name: "Breakfast",
      calories: Math.round(dailyCalories * 0.25),
      protein: Math.round(((dailyCalories * 0.25) / 4) * 0.3), // 30% protein
      carbs: Math.round(((dailyCalories * 0.25) / 4) * 0.4), // 40% carbs
      fat: Math.round(((dailyCalories * 0.25) / 9) * 0.3), // 30% fat
      foods: ["Oatmeal with berries", "Greek yogurt", "Whole grain toast"],
    },
    {
      name: "Lunch",
      calories: Math.round(dailyCalories * 0.35),
      protein: Math.round(((dailyCalories * 0.35) / 4) * 0.35),
      carbs: Math.round(((dailyCalories * 0.35) / 4) * 0.4),
      fat: Math.round(((dailyCalories * 0.35) / 9) * 0.25),
      foods: ["Grilled chicken breast", "Brown rice", "Mixed vegetables"],
    },
    {
      name: "Dinner",
      calories: Math.round(dailyCalories * 0.3),
      protein: Math.round(((dailyCalories * 0.3) / 4) * 0.4),
      carbs: Math.round(((dailyCalories * 0.3) / 4) * 0.35),
      fat: Math.round(((dailyCalories * 0.3) / 9) * 0.25),
      foods: ["Salmon fillet", "Quinoa", "Steamed broccoli"],
    },
    {
      name: "Snacks",
      calories: Math.round(dailyCalories * 0.1),
      protein: Math.round(((dailyCalories * 0.1) / 4) * 0.2),
      carbs: Math.round(((dailyCalories * 0.1) / 4) * 0.5),
      fat: Math.round(((dailyCalories * 0.1) / 9) * 0.3),
      foods: ["Almonds", "Apple", "Protein shake"],
    },
  ]

  const recommendations = [
    "Stay hydrated with 8+ glasses of water daily",
    "Eat protein within 30 minutes of waking up",
    "Limit processed foods and added sugars",
    "Include leafy greens in at least 2 meals",
  ]

  if (profile.dietaryRestrictions?.includes("vegetarian")) {
    recommendations.push("Consider plant-based protein sources like tofu and legumes")
  }
  if (profile.dietaryRestrictions?.includes("vegan")) {
    recommendations.push("Ensure adequate B12 and iron intake from fortified foods or supplements")
  }

  return { dailyCalories, meals, recommendations }
}

// Calculate macros from calorie target
function calculateMacros(dailyCalories: number): Macros {
  // Standard macro split: 30% protein, 40% carbs, 30% fat
  return {
    protein: Math.round((dailyCalories * 0.3) / 4), // 4 cal per gram protein
    carbs: Math.round((dailyCalories * 0.4) / 4), // 4 cal per gram carbs
    fat: Math.round((dailyCalories * 0.3) / 9), // 9 cal per gram fat
    fiber: 25, // recommended daily intake
    sodium: 2300, // mg recommended limit
  }
}

export const DietPlanSkill: Skill = {
  id: "diet-plan" as SkillId,
  version: { major: 1, minor: 0, patch: 0 },
  name: "Diet Plan Generation",
  inputSchema: {
    type: "object",
    properties: {
      user_profile: {
        type: "object",
        properties: {
          age: { type: "number" },
          weight: { type: "number" },
          height: { type: "number" },
          activityLevel: { type: "string", enum: ["sedentary", "light", "moderate", "active", "very_active"] },
          dietaryRestrictions: { type: "array", items: { type: "string" } },
          preferences: { type: "array", items: { type: "string" } },
        },
        required: ["age", "weight", "height", "activityLevel"],
      },
      goals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["weight_loss", "weight_gain", "maintenance", "muscle_gain", "health"] },
            targetWeight: { type: "number" },
            timeframe: { type: "string" },
            priority: { type: "number" },
          },
        },
      },
    },
    required: ["user_profile"],
  },
  outputSchema: {
    type: "object",
    properties: {
      plan: {
        type: "object",
        properties: {
          dailyCalories: { type: "number" },
          meals: { type: "array" },
          recommendations: { type: "array", items: { type: "string" } },
        },
      },
      macros: {
        type: "object",
        properties: {
          protein: { type: "number" },
          carbs: { type: "number" },
          fat: { type: "number" },
          fiber: { type: "number" },
          sodium: { type: "number" },
        },
      },
    },
  },
  capabilities: ["plan_generation", "personalization"],
  tags: ["nutrition", "diet", "health", "meal-planning"],
  async execute(input: unknown, context: SkillContext): Promise<DietPlanOutput> {
    const log = Log.create({ service: "kiloclaw.skill.diet-plan" })
    log.info("generating diet plan", { correlationId: context.correlationId })

    const { user_profile, goals } = input as DietPlanInput

    if (!user_profile || typeof user_profile.age !== "number" || typeof user_profile.weight !== "number") {
      log.warn("invalid user profile provided")
      return {
        plan: { dailyCalories: 2000, meals: [], recommendations: ["Please provide a valid user profile"] },
        macros: { protein: 0, carbs: 0, fat: 0 },
      }
    }

    // Calculate metabolic values
    const bmr = calculateBMR(user_profile)
    const tdee = calculateTDEE(bmr, user_profile.activityLevel)
    const dailyCalories = calculateCalorieTarget(tdee, goals)

    // Generate plan and macros
    const plan = generateMealPlan(dailyCalories, user_profile)
    const macros = calculateMacros(dailyCalories)

    log.info("diet plan generated", {
      correlationId: context.correlationId,
      dailyCalories,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
    })

    return { plan, macros }
  },
}
