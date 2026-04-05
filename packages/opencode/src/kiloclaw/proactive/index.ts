// Kiloclaw Proactive - Barrel exports

// Trigger system
export {
  TriggerEvaluator,
  Trigger,
  DEFAULT_TRIGGERS,
  type TriggerCondition,
  type TriggerEvent,
  type MatchingResult,
} from "./trigger"
export { TriggerSignal, ProactionType } from "./trigger"

// Budget manager
export { BudgetManager, BudgetManager$, Budget, type ProactiveBudget, type BudgetStats } from "./budget"

// Scheduler
export {
  ProactiveScheduler,
  ProactiveScheduler$,
  Scheduler,
  type ScheduledTask,
  type SchedulerEvent,
  type EvaluationResult,
} from "./scheduler"

// Scheduler Store (Phase 2 - persistence)
export {
  ProactiveTaskStore,
  PROACTIVE_TABLES_SQL,
  type ProactiveTask,
  type ProactiveTaskRun,
  type ProactiveDlqEntry,
  type CreateTaskInput,
  type UpdateTaskInput,
  type RecordRunInput,
  type MoveToDLQInput,
  TaskStatus,
  RunOutcome,
} from "./scheduler.store"

// Scheduler Engine (Phase 2 - persistent dispatcher)
export {
  ProactiveSchedulerEngine,
  ProactiveSchedulerEngine$,
  DefaultPolicyGate,
  type SchedulerEngineConfig,
  type SchedulerEngineStats,
  type GateResult,
  type ExecutionContext,
  type TaskExecutor,
  type PolicyGate,
} from "./scheduler.engine"

// Policy Gate (Phase 2 - unified gate)
export {
  ProactivePolicyGate,
  ProactivePolicyGate$,
  PolicyGateHelpers,
  RiskLevel,
  type GateDecision,
  type PolicyGateConfig,
  type HitlCheckpoint,
} from "./policy-gate"

// Limits
export {
  ProactivityLimitsManager,
  ProactivityLimitsManager$,
  ProactivityLimits,
  ProactivityLimitsSchema,
  ConfirmationMode,
  DEFAULT_PROACTIVITY_LIMITS,
  type ProactivityPolicy,
} from "./limits"

// Explainability (Phase 4 - explain.ts)
export { ProactionExplainer, ProactionExplainer$ } from "./explain"
export type { ProactionExplanation, BudgetSummary, ExplainContext as ProactionExplainContext } from "./explain"

// User Controls (Phase 4 - user-controls.ts)
export {
  ProactiveUserControls,
  OverrideLevel,
  setQuietHours,
  getQuietHours,
  setOverride,
  getOverride,
  setKillSwitch,
  isKillSwitchEnabled,
  isQuietHours,
  getUserControls,
} from "./user-controls"
export type { ProactiveUserControls as UserControls } from "./user-controls"

// Suggest-Then-Act (Phase 4 - suggest-then-act.ts)
export {
  SuggestThenAct,
  createSuggestion,
  acceptSuggestion,
  rejectSuggestion,
  getSuggestion,
  getPendingSuggestions,
  expireSuggestions,
} from "./suggest-then-act"
export type {
  Suggestion,
  SuggestionStatus,
  SuggestionRationale,
  BudgetSummary as SuggestionBudgetSummary,
} from "./suggest-then-act"
