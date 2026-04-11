// Kiloclaw Skills - Wave 1 + Wave 2 + Wave 3 Implementation
// Wave 1: Development Agency (6 skills) + Knowledge Agency (5 skills) = 11 skills
// Wave 2: Nutrition Agency (4 skills) + Weather Agency (3 skills) = 7 skills
// Wave 3: NBA Betting Agency (1 skill) = 1 skill
// Total: 19 skills

// Development Agency Skills
export { CodeReviewSkill, type Issue, type IssueSeverity } from "./development/code-review"

export { DebuggingSkill, type DebuggingInput, type DebuggingOutput } from "./development/debugging"

export { TddSkill, type TddInput, type TddOutput } from "./development/tdd"

export {
  ComparisonSkill,
  type Diff,
  type DiffType,
  type Conflict,
  type ComparisonInput,
  type ComparisonOutput,
} from "./development/comparison"

export {
  DocumentAnalysisSkill,
  type Section,
  type DocumentAnalysisInput,
  type DocumentAnalysisOutput,
} from "./development/document-analysis"

export {
  SimplificationSkill,
  type Metrics,
  type SimplificationInput,
  type SimplificationOutput,
} from "./development/simplification"

// Knowledge Agency Skills
export {
  WebResearchSkill,
  type Result as WebResult,
  type WebResearchInput,
  type WebResearchOutput,
} from "./knowledge/web-research"

export {
  LiteratureReviewSkill,
  type Paper,
  type LiteratureReviewInput,
  type LiteratureReviewOutput,
} from "./knowledge/literature-review"

export {
  FactCheckSkill,
  type Source as FactCheckSource,
  type FactCheckInput,
  type FactCheckOutput,
} from "./knowledge/fact-check"

export {
  SynthesisSkill,
  type Document as SynthesisDocument,
  type SynthesisInput,
  type SynthesisOutput,
} from "./knowledge/synthesis"

export {
  CriticalAnalysisSkill,
  type CriticalAnalysisInput,
  type CriticalAnalysisOutput,
} from "./knowledge/critical-analysis"

// Nutrition Agency Skills
export {
  DietPlanSkill,
  type Profile,
  type Goal,
  type MealPlan,
  type Meal,
  type Macros as DietMacros,
} from "./nutrition/diet-plan"

export { NutritionAnalysisSkill, type Macros as NutritionMacros } from "./nutrition/nutrition-analysis"

export { FoodRecallSkill, type Recall } from "./nutrition/food-recall"

export {
  RecipeSearchSkill,
  type Filter,
  type Recipe,
  type Nutrition as RecipeNutrition,
} from "./nutrition/recipe-search"

// Weather Agency Skills
export { WeatherForecastSkill, type DayForecast } from "./weather/weather-forecast"

export { WeatherAlertsSkill, type Alert } from "./weather/weather-alerts"

export { WeatherCurrentSkill, type Current } from "./weather/weather-current"

// NBA Betting Agency Skills
export { NbaAnalysisSkill, type NbaAnalysisInput, type NbaAnalysisOutput } from "./nba"

// Aggregate exports for agency registration
import { CodeReviewSkill } from "./development/code-review"
import { DebuggingSkill } from "./development/debugging"
import { TddSkill } from "./development/tdd"
import { ComparisonSkill } from "./development/comparison"
import { DocumentAnalysisSkill } from "./development/document-analysis"
import { SimplificationSkill } from "./development/simplification"
import { WebResearchSkill } from "./knowledge/web-research"
import { LiteratureReviewSkill } from "./knowledge/literature-review"
import { FactCheckSkill } from "./knowledge/fact-check"
import { SynthesisSkill } from "./knowledge/synthesis"
import { CriticalAnalysisSkill } from "./knowledge/critical-analysis"
import { DietPlanSkill } from "./nutrition/diet-plan"
import { NutritionAnalysisSkill } from "./nutrition/nutrition-analysis"
import { FoodRecallSkill } from "./nutrition/food-recall"
import { RecipeSearchSkill } from "./nutrition/recipe-search"
import { WeatherForecastSkill } from "./weather/weather-forecast"
import { WeatherAlertsSkill } from "./weather/weather-alerts"
import { WeatherCurrentSkill } from "./weather/weather-current"
import { NbaAnalysisSkill } from "./nba"
import type { Skill } from "../skill"

// Development agency skills
export const developmentSkills: Skill[] = [
  CodeReviewSkill,
  DebuggingSkill,
  TddSkill,
  ComparisonSkill,
  DocumentAnalysisSkill,
  SimplificationSkill,
]

// Knowledge agency skills
export const knowledgeSkills: Skill[] = [
  WebResearchSkill,
  LiteratureReviewSkill,
  FactCheckSkill,
  SynthesisSkill,
  CriticalAnalysisSkill,
]

// Nutrition agency skills
export const nutritionSkills: Skill[] = [DietPlanSkill, NutritionAnalysisSkill, FoodRecallSkill, RecipeSearchSkill]

// Weather agency skills
export const weatherSkills: Skill[] = [WeatherForecastSkill, WeatherAlertsSkill, WeatherCurrentSkill]

// All Wave 1 skills
export const allWave1Skills: Skill[] = [...developmentSkills, ...knowledgeSkills]

// All Wave 2 skills
export const allWave2Skills: Skill[] = [...nutritionSkills, ...weatherSkills]

// Wave 3: NBA Betting Agency skills
export const nbaSkills: Skill[] = [NbaAnalysisSkill]

// All skills combined
export const allSkills: Skill[] = [...allWave1Skills, ...allWave2Skills, ...nbaSkills]

// Skill count constants
export const DEVELOPMENT_SKILL_COUNT = developmentSkills.length
export const KNOWLEDGE_SKILL_COUNT = knowledgeSkills.length
export const NUTRITION_SKILL_COUNT = nutritionSkills.length
export const WEATHER_SKILL_COUNT = weatherSkills.length
export const NBA_SKILL_COUNT = nbaSkills.length
export const TOTAL_WAVE1_SKILL_COUNT = allWave1Skills.length
export const TOTAL_WAVE2_SKILL_COUNT = allWave2Skills.length
export const TOTAL_SKILL_COUNT = allSkills.length
