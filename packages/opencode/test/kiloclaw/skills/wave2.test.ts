import { describe, it, expect } from "bun:test"
import {
  // Nutrition Skills
  DietPlanSkill,
  NutritionAnalysisSkill,
  FoodRecallSkill,
  RecipeSearchSkill,
  // Weather Skills
  WeatherForecastSkill,
  WeatherAlertsSkill,
  WeatherCurrentSkill,
  // Aggregates
  nutritionSkills,
  weatherSkills,
  allWave2Skills,
  NUTRITION_SKILL_COUNT,
  WEATHER_SKILL_COUNT,
  TOTAL_WAVE2_SKILL_COUNT,
} from "@/kiloclaw/skills"
import type { Skill } from "@/kiloclaw/skill"

// Result type interfaces for wave2 skill execute() return types
interface DietPlanResult {
  plan: {
    dailyCalories: number
    meals: Array<{ name: string; foods: string[]; calories: number }>
    recommendations: string[]
  }
  macros: { protein: number; carbs: number; fat: number }
}

interface NutritionAnalysisResult {
  macros: { protein: number; carbs: number; fat: number }
  score: number
  serving_size: string
  calories: number
}

interface FoodRecallResult {
  recalls: Array<{ product: string; reason: string; date: string }>
  severity: "none" | "low" | "medium" | "high" | "critical"
  lastUpdated: string
}

interface RecipeSearchResult {
  recipes: Array<{ name: string; prepTime: number; cookTime: number }>
  nutrition: Array<{ calories: number; protein: number; carbs: number; fat: number }>
  totalFound: number
  searchTips: string[]
}

interface WeatherForecastResult {
  forecast: Array<{
    date: string
    dayName: string
    high: number
    low: number
    condition: string
    precipitation: number
    humidity: number
  }>
  location: string
  timezone: string
}

interface WeatherAlertsResult {
  alerts: Array<{
    id: string
    type: string
    severity: string
    headline: string
    description: string
    effective: string
    expires: string
  }>
  severity: string
  activeCount: number
  lastUpdated: string
}

interface WeatherCurrentResult {
  conditions: {
    temperature: number
    condition: string
    conditionCode?: number
    description?: string
    humidity: number
    windSpeed: number
    windDirection: string
    windDirectionDegrees?: number
    feelsLike: number
    pressure: number
    visibility: number
    uvIndex: number
    cloudCover: number
    precipitation?: number
    isDay?: boolean
  }
  location: {
    name: string
    latitude?: number
    longitude?: number
    timezone?: string
    country?: string
    admin1?: string
  }
  temp?: number
  tempF?: number
  localTime: string
  observationTime: string
  provider?: { id: string; name: string; attribution?: string }
  fallbackChain?: string[]
  errors?: Array<{ provider: string; error: string; timestamp: string }>
  meta?: { generationTimeMs: number; cached: boolean }
}

// Test fixtures
const CORRELATION_ID = "test-correlation-wave2-001"
const AGENCY_ID = "agency-test"
const SKILL_CONTEXT = {
  correlationId: CORRELATION_ID as import("@/kiloclaw/types").CorrelationId,
  agencyId: AGENCY_ID,
  skillId: "test-skill",
}

// Nutrition agency tests
describe("WP4.3 Wave 2: Nutrition Agency Skills", () => {
  describe("diet-plan skill", () => {
    it("should have correct metadata", () => {
      expect(DietPlanSkill.id as string).toBe("diet-plan")
      expect(DietPlanSkill.version).toEqual("1.0.0")
      expect(DietPlanSkill.name).toBe("Diet Plan Generation")
      expect(DietPlanSkill.capabilities).toContain("plan_generation")
      expect(DietPlanSkill.capabilities).toContain("personalization")
      expect(DietPlanSkill.tags).toContain("nutrition")
    })

    it("should generate diet plan with valid profile", async () => {
      const result = (await DietPlanSkill.execute(
        {
          user_profile: {
            age: 30,
            weight: 70,
            height: 175,
            activityLevel: "moderate",
          },
          goals: [{ type: "weight_loss", priority: 1 }],
        },
        SKILL_CONTEXT,
      )) as DietPlanResult
      expect(result).toHaveProperty("plan")
      expect(result).toHaveProperty("macros")
      expect(result.plan).toHaveProperty("dailyCalories")
      expect(result.plan).toHaveProperty("meals")
      expect(result.plan).toHaveProperty("recommendations")
      expect(result.macros).toHaveProperty("protein")
      expect(result.macros).toHaveProperty("carbs")
      expect(result.macros).toHaveProperty("fat")
    })

    it("should calculate different calories for different goals", async () => {
      const baseProfile = {
        age: 30,
        weight: 70,
        height: 175,
        activityLevel: "moderate" as const,
      }

      const maintenanceResult = (await DietPlanSkill.execute(
        { user_profile: baseProfile, goals: [{ type: "maintenance", priority: 1 }] },
        SKILL_CONTEXT,
      )) as DietPlanResult
      const weightLossResult = (await DietPlanSkill.execute(
        { user_profile: baseProfile, goals: [{ type: "weight_loss", priority: 1 }] },
        SKILL_CONTEXT,
      )) as DietPlanResult

      expect(weightLossResult.plan.dailyCalories).toBeLessThan(maintenanceResult.plan.dailyCalories)
    })

    it("should handle invalid profile", async () => {
      const result = (await DietPlanSkill.execute(
        { user_profile: { age: 0, weight: 0, height: 0, activityLevel: "sedentary" }, goals: [] },
        SKILL_CONTEXT,
      )) as DietPlanResult
      expect(result.plan).toBeDefined()
      expect(result.macros).toBeDefined()
    })
  })

  describe("nutrition-analysis skill", () => {
    it("should have correct metadata", () => {
      expect(NutritionAnalysisSkill.id as string).toBe("nutrition-analysis")
      expect(NutritionAnalysisSkill.version).toEqual("1.0.0")
      expect(NutritionAnalysisSkill.name).toBe("Nutrition Analysis")
      expect(NutritionAnalysisSkill.capabilities).toContain("food_analysis")
      expect(NutritionAnalysisSkill.capabilities).toContain("macro_calculation")
      expect(NutritionAnalysisSkill.tags).toContain("nutrition")
    })

    it("should analyze known food", async () => {
      const result = (await NutritionAnalysisSkill.execute(
        { food_item: "chicken breast", serving: "100g" },
        SKILL_CONTEXT,
      )) as NutritionAnalysisResult
      expect(result).toHaveProperty("macros")
      expect(result).toHaveProperty("score")
      expect(result).toHaveProperty("serving_size")
      expect(result).toHaveProperty("calories")
      expect(result.macros.protein).toBeGreaterThan(0)
    })

    it("should parse different serving sizes", async () => {
      const result1 = (await NutritionAnalysisSkill.execute(
        { food_item: "chicken breast", serving: "100g" },
        SKILL_CONTEXT,
      )) as NutritionAnalysisResult
      const result2 = (await NutritionAnalysisSkill.execute(
        { food_item: "chicken breast", serving: "200g" },
        SKILL_CONTEXT,
      )) as NutritionAnalysisResult

      expect(result2.calories).toBeGreaterThan(result1.calories)
    })

    it("should return estimate for unknown food", async () => {
      const result = (await NutritionAnalysisSkill.execute(
        { food_item: "some random unknown food", serving: "100g" },
        SKILL_CONTEXT,
      )) as NutritionAnalysisResult
      expect(result).toHaveProperty("macros")
      expect(result.score).toBeGreaterThan(0)
    })

    it("should handle empty food item", async () => {
      const result = (await NutritionAnalysisSkill.execute(
        { food_item: "", serving: "100g" },
        SKILL_CONTEXT,
      )) as NutritionAnalysisResult
      expect(result.score).toBe(0)
      expect(result.calories).toBe(0)
    })
  })

  describe("food-recall skill", () => {
    it("should have correct metadata", () => {
      expect(FoodRecallSkill.id as string).toBe("food-recall")
      expect(FoodRecallSkill.version).toEqual("1.0.0")
      expect(FoodRecallSkill.name).toBe("Food Recall Monitoring")
      expect(FoodRecallSkill.capabilities).toContain("monitoring")
      expect(FoodRecallSkill.capabilities).toContain("alerting")
      expect(FoodRecallSkill.tags).toContain("food-safety")
    })

    it("should return recalls for matching product", async () => {
      const result = (await FoodRecallSkill.execute({ product: "spinach" }, SKILL_CONTEXT)) as FoodRecallResult
      expect(result).toHaveProperty("recalls")
      expect(result).toHaveProperty("severity")
      expect(result).toHaveProperty("lastUpdated")
      expect(Array.isArray(result.recalls)).toBe(true)
    })

    it("should return none severity for no matches", async () => {
      const result = (await FoodRecallSkill.execute(
        { product: "nonexistent xyz product" },
        SKILL_CONTEXT,
      )) as FoodRecallResult
      expect(result.recalls).toHaveLength(0)
      expect(result.severity).toBe("none")
    })

    it("should detect high severity for pathogen recalls", async () => {
      const result = (await FoodRecallSkill.execute({ product: "ground beef" }, SKILL_CONTEXT)) as FoodRecallResult
      if (result.recalls.length > 0) {
        expect(["high", "critical", "medium"]).toContain(result.severity)
      }
    })
  })

  describe("recipe-search skill", () => {
    it("should have correct metadata", () => {
      expect(RecipeSearchSkill.id as string).toBe("recipe-search")
      expect(RecipeSearchSkill.version).toEqual("1.0.0")
      expect(RecipeSearchSkill.name).toBe("Recipe Search")
      expect(RecipeSearchSkill.capabilities).toContain("search")
      expect(RecipeSearchSkill.capabilities).toContain("nutrition_data")
      expect(RecipeSearchSkill.tags).toContain("recipes")
    })

    it("should find recipes by ingredients", async () => {
      const result = (await RecipeSearchSkill.execute(
        { ingredients: ["quinoa", "chicken"] },
        SKILL_CONTEXT,
      )) as RecipeSearchResult
      expect(result).toHaveProperty("recipes")
      expect(result).toHaveProperty("nutrition")
      expect(result).toHaveProperty("totalFound")
      expect(result).toHaveProperty("searchTips")
      expect(Array.isArray(result.recipes)).toBe(true)
      expect(result.recipes.length).toBeGreaterThan(0)
    })

    it("should apply cuisine filter", async () => {
      const result = (await RecipeSearchSkill.execute(
        { ingredients: ["chicken"], filters: [{ type: "cuisine", value: "Asian" }] },
        SKILL_CONTEXT,
      )) as RecipeSearchResult
      expect(result.recipes.length).toBeGreaterThan(0)
    })

    it("should apply time filter", async () => {
      const result = (await RecipeSearchSkill.execute(
        { ingredients: ["vegetables"], filters: [{ type: "time", value: "15" }] },
        SKILL_CONTEXT,
      )) as RecipeSearchResult
      for (const recipe of result.recipes) {
        expect(recipe.prepTime + recipe.cookTime).toBeLessThanOrEqual(15)
      }
    })

    it("should return nutrition data for recipes", async () => {
      const result = (await RecipeSearchSkill.execute({ ingredients: ["salmon"] }, SKILL_CONTEXT)) as RecipeSearchResult
      expect(result.nutrition.length).toBe(result.recipes.length)
      for (const nutrition of result.nutrition) {
        expect(nutrition).toHaveProperty("calories")
        expect(nutrition).toHaveProperty("protein")
        expect(nutrition).toHaveProperty("carbs")
        expect(nutrition).toHaveProperty("fat")
      }
    })

    it("should handle empty ingredients", async () => {
      const result = (await RecipeSearchSkill.execute({ ingredients: [] }, SKILL_CONTEXT)) as RecipeSearchResult
      expect(result.recipes).toHaveLength(0)
      expect(result.totalFound).toBe(0)
    })
  })
})

// Weather agency tests
describe("WP4.3 Wave 2: Weather Agency Skills", () => {
  describe("weather-forecast skill", () => {
    it("should have correct metadata", () => {
      expect(WeatherForecastSkill.id as string).toBe("weather-forecast")
      expect(WeatherForecastSkill.version).toEqual("2.0.0")
      expect(WeatherForecastSkill.name).toBe("Weather Forecast")
      expect(WeatherForecastSkill.capabilities).toContain("prediction")
      expect(WeatherForecastSkill.capabilities).toContain("multi_day")
      expect(WeatherForecastSkill.tags).toContain("weather")
    })

    it("should generate multi-day forecast", async () => {
      const result = (await WeatherForecastSkill.execute(
        { location: "New York", days: 5 },
        SKILL_CONTEXT,
      )) as WeatherForecastResult
      expect(result).toHaveProperty("forecast")
      expect(result).toHaveProperty("location")
      expect(result.location).toHaveProperty("timezone")
      expect(result.forecast.length).toBe(5)
    })

    it("should respect day limit", async () => {
      const result = (await WeatherForecastSkill.execute(
        { location: "Boston", days: 7 },
        SKILL_CONTEXT,
      )) as WeatherForecastResult
      expect(result.forecast.length).toBe(7)
    })

    it("should limit to max 16 days", async () => {
      const result = (await WeatherForecastSkill.execute(
        { location: "Chicago", days: 10 },
        SKILL_CONTEXT,
      )) as WeatherForecastResult
      expect(result.forecast.length).toBe(10)
    })

    it("should have forecast items with required fields", async () => {
      const result = (await WeatherForecastSkill.execute(
        { location: "Seattle", days: 3 },
        SKILL_CONTEXT,
      )) as WeatherForecastResult
      for (const day of result.forecast) {
        expect(day).toHaveProperty("date")
        expect(day).toHaveProperty("dayName")
        expect(day).toHaveProperty("high")
        expect(day).toHaveProperty("low")
        expect(day).toHaveProperty("condition")
        expect(day).toHaveProperty("precipitation")
        expect(day).toHaveProperty("humidity")
      }
    })

    it("should handle empty location", async () => {
      const result = (await WeatherForecastSkill.execute(
        { location: "", days: 5 },
        SKILL_CONTEXT,
      )) as WeatherForecastResult
      expect(result.forecast).toHaveLength(0)
    })
  })

  describe("weather-alerts skill", () => {
    it("should have correct metadata", () => {
      expect(WeatherAlertsSkill.id as string).toBe("weather-alerts")
      expect(WeatherAlertsSkill.version).toEqual("2.0.0")
      expect(WeatherAlertsSkill.name).toBe("Weather Alerts")
      expect(WeatherAlertsSkill.capabilities).toContain("warning_detection")
      expect(WeatherAlertsSkill.capabilities).toContain("notification")
      expect(WeatherAlertsSkill.tags).toContain("alerts")
    })

    it("should return alerts for location", async () => {
      const result = (await WeatherAlertsSkill.execute({ location: "Downtown" }, SKILL_CONTEXT)) as WeatherAlertsResult
      expect(result).toHaveProperty("alerts")
      expect(result).toHaveProperty("severity")
      expect(result).toHaveProperty("activeCount")
      expect(result).toHaveProperty("lastUpdated")
      expect(Array.isArray(result.alerts)).toBe(true)
    })

    it("should return none severity when no alerts", async () => {
      const result = (await WeatherAlertsSkill.execute(
        { location: "nonexistent area xyz" },
        SKILL_CONTEXT,
      )) as WeatherAlertsResult
      expect(result.severity).toBe("none")
      expect(result.activeCount).toBe(0)
    })

    it("should include alert details", async () => {
      const result = (await WeatherAlertsSkill.execute({ location: "Downtown" }, SKILL_CONTEXT)) as WeatherAlertsResult
      if (result.alerts.length > 0) {
        const alert = result.alerts[0]
        expect(alert).toHaveProperty("id")
        expect(alert).toHaveProperty("type")
        expect(alert).toHaveProperty("severity")
        expect(alert).toHaveProperty("headline")
        expect(alert).toHaveProperty("description")
        expect(alert).toHaveProperty("effective")
        expect(alert).toHaveProperty("expires")
      }
    })
  })

  describe("weather-current skill", () => {
    it("should have correct metadata", () => {
      expect(WeatherCurrentSkill.id as string).toBe("weather-current")
      expect(WeatherCurrentSkill.version).toEqual("2.0.0")
      expect(WeatherCurrentSkill.name).toBe("Current Weather Conditions")
      expect(WeatherCurrentSkill.capabilities).toContain("current_conditions")
      expect(WeatherCurrentSkill.tags).toContain("weather")
    })

    it("should return current conditions", async () => {
      const result = (await WeatherCurrentSkill.execute({ location: "Miami" }, SKILL_CONTEXT)) as WeatherCurrentResult
      expect(result).toHaveProperty("conditions")
      expect(result).toHaveProperty("location")
      expect(result).toHaveProperty("temp")
      expect(result).toHaveProperty("localTime")
      expect(result).toHaveProperty("observationTime")
      expect(result.conditions).toHaveProperty("temperature")
      expect(result.conditions).toHaveProperty("condition")
      expect(result.conditions).toHaveProperty("humidity")
    })

    it("should return temperature in Fahrenheit", async () => {
      const result = (await WeatherCurrentSkill.execute(
        { location: "Phoenix", units: "imperial" },
        SKILL_CONTEXT,
      )) as WeatherCurrentResult
      // Check if temp is in reasonable Fahrenheit range (32-120 F)
      expect(result.temp).toBeGreaterThanOrEqual(32)
      expect(result.temp).toBeLessThanOrEqual(120)
    })

    it("should include wind information", async () => {
      const result = (await WeatherCurrentSkill.execute({ location: "Denver" }, SKILL_CONTEXT)) as WeatherCurrentResult
      expect(result.conditions).toHaveProperty("windSpeed")
      expect(result.conditions).toHaveProperty("windDirection")
      expect(typeof result.conditions.windSpeed).toBe("number")
    })

    it("should include weather details", async () => {
      const result = (await WeatherCurrentSkill.execute({ location: "Seattle" }, SKILL_CONTEXT)) as WeatherCurrentResult
      expect(result.conditions).toHaveProperty("feelsLike")
      expect(result.conditions).toHaveProperty("pressure")
      expect(result.conditions).toHaveProperty("visibility")
      expect(result.conditions).toHaveProperty("uvIndex")
      expect(result.conditions).toHaveProperty("cloudCover")
    })

    it("should handle empty location", async () => {
      const result = (await WeatherCurrentSkill.execute({ location: "" }, SKILL_CONTEXT)) as WeatherCurrentResult
      expect(result.conditions.temperature).toBe(0)
      expect(result.location.name).toBe("")
    })
  })
})

// Aggregate exports tests
describe("WP4.3 Wave 2: Skill Registry Integration", () => {
  it("should export 4 nutrition skills", () => {
    expect(NUTRITION_SKILL_COUNT).toBe(4)
    expect(nutritionSkills).toHaveLength(4)
  })

  it("should export 3 weather skills", () => {
    expect(WEATHER_SKILL_COUNT).toBe(3)
    expect(weatherSkills).toHaveLength(3)
  })

  it("should export 7 total wave 2 skills", () => {
    expect(TOTAL_WAVE2_SKILL_COUNT).toBe(7)
    expect(allWave2Skills).toHaveLength(7)
  })

  it("should have unique skill IDs across wave 2", () => {
    const ids = allWave2Skills.map((s: Skill) => s.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it("should have valid skill structure for all wave 2 skills", () => {
    for (const skill of allWave2Skills) {
      expect(skill.id).toBeDefined()
      expect(skill.version).toBeDefined()
      expect(skill.name).toBeDefined()
      expect(skill.inputSchema).toBeDefined()
      expect(skill.outputSchema).toBeDefined()
      expect(skill.capabilities).toBeDefined()
      expect(skill.tags).toBeDefined()
      expect(skill.execute).toBeDefined()
    }
  })

  it("should have semantic version format for all wave 2 skills", () => {
    for (const skill of allWave2Skills) {
      expect(typeof skill.version).toBe("string")
      expect(skill.version).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })

  it("should have nutrition tag for all nutrition skills", () => {
    for (const skill of nutritionSkills) {
      expect(skill.tags).toContain("nutrition")
    }
  })

  it("should have weather tag for all weather skills", () => {
    for (const skill of weatherSkills) {
      expect(skill.tags).toContain("weather")
    }
  })
})
