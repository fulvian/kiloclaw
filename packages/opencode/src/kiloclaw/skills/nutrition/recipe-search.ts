import { Log } from "@/util/log"
import { Skill, SkillContext } from "../skill"
import { SkillId } from "../types"

// Filter options for recipe search
export interface Filter {
  readonly type: "cuisine" | "diet" | "time" | "difficulty" | "calorie"
  readonly value: string
}

// Recipe result
export interface Recipe {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly ingredients: readonly string[]
  readonly instructions: readonly string[]
  readonly prepTime: number // minutes
  readonly cookTime: number // minutes
  readonly servings: number
  readonly difficulty: "easy" | "medium" | "hard"
  readonly cuisine?: string
}

// Nutrition info per recipe
export interface Nutrition {
  readonly recipeId: string
  readonly calories: number
  readonly protein: number
  readonly carbs: number
  readonly fat: number
  readonly fiber?: number
}

// Recipe search input
interface RecipeSearchInput {
  ingredients: string[]
  filters?: Filter[]
}

// Recipe search output
interface RecipeSearchOutput {
  recipes: Recipe[]
  nutrition: Nutrition[]
  totalFound: number
  searchTips: readonly string[]
}

// Mock recipe database
// In production, this would integrate with Spoonacular, Edamam, or similar API
const MOCK_RECIPES: Recipe[] = [
  {
    id: "recipe-001",
    title: "Mediterranean Quinoa Bowl",
    description: "A healthy Mediterranean-inspired bowl with quinoa, fresh vegetables, and feta cheese.",
    ingredients: ["quinoa", "cucumber", "tomatoes", "feta cheese", "olives", "olive oil", "lemon"],
    instructions: [
      "Cook quinoa according to package directions",
      "Dice cucumber and tomatoes",
      "Combine cooled quinoa with vegetables",
      "Add crumbled feta and olives",
      "Dress with olive oil and lemon juice",
    ],
    prepTime: 15,
    cookTime: 20,
    servings: 2,
    difficulty: "easy",
    cuisine: "Mediterranean",
  },
  {
    id: "recipe-002",
    title: "Grilled Chicken Stir Fry",
    description: "Quick and nutritious chicken stir fry with colorful vegetables.",
    ingredients: ["chicken breast", "broccoli", "bell pepper", "soy sauce", "ginger", "garlic", "rice"],
    instructions: [
      "Cut chicken into bite-sized pieces",
      "Stir fry chicken until cooked through",
      "Add vegetables and stir fry",
      "Season with soy sauce, ginger, garlic",
      "Serve over rice",
    ],
    prepTime: 20,
    cookTime: 15,
    servings: 4,
    difficulty: "easy",
    cuisine: "Asian",
  },
  {
    id: "recipe-003",
    title: "Vegetable Lentil Soup",
    description: "Hearty and warming lentil soup packed with vegetables and spices.",
    ingredients: ["lentils", "carrots", "celery", "onion", "tomatoes", "cumin", "vegetable broth"],
    instructions: [
      "Sauté onion, carrots, celery",
      "Add spices and cook until fragrant",
      "Add lentils, tomatoes, and broth",
      "Simmer for 30-40 minutes",
      "Season to taste and serve",
    ],
    prepTime: 10,
    cookTime: 40,
    servings: 6,
    difficulty: "easy",
    cuisine: "Middle Eastern",
  },
  {
    id: "recipe-004",
    title: "Baked Salmon with Sweet Potato",
    description: "Omega-3 rich salmon served with roasted sweet potato wedges.",
    ingredients: ["salmon fillet", "sweet potato", "asparagus", "olive oil", "rosemary", "garlic"],
    instructions: [
      "Preheat oven to 400°F",
      "Cut sweet potatoes into wedges",
      "Place salmon and vegetables on baking sheet",
      "Drizzle with olive oil, add rosemary and garlic",
      "Bake for 25 minutes",
    ],
    prepTime: 10,
    cookTime: 25,
    servings: 2,
    difficulty: "easy",
    cuisine: "American",
  },
  {
    id: "recipe-005",
    title: "Tofu Veggie Scramble",
    description: "Protein-rich tofu scramble with vegetables - perfect for breakfast or brunch.",
    ingredients: ["tofu", "spinach", "mushrooms", "bell pepper", "turmeric", "nutritional yeast"],
    instructions: [
      "Press and crumble tofu",
      "Sauté vegetables until tender",
      "Add tofu and turmeric",
      "Cook until heated through",
      "Top with nutritional yeast",
    ],
    prepTime: 10,
    cookTime: 15,
    servings: 2,
    difficulty: "easy",
    cuisine: "American",
  },
  {
    id: "recipe-006",
    title: "Greek Salad with Chickpeas",
    description: "Fresh and filling Greek salad with protein-packed chickpeas.",
    ingredients: ["cucumber", "tomatoes", "red onion", "chickpeas", "feta cheese", "olives", "oregano"],
    instructions: [
      "Chop vegetables",
      "Combine in large bowl",
      "Add chickpeas and feta",
      "Toss with olive oil and oregano",
      "Serve immediately",
    ],
    prepTime: 15,
    cookTime: 0,
    servings: 4,
    difficulty: "easy",
    cuisine: "Greek",
  },
]

// Calculate nutrition from ingredients
function calculateNutrition(recipe: Recipe): Nutrition {
  // Simplified nutrition calculation based on ingredients
  // In production, would use actual ingredient nutritional data
  const baseCalories = recipe.ingredients.length * 50
  const protein = Math.round(recipe.ingredients.length * 5)
  const carbs = Math.round(recipe.ingredients.length * 8)
  const fat = Math.round(recipe.ingredients.length * 3)

  return {
    recipeId: recipe.id,
    calories: Math.min(baseCalories, 600),
    protein,
    carbs,
    fat,
    fiber: Math.round(recipe.ingredients.length * 1.5),
  }
}

// Search recipes by ingredients and filters
function searchRecipes(ingredients: string[], filters?: Filter[]): Recipe[] {
  const normalizedIngredients = ingredients.map((i) => i.toLowerCase().trim())

  let results = MOCK_RECIPES.filter((recipe) => {
    const recipeIngredients = recipe.ingredients.map((i) => i.toLowerCase())
    // Match if at least half of the input ingredients are in the recipe
    const matches = normalizedIngredients.filter((ing) =>
      recipeIngredients.some((ri) => ri.includes(ing) || ing.includes(ri)),
    )
    return matches.length >= Math.max(1, Math.ceil(normalizedIngredients.length / 2))
  })

  // Apply filters
  if (filters && filters.length > 0) {
    for (const filter of filters) {
      switch (filter.type) {
        case "cuisine":
          results = results.filter((r) => r.cuisine?.toLowerCase() === filter.value.toLowerCase())
          break
        case "diet":
          // Filter by dietary restrictions
          if (filter.value.toLowerCase() === "vegetarian") {
            results = results.filter((r) => !r.ingredients.some((i) => /chicken|meat|fish|salmon/i.test(i)))
          } else if (filter.value.toLowerCase() === "vegan") {
            results = results.filter(
              (r) => !r.ingredients.some((i) => /chicken|meat|fish|salmon|cheese|feta|egg/i.test(i)),
            )
          }
          break
        case "time":
          const maxTime = parseInt(filter.value, 10) || 30
          results = results.filter((r) => r.prepTime + r.cookTime <= maxTime)
          break
        case "difficulty":
          results = results.filter((r) => r.difficulty.toLowerCase() === filter.value.toLowerCase())
          break
      }
    }
  }

  // Sort by number of matching ingredients
  return results.sort((a, b) => {
    const aMatches = normalizedIngredients.filter((ing) =>
      a.ingredients.some((ai) => ai.toLowerCase().includes(ing)),
    ).length
    const bMatches = normalizedIngredients.filter((ing) =>
      b.ingredients.some((bi) => bi.toLowerCase().includes(ing)),
    ).length
    return bMatches - aMatches
  })
}

export const RecipeSearchSkill: Skill = {
  id: "recipe-search" as SkillId,
  version: { major: 1, minor: 0, patch: 0 },
  name: "Recipe Search",
  inputSchema: {
    type: "object",
    properties: {
      ingredients: {
        type: "array",
        items: { type: "string" },
        description: "List of ingredients to search recipes for",
      },
      filters: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["cuisine", "diet", "time", "difficulty", "calorie"] },
            value: { type: "string" },
          },
        },
        description: "Optional filters to narrow results",
      },
    },
    required: ["ingredients"],
  },
  outputSchema: {
    type: "object",
    properties: {
      recipes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            ingredients: { type: "array", items: { type: "string" } },
            instructions: { type: "array", items: { type: "string" } },
            prepTime: { type: "number" },
            cookTime: { type: "number" },
            servings: { type: "number" },
            difficulty: { type: "string" },
            cuisine: { type: "string" },
          },
        },
      },
      nutrition: {
        type: "array",
        items: {
          type: "object",
          properties: {
            recipeId: { type: "string" },
            calories: { type: "number" },
            protein: { type: "number" },
            carbs: { type: "number" },
            fat: { type: "number" },
            fiber: { type: "number" },
          },
        },
      },
      totalFound: { type: "number" },
      searchTips: { type: "array", items: { type: "string" } },
    },
  },
  capabilities: ["search", "nutrition_data", "recipe_matching"],
  tags: ["nutrition", "recipes", "cooking", "food"],
  async execute(input: unknown, context: SkillContext): Promise<RecipeSearchOutput> {
    const log = Log.create({ service: "kiloclaw.skill.recipe-search" })
    log.info("searching recipes", {
      correlationId: context.correlationId,
      ingredients: (input as RecipeSearchInput).ingredients,
    })

    const { ingredients, filters } = input as RecipeSearchInput

    if (!ingredients || ingredients.length === 0) {
      log.warn("empty ingredients provided")
      return {
        recipes: [],
        nutrition: [],
        totalFound: 0,
        searchTips: ["Please provide at least one ingredient to search for recipes"],
      }
    }

    const recipes = searchRecipes(ingredients, filters)
    const nutrition = recipes.map(calculateNutrition)

    const searchTips = [
      "Try adding more ingredients to narrow down results",
      "Use cuisine filters like 'cuisine: Italian' or 'cuisine: Asian'",
      "Add 'time: 30' to filter recipes under 30 minutes",
    ]

    log.info("recipe search completed", {
      correlationId: context.correlationId,
      ingredients,
      resultCount: recipes.length,
    })

    return {
      recipes,
      nutrition,
      totalFound: recipes.length,
      searchTips,
    }
  },
}
