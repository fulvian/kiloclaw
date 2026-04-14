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

export {
  FinishingBranchSkill,
  type FinishingBranchInput,
  type FinishingBranchOutput,
  type BranchCheck,
} from "./development/finishing-branch"

export {
  GitWorktreeSkill,
  type GitWorktreeInput,
  type GitWorktreeOutput,
  type WorktreeInfo,
} from "./development/git-worktree"

export {
  AntiPatternsSkill,
  type AntiPatternsInput,
  type AntiPatternsOutput,
  type AntiPatternIssue,
} from "./development/anti-patterns"

export { YagniSkill, type YagniInput, type YagniOutput, type YagniFinding } from "./development/yagni"

export {
  PerformanceOptimizationSkill,
  type PerformanceInput,
  type PerformanceOutput,
  type Bottleneck,
  type OptimizationSuggestion,
} from "./development/performance-optimization"

export {
  DatabaseDesignSkill,
  type DatabaseDesignInput,
  type DatabaseDesignOutput,
  type EntityDefinition,
  type FieldDefinition,
  type SchemaDefinition,
  type Relationship,
} from "./development/database-design"

export {
  ApiDevelopmentSkill,
  type ApiDevelopmentInput,
  type ApiDevelopmentOutput,
  type ApiSpec,
  type ResourceDefinition,
  type Operation,
  type Endpoint,
  type SchemaDefinition as ApiSchemaDefinition,
} from "./development/api-development"

export {
  VisualCompanionSkill,
  type VisualCompanionInput,
  type VisualCompanionOutput,
  type DesignObservation,
  type DesignSuggestion,
} from "./development/visual-companion"

export {
  SpecDrivenSkill,
  type SpecDrivenInput,
  type SpecDrivenOutput,
  type Specification,
  type AcceptanceCriterion,
  type TestCase,
} from "./development/spec-driven"

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

export {
  DeepResearchSkill,
  type DeepResearchInput,
  type DeepResearchOutput,
  type ResearchFinding,
  type ResearchSource,
  type ResearchGap,
} from "./knowledge/deep-research"

export {
  TavilyResearchSkill,
  type TavilyResearchInput,
  type TavilyResearchOutput,
  type TavilyResult,
} from "./knowledge/tavily-research"

export {
  ContextEngineeringSkill,
  type ContextEngineeringInput,
  type ContextEngineeringOutput,
  type ContextMetadata,
} from "./knowledge/context-engineering"

export {
  KnowledgeGraphMemorySkill,
  type KnowledgeGraphMemoryInput,
  type KnowledgeGraphMemoryOutput,
  type GraphEntity,
  type GraphRelationship,
  type GraphAnalysis,
} from "./knowledge/knowledge-graph-memory"

// Meta Skills (Onda 4)
export {
  UsingSuperpowersSkill,
  type UsingSuperpowersInput,
  type UsingSuperpowersOutput,
} from "./meta/using-superpowers"

export { WritingSkillsSkill, type WritingSkillsInput, type WritingSkillsOutput } from "./meta/writing-skills"

export {
  BrainstormingSkill,
  type BrainstormingInput,
  type BrainstormingOutput,
  type BrainstormIdea,
} from "./meta/brainstorming"

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

// Finance Agency Skills
export {
  FinanceMarketDataSkill,
  type MarketDataInput,
  type MarketDataOutput,
  type PriceData,
  type HistoricalData,
  type OrderbookData,
  type FundamentalsData,
  type NewsData,
} from "./finance/market-data"

export {
  FinanceTechnicalAnalysisSkill,
  type TechnicalAnalysisInput,
  type TechnicalAnalysisOutput,
  type Signal as FinanceSignal,
  type Pattern as FinancePattern,
} from "./finance/technical-analysis"

export {
  FinanceRiskEngineSkill,
  type RiskEngineInput,
  type RiskEngineOutput,
  type Position,
  type RiskLimits,
  type Violation,
} from "./finance/risk-engine"

// Travel Agency Skills (Sprint 3)
// Placeholder - actual travel skills will be implemented in Sprint 3
export const travelSkills: Skill[] = []

// Aggregate exports for agency registration
import { CodeReviewSkill } from "./development/code-review"
import { DebuggingSkill } from "./development/debugging"
import { TddSkill } from "./development/tdd"
import { ComparisonSkill } from "./development/comparison"
import { DocumentAnalysisSkill } from "./development/document-analysis"
import { SimplificationSkill } from "./development/simplification"
import { FinishingBranchSkill } from "./development/finishing-branch"
import { GitWorktreeSkill } from "./development/git-worktree"
import { AntiPatternsSkill } from "./development/anti-patterns"
import { YagniSkill } from "./development/yagni"
import { PerformanceOptimizationSkill } from "./development/performance-optimization"
import { DatabaseDesignSkill } from "./development/database-design"
import { ApiDevelopmentSkill } from "./development/api-development"
import { VisualCompanionSkill } from "./development/visual-companion"
import { SpecDrivenSkill } from "./development/spec-driven"
import { WebResearchSkill } from "./knowledge/web-research"
import { LiteratureReviewSkill } from "./knowledge/literature-review"
import { FactCheckSkill } from "./knowledge/fact-check"
import { SynthesisSkill } from "./knowledge/synthesis"
import { CriticalAnalysisSkill } from "./knowledge/critical-analysis"
import { DeepResearchSkill } from "./knowledge/deep-research"
import { TavilyResearchSkill } from "./knowledge/tavily-research"
import { ContextEngineeringSkill } from "./knowledge/context-engineering"
import { KnowledgeGraphMemorySkill } from "./knowledge/knowledge-graph-memory"
import { UsingSuperpowersSkill } from "./meta/using-superpowers"
import { WritingSkillsSkill } from "./meta/writing-skills"
import { BrainstormingSkill } from "./meta/brainstorming"
import { DietPlanSkill } from "./nutrition/diet-plan"
import { NutritionAnalysisSkill } from "./nutrition/nutrition-analysis"
import { FoodRecallSkill } from "./nutrition/food-recall"
import { RecipeSearchSkill } from "./nutrition/recipe-search"
import { WeatherForecastSkill } from "./weather/weather-forecast"
import { WeatherAlertsSkill } from "./weather/weather-alerts"
import { WeatherCurrentSkill } from "./weather/weather-current"
import { NbaAnalysisSkill } from "./nba"
import { FinanceMarketDataSkill } from "./finance/market-data"
import { FinanceTechnicalAnalysisSkill } from "./finance/technical-analysis"
import { FinanceRiskEngineSkill } from "./finance/risk-engine"
import type { Skill } from "../skill"

// Development agency skills
export const developmentSkills: Skill[] = [
  CodeReviewSkill,
  DebuggingSkill,
  TddSkill,
  ComparisonSkill,
  DocumentAnalysisSkill,
  SimplificationSkill,
  FinishingBranchSkill,
  GitWorktreeSkill,
  AntiPatternsSkill,
  YagniSkill,
  PerformanceOptimizationSkill,
  DatabaseDesignSkill,
  ApiDevelopmentSkill,
  VisualCompanionSkill,
  SpecDrivenSkill,
]

// Knowledge agency skills
export const knowledgeSkills: Skill[] = [
  WebResearchSkill,
  LiteratureReviewSkill,
  FactCheckSkill,
  SynthesisSkill,
  CriticalAnalysisSkill,
  DeepResearchSkill,
  TavilyResearchSkill,
  ContextEngineeringSkill,
  KnowledgeGraphMemorySkill,
]

// Meta agency skills
export const metaSkills: Skill[] = [UsingSuperpowersSkill, WritingSkillsSkill, BrainstormingSkill]

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

// Wave 4: Finance Agency skills
export const financeSkills: Skill[] = [FinanceMarketDataSkill, FinanceTechnicalAnalysisSkill, FinanceRiskEngineSkill]

// All skills combined (including Onda 4 meta skills)
export const allSkills: Skill[] = [
  ...allWave1Skills,
  ...allWave2Skills,
  ...nbaSkills,
  ...financeSkills,
  ...metaSkills,
  ...travelSkills,
]

// Skill count constants
export const DEVELOPMENT_SKILL_COUNT = developmentSkills.length
export const KNOWLEDGE_SKILL_COUNT = knowledgeSkills.length
export const META_SKILL_COUNT = metaSkills.length
export const NUTRITION_SKILL_COUNT = nutritionSkills.length
export const WEATHER_SKILL_COUNT = weatherSkills.length
export const NBA_SKILL_COUNT = nbaSkills.length
export const FINANCE_SKILL_COUNT = financeSkills.length
export const TRAVEL_SKILL_COUNT = travelSkills.length
export const TOTAL_WAVE1_SKILL_COUNT = allWave1Skills.length
export const TOTAL_WAVE2_SKILL_COUNT = allWave2Skills.length
export const TOTAL_SKILL_COUNT = allSkills.length
