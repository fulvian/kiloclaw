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

// Durable runtime
export { TaskLedger, type LedgerTask, type TaskMeta, type TaskState, type ReconcileResult } from "./task-ledger"
export { SchedulerService, type SchedulerTaskInput, type SchedulerReconcile } from "./scheduler-service"
export { ProactiveWorker, type WorkerResult } from "./worker"
export { SqliteProactiveStore, type ProactiveStore, type StoreRecord } from "./store/sqlite"
export {
  SchedulePreset,
  ScheduleKind,
  DEFAULT_PRESET,
  presetToCron,
  isValidTimezone,
  validateCron,
  nextRuns,
} from "./schedule-parse"
export {
  DstPolicy,
  RetryBackoff,
  ConcurrencyPolicy,
  MissedRunPolicy,
  ApprovalPolicy,
  ScheduledTaskCreateSchema,
  ScheduledTaskUpdateSchema,
  buildCreate,
  buildUpdate,
  parseConfig,
  validateSchedule,
} from "./scheduled-task"

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

// Daemon runtime
export {
  DaemonRuntime,
  isSystemd,
  notifyReady,
  notifyStopping,
  notifyWatchdog,
  notifyStatus,
  type DaemonConfig,
  type DaemonFeatureFlags,
  type DaemonHealthSnapshot,
  type DaemonMetrics,
  type DaemonState,
} from "./runtime"
