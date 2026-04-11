// Agency module barrel exports
export {
  AgencyCatalog,
  getCatalog,
  type Provider,
  type SearchQuery,
  type SearchResult,
  type ExtractedContent,
} from "./catalog"
export { CatalogEntryType, type CatalogEntry } from "./catalog"
export { type AgencyInfo } from "../agency"

// Bootstrap
export { bootstrapRegistries, isBootstrapped, getBootstrapStats, lazyBootstrapRegistries } from "./bootstrap"
export { KeyPool, KeyManager, withKeyRotation, type RateLimitConfig, type ApiKeyState } from "./key-pool"

// Lazy Registry (Phase 8: Dynamic Multi-Level Routing)
export {
  setLazyBootstrap,
  ensureRegistryInitialized,
  isRegistryInitialized,
  getAllRegistryStatuses,
  getRegistryStatus,
  LazyLoader,
} from "./lazy-registry"
export type { RegistryStatus } from "./lazy-registry"

// Routing Pipeline (Phase 8: Dynamic Multi-Level Routing)
export {
  RoutingPipeline,
  type L0Result,
  type L1Result,
  type L2Result,
  type L3Result,
  type PipelineResult,
} from "./routing/pipeline"

// LRU Cache for Performance (Phase 8: PR-9 Performance Hardening)
export {
  LRUCache,
  getRouterCache,
  getCapabilityCache,
  resetRouterCache,
  resetCapabilityCache,
} from "./routing/lru-cache"

// Manifest Discovery (Phase 8: Dynamic Multi-Level Routing)
export { ManifestLoader, type ManifestType } from "./manifests"
export {
  CompatibilityContractSchema,
  ManifestHeaderSchema,
  AgencyManifestSchema,
  SkillManifestSchema,
  AgentManifestSchema,
  ChainManifestSchema,
  ManifestIndexSchema,
  isCompatible,
  type CompatibilityContract,
  type ManifestHeader,
  type AgencyManifest,
  type SkillManifest,
  type AgentManifest,
  type ChainManifest,
  type ManifestIndex,
  type ChainStepManifest,
  type AgencyPoliciesManifest,
} from "./manifests"

// NBA schema
export {
  CONFIDENCE_CAP,
  SourceSchema,
  OddsSourceSchema,
  MarketSchema,
  GameStatusSchema,
  FreshnessStateSchema,
  RecommendationActionSchema,
  RecommendationPolicySchema,
  GameSchema,
  OddsSchema,
  SignalSchema,
  RecommendationSchema,
  capConfidence,
  hasVigRemovalPreconditions,
  StaleRecommendationInputSchema,
  shouldBlockStaleRecommendation,
  type Game,
  type Odds,
  type Signal,
  type Recommendation,
} from "./nba/schema"
export {
  NbaRuntime,
  Agency2RequestStarted,
  Agency2RequestCompleted,
  Agency2PolicyDecision,
  Agency2SignalEmitted,
  NbaDecisionOutcomeSchema,
  NbaPolicyDecisionSchema,
  NbaRequestStartedSchema,
  NbaRequestCompletedSchema,
  NbaSignalEventSchema,
  NbaDecisionInputSchema,
  type NbaPolicyDecision,
  type NbaRequestStarted,
  type NbaRequestCompleted,
  type NbaSignalEvent,
} from "./nba/runtime"
export {
  NbaBudgeting,
  NbaToolMetadataSchema,
  NbaBudgetingInputSchema,
  NbaBudgetMetricsSchema,
  NbaBudgetingResultSchema,
  type NbaToolMetadata,
  type NbaBudgetingInput,
  type NbaBudgetingResult,
} from "./nba/budgeting"
export {
  ODDS_API_MAX_AGE_SECONDS,
  PARLAY_MAX_AGE_SECONDS,
  POLYMARKET_MAX_AGE_SECONDS,
  ESPN_SCOREBOARD_LIVE_MAX_AGE_SECONDS,
  ESPN_INJURIES_MAX_AGE_SECONDS,
  BALLDONTLIE_GAMES_MAX_AGE_SECONDS,
  BALLDONTLIE_STATS_MAX_AGE_SECONDS,
  NBA_API_ADVANCED_MAX_AGE_SECONDS,
  NbaFreshnessSourceSchema,
  NbaFreshnessAssessmentSchema,
  ProviderErrorCategorySchema,
  BackoffInputSchema,
  NbaCircuitBreaker,
  NbaCircuitBreakerConfigSchema,
  NbaCircuitBreakerSnapshotSchema,
  MarketPlanInputSchema,
  MarketPlanResultSchema,
  ProviderCallOutcomeSchema,
  NbaProviderCallSchema,
  Agency2ProviderCall,
  assessFreshness,
  classifyProviderError,
  computeBackoffMs,
  selectMarketPlan,
} from "./nba/resilience"
export {
  CALIBRATION_ISOTONIC_MIN_SAMPLE,
  CalibrationPointSchema,
  ReliabilityBucketSchema,
  EdgeOutcomeSchema,
  computeBrier,
  computeLogLoss,
  buildReliabilityBuckets,
  chooseCalibrationMethod,
  computePrecisionAtEdgeThreshold,
  type CalibrationPoint,
  type ReliabilityBucket,
  type EdgeOutcome,
} from "./nba/calibration"
export {
  NBA_ROLLOUT_TARGETS,
  NbaRolloutTargetSchema,
  NbaGateInputSchema,
  NbaGateReportSchema,
  evaluateNbaRolloutGate,
} from "./nba/gates"
export { NbaChaosInputSchema, NbaChaosReportSchema, evaluateNbaChaosScenario } from "./nba/chaos"

// =============================================================================
// DEPRECATED EXPORTS - Use new Flexible* types and registries instead
// Migration: See packages/opencode/src/kiloclaw/agency/registry/
// =============================================================================
/**
 * @deprecated Use FlexibleAgentRegistry from "./registry/agent-registry" instead.
 * The old AgentRegistry uses TaskType-based routing which is being replaced.
 */
export {
  AgentRegistry,
  getAgentRegistry,
  AgentDefinitionSchema,
  TaskType,
  SkillName,
  AgencyName,
  type AgentDefinition,
} from "./types"
// =============================================================================

// Routing types (Phase 1: Flexible Agency Architecture)
export {
  TaskIntentSchema,
  RouteResultSchema,
  migrateLegacyTaskType,
  LegacyTaskTypeMigration,
  type TaskIntent,
  type RouteResult,
} from "./routing/types"

// Registry types (Phase 1: Flexible Agency Architecture)
export {
  SkillDefinitionSchema,
  SkillChainSchema,
  SkillChainStepSchema,
  AgencyDefinitionSchema,
  AgencyPoliciesSchema,
  FlexibleAgentDefinitionSchema,
  AgentConstraintsSchema,
  type SkillDefinition,
  type SkillChain,
  type SkillChainStep,
  type AgencyDefinition,
  type AgencyPolicies,
  type FlexibleAgentDefinition,
  type AgentConstraints,
} from "./registry/types"

// Phase 2: Core Registries
export { SkillRegistry } from "./registry/skill-registry"
export { FlexibleAgentRegistry } from "./registry/agent-registry"
export { AgencyRegistry } from "./registry/agency-registry"
export { ChainRegistry } from "./registry/chain-registry"

// Phase 3: CapabilityRouter
export { CapabilityRouter } from "./routing/capability-router"
export { CapabilityRouterError, CapabilityDeniedError, NoMatchingCapabilityError } from "./routing/capability-router"

// Phase 4: ChainComposer
export { ChainComposer, ChainCompositionError } from "./routing/chain-composer"

// Chain Executor
export {
  executeChain,
  executeChainForCapabilities,
  executeBestChain,
  listChains,
  getChain,
  type ChainExecutionResult,
  type ChainStepResult,
} from "./chain-executor"

// Phase 5: IntentClassifier
export { IntentClassifier } from "./routing/intent-classifier"

// Phase 6: Semantic Router v2 - Capability-Based Dynamic Routing
export {
  SemanticRouter,
  getSemanticRouter,
  CapabilityRegistry,
  getCapabilityRegistry,
  CapabilityExtractor,
  HybridRouter,
  bootstrapAllCapabilities,
  bootstrapWithEmbeddings,
  bootstrapCapabilitiesFromSkills,
  type SemanticIntent,
  type RoutingResult,
  type DomainDetectionResult,
  type CapabilityMatchingResult,
  type SkillSelectionResult,
  type ToolResolutionResult,
  type SemanticRouterConfig,
  type CapabilityDescriptor,
  type CapabilityMatch,
  type CapabilityConstraints,
  type HybridRoutingResult,
  type HybridIntentRouter,
  DEFAULT_SEMANTIC_ROUTER_CONFIG,
  ROUTING_THRESHOLDS,
} from "./routing/semantic"

// AgentFactory
export { AgentFactory } from "./factory"

// Agents
export { researcherAgentDefinition, ResearcherAgent } from "./agents/researcher"
export { coderAgentDefinition, CoderAgent } from "./agents/coder"
export { nutritionistAgentDefinition, NutritionistAgent } from "./agents/nutritionist"
export { weatherCurrentAgentDefinition, WeatherCurrentAgent } from "./agents/weather-current"
export { educatorAgentDefinition, EducatorAgent } from "./agents/educator"
export { analystAgentDefinition, AnalystAgent } from "./agents/analyst"
export { codeReviewerAgentDefinition, CodeReviewerAgent } from "./agents/code-reviewer"
export { debuggerAgentDefinition, DebuggerAgent } from "./agents/debugger"
export { plannerAgentDefinition, PlannerAgent } from "./agents/planner"
export { recipeSearcherAgentDefinition, RecipeSearcherAgent } from "./agents/recipe-searcher"
export { dietPlannerAgentDefinition, DietPlannerAgent } from "./agents/diet-planner"
export { forecasterAgentDefinition, ForecasterAgent } from "./agents/forecaster"
export { alerterAgentDefinition, AlerterAgent } from "./agents/alerter"
