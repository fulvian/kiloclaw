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

// Limits
export {
  ProactivityLimitsManager,
  ProactivityLimitsManager$,
  ProactivityLimits,
  ProactivityLimitsSchema,
  ConfirmationMode,
  DEFAULT_PROACTIVITY_LIMITS,
  type ProactivityPolicy,
  type ProactivityLimits,
} from "./limits"
