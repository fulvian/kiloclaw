// kilocode_change - renamed all OPENCODE_ env vars to KILO_
function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

function falsy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "false" || value === "0"
}

export namespace Flag {
  export const KILO_AUTO_SHARE = truthy("KILO_AUTO_SHARE")
  export const KILO_GIT_BASH_PATH = process.env["KILO_GIT_BASH_PATH"]
  export const KILO_CONFIG = process.env["KILO_CONFIG"]
  export declare const KILO_TUI_CONFIG: string | undefined
  export declare const KILO_CONFIG_DIR: string | undefined
  export const KILO_CONFIG_CONTENT = process.env["KILO_CONFIG_CONTENT"]
  export const KILO_DISABLE_AUTOUPDATE = truthy("KILO_DISABLE_AUTOUPDATE")
  export const KILO_DISABLE_PRUNE = truthy("KILO_DISABLE_PRUNE")
  export const KILO_DISABLE_TERMINAL_TITLE = truthy("KILO_DISABLE_TERMINAL_TITLE")
  export const KILO_PERMISSION = process.env["KILO_PERMISSION"]
  export const KILO_DISABLE_DEFAULT_PLUGINS = truthy("KILO_DISABLE_DEFAULT_PLUGINS")
  export const KILO_DISABLE_LSP_DOWNLOAD = truthy("KILO_DISABLE_LSP_DOWNLOAD")
  export const KILO_ENABLE_EXPERIMENTAL_MODELS = truthy("KILO_ENABLE_EXPERIMENTAL_MODELS")
  export const KILO_DISABLE_AUTOCOMPACT = truthy("KILO_DISABLE_AUTOCOMPACT")
  export const KILO_DISABLE_MODELS_FETCH = truthy("KILO_DISABLE_MODELS_FETCH")
  export const KILO_DISABLE_CLAUDE_CODE = truthy("KILO_DISABLE_CLAUDE_CODE")
  export const KILO_DISABLE_CLAUDE_CODE_PROMPT = KILO_DISABLE_CLAUDE_CODE || truthy("KILO_DISABLE_CLAUDE_CODE_PROMPT")
  export const KILO_DISABLE_CLAUDE_CODE_SKILLS = KILO_DISABLE_CLAUDE_CODE || truthy("KILO_DISABLE_CLAUDE_CODE_SKILLS")
  export const KILO_DISABLE_EXTERNAL_SKILLS = KILO_DISABLE_CLAUDE_CODE_SKILLS || truthy("KILO_DISABLE_EXTERNAL_SKILLS")
  export const KILO_DISABLE_KILOCODE_LEGACY = truthy("KILO_DISABLE_KILOCODE_LEGACY")
  export declare const KILO_DISABLE_PROJECT_CONFIG: boolean
  export const KILO_FAKE_VCS = process.env["KILO_FAKE_VCS"]
  export declare const KILO_CLIENT: string
  export const KILO_SERVER_PASSWORD = process.env["KILO_SERVER_PASSWORD"]
  export const KILO_SERVER_USERNAME = process.env["KILO_SERVER_USERNAME"]
  export const KILO_ENABLE_QUESTION_TOOL = truthy("KILO_ENABLE_QUESTION_TOOL")

  // Experimental
  export const KILO_EXPERIMENTAL = truthy("KILO_EXPERIMENTAL")
  export const KILO_EXPERIMENTAL_FILEWATCHER = truthy("KILO_EXPERIMENTAL_FILEWATCHER")
  export const KILO_EXPERIMENTAL_DISABLE_FILEWATCHER = truthy("KILO_EXPERIMENTAL_DISABLE_FILEWATCHER")
  export const KILO_EXPERIMENTAL_ICON_DISCOVERY = KILO_EXPERIMENTAL || truthy("KILO_EXPERIMENTAL_ICON_DISCOVERY")

  const copy = process.env["KILO_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
  export const KILO_EXPERIMENTAL_DISABLE_COPY_ON_SELECT =
    copy === undefined ? process.platform === "win32" : truthy("KILO_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
  export const KILO_ENABLE_EXA = truthy("KILO_ENABLE_EXA") || KILO_EXPERIMENTAL || truthy("KILO_EXPERIMENTAL_EXA")
  export const KILO_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = number("KILO_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS")
  export const KILO_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("KILO_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
  export const KILO_EXPERIMENTAL_OXFMT = KILO_EXPERIMENTAL || truthy("KILO_EXPERIMENTAL_OXFMT")
  export const KILO_EXPERIMENTAL_LSP_TY = truthy("KILO_EXPERIMENTAL_LSP_TY")
  export const KILO_EXPERIMENTAL_LSP_TOOL = KILO_EXPERIMENTAL || truthy("KILO_EXPERIMENTAL_LSP_TOOL")
  export const KILO_DISABLE_FILETIME_CHECK = truthy("KILO_DISABLE_FILETIME_CHECK")
  export const KILO_EXPERIMENTAL_PLAN_MODE = KILO_EXPERIMENTAL || truthy("KILO_EXPERIMENTAL_PLAN_MODE")
  export const KILO_EXPERIMENTAL_WORKSPACES_TUI = KILO_EXPERIMENTAL || truthy("KILO_EXPERIMENTAL_WORKSPACES_TUI")
  export const KILO_EXPERIMENTAL_MARKDOWN = !falsy("KILO_EXPERIMENTAL_MARKDOWN")
  // kilocode_change - memory V2 enabled by default, disable with KILO_EXPERIMENTAL_MEMORY_V2=false
  export const KILO_EXPERIMENTAL_MEMORY_V2 = !falsy("KILO_EXPERIMENTAL_MEMORY_V2")
  export const KILO_MEMORY_RECALL_POLICY_V1 = !falsy("KILO_MEMORY_RECALL_POLICY_V1")
  export const KILO_MEMORY_RECALL_TRI_STATE = !falsy("KILO_MEMORY_RECALL_TRI_STATE")
  export const KILO_MEMORY_SHADOW_MODE = truthy("KILO_MEMORY_SHADOW_MODE")
  export const KILO_MEMORY_INTENT_CLASSIFIER_V1 = truthy("KILO_MEMORY_INTENT_CLASSIFIER_V1")
  export const KILO_MEMORY_MULTILINGUAL_RECALL = truthy("KILO_MEMORY_MULTILINGUAL_RECALL")
  export const KILO_MEMORY_PROACTIVE_INJECTION_V1 = !falsy("KILO_MEMORY_PROACTIVE_INJECTION_V1")
  export const KILO_MEMORY_BUDGET_ENFORCER_V1 = !falsy("KILO_MEMORY_BUDGET_ENFORCER_V1")
  export const KILO_MEMORY_EXTRACTOR_V2 = truthy("KILO_MEMORY_EXTRACTOR_V2")
  export const KILO_MODELS_URL = process.env["KILO_MODELS_URL"]
  export const KILO_MODELS_PATH = process.env["KILO_MODELS_PATH"]
  export const KILO_SKIP_MIGRATIONS = truthy("KILO_SKIP_MIGRATIONS")

  function number(key: string) {
    const value = process.env[key]
    if (!value) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }

  export const KILO_SESSION_RETRY_LIMIT = number("KILO_SESSION_RETRY_LIMIT")

  // Knowledge agency settings
  // kilocode_change start
  export const KILOCLAW_KNOWLEDGE_FORCE_PROVIDER = process.env["KILOCLAW_KNOWLEDGE_FORCE_PROVIDER"]
  // kilocode_change end

  // Semantic Memory Trigger (Phase 1 - Deprecate Keyword-based Recall)
  // kilocode_change start
  // Disabled by default - set KILOCLAW_SEMANTIC_TRIGGER_V1=true to enable
  export const KILOCLAW_SEMANTIC_TRIGGER_V1 = truthy("KILOCLAW_SEMANTIC_TRIGGER_V1")
  export const KILOCLAW_SEMANTIC_TRIGGER_BM25_FALLBACK = !falsy("KILOCLAW_SEMANTIC_TRIGGER_BM25_FALLBACK")
  export const KILOCLAW_SEMANTIC_THRESHOLD_RECALL = number("KILOCLAW_SEMANTIC_THRESHOLD_RECALL") ?? 0.42
  export const KILOCLAW_SEMANTIC_THRESHOLD_SHADOW = number("KILOCLAW_SEMANTIC_THRESHOLD_SHADOW") ?? 0.28
  export const KILOCLAW_SEMANTIC_EPISODES_COUNT = number("KILOCLAW_SEMANTIC_EPISODES_COUNT") ?? 20
  // Hybrid Retriever weights (ReMe paper: Vector 0.7 + BM25 0.3)
  export const KILOCLAW_HYBRID_VECTOR_WEIGHT = number("KILOCLAW_HYBRID_VECTOR_WEIGHT") ?? 0.7
  export const KILOCLAW_HYBRID_BM25_WEIGHT = number("KILOCLAW_HYBRID_BM25_WEIGHT") ?? 0.3
  // kilocode_change end

  // Routing Dynamic Multi-Level SOTA 2026
  // kilocode_change start
  export const KILO_ROUTING_DYNAMIC_ENABLED = !falsy("KILO_ROUTING_DYNAMIC_ENABLED")
  export const KILO_ROUTING_SHADOW_ENABLED = truthy("KILO_ROUTING_SHADOW_ENABLED")
  export const KILO_ROUTING_MANIFEST_ENABLED = truthy("KILO_ROUTING_MANIFEST_ENABLED")
  // Enabled by default - set KILO_ROUTING_AGENCY_CONTEXT_ENABLED=false to disable
  export const KILO_ROUTING_AGENCY_CONTEXT_ENABLED = !falsy("KILO_ROUTING_AGENCY_CONTEXT_ENABLED")

  // Performance tuning flags
  export const KILO_ROUTING_LRU_ENABLED = !falsy("KILO_ROUTING_LRU_ENABLED")
  export const KILO_ROUTING_CACHE_TTL_MS = number("KILO_ROUTING_CACHE_TTL_MS") ?? 60_000 // 1 minute default
  export const KILO_ROUTING_CAPABILITY_CACHE_TTL_MS = number("KILO_ROUTING_CAPABILITY_CACHE_TTL_MS") ?? 300_000 // 5 minutes default
  export const KILO_ROUTING_MANIFEST_CACHE_TTL_MS = number("KILO_ROUTING_MANIFEST_CACHE_TTL_MS") ?? 60_000 // 1 minute default

  // Semantic Router v2 - Capability-Based Dynamic Routing
  // Enabled by default - set KILO_SEMANTIC_ROUTING_ENABLED=false to disable
  export const KILO_SEMANTIC_ROUTING_ENABLED = !falsy("KILO_SEMANTIC_ROUTING_ENABLED")
  export const KILO_SEMANTIC_ROUTING_THRESHOLD = number("KILO_SEMANTIC_ROUTING_THRESHOLD") ?? 0.5
  export const KILO_SEMANTIC_ROUTING_FALLBACK_TO_KEYWORD = !falsy("KILO_SEMANTIC_ROUTING_FALLBACK_TO_KEYWORD")
  // kilocode_change end

  // =============================================================================
  // Scheduled Tasks UX (Phase 1-5)
  // =============================================================================

  // Enable/disable scheduled tasks slash command and TUI
  // Enabled by default - set KILOCLAW_SCHEDULED_TASKS_ENABLED=false to disable
  export const KILOCLAW_SCHEDULED_TASKS_ENABLED = !falsy("KILOCLAW_SCHEDULED_TASKS_ENABLED")

  // Enable/disable interactive wizard (Phase 2)
  // Default follows KILOCLAW_SCHEDULED_TASKS_ENABLED
  export const KILOCLAW_SCHEDULED_TASKS_WIZARD_ENABLED =
    truthy("KILOCLAW_SCHEDULED_TASKS_WIZARD_ENABLED") || KILOCLAW_SCHEDULED_TASKS_ENABLED

  // Enable/disable management views (Phase 3 - list, detail, runs, DLQ)
  // Default follows KILOCLAW_SCHEDULED_TASKS_ENABLED
  export const KILOCLAW_SCHEDULED_TASKS_VIEWS_ENABLED =
    truthy("KILOCLAW_SCHEDULED_TASKS_VIEWS_ENABLED") || KILOCLAW_SCHEDULED_TASKS_ENABLED

  // Telemetry/opt-out for scheduled tasks UX
  // Disabled by default (opt-in)
  export const KILOCLAW_SCHEDULED_TASKS_TELEMETRY = truthy("KILOCLAW_SCHEDULED_TASKS_TELEMETRY")

  // Draft TTL in days (default 7)
  export const KILOCLAW_SCHEDULED_TASKS_DRAFT_TTL_DAYS = number("KILOCLAW_SCHEDULED_TASKS_DRAFT_TTL_DAYS") ?? 7

  // Daemon runtime - disabled by default, enable with KILOCLAW_DAEMON_RUNTIME_ENABLED=true
  // Semantics: KILOCLAW_DAEMON_RUNTIME_ENABLED env var must be "true" (or "1") to enable.
  // This is a secure default - daemon will not run unless explicitly opted in.
  // The daemon loader (daemon.ts) uses a softer check (env !== "false") for internal
  // testing flexibility, but the public Flag interface requires explicit opt-in.
  export const KILOCLAW_DAEMON_RUNTIME_ENABLED = truthy("KILOCLAW_DAEMON_RUNTIME_ENABLED")

  // =============================================================================
  // Scheduled Tasks Enhancement (Phases 0-5)
  // =============================================================================

  // Phase 0: Instrument - metrics, timeline fields, dual timestamps
  export const KILOCLAW_TASK_TIMELINE_V1 = truthy("KILOCLAW_TASK_TIMELINE_V1")

  // Phase 1: Correct schedule engine - timezone-aware post-run recompute
  export const KILOCLAW_SCHEDULER_NEXTRUN_UNIFIED = truthy("KILOCLAW_SCHEDULER_NEXTRUN_UNIFIED")

  // Phase 2: State machine + archive UX - durable states, completed/archived surfaces
  export const KILOCLAW_TASK_STATE_V2 = truthy("KILOCLAW_TASK_STATE_V2")

  // Phase 3: Real run/replay actions - replace placeholders with execution intents
  export const KILOCLAW_TASK_ACTIONS_EXEC = truthy("KILOCLAW_TASK_ACTIONS_EXEC")

  // Phase 4: Notifications - channel fanout (toast, webhook, email)
  export const KILOCLAW_TASK_NOTIFY_V1 = truthy("KILOCLAW_TASK_NOTIFY_V1")

  // =============================================================================
  // Native Factory - Capability-based Native-First Routing
  // =============================================================================

  // Enable NativeFactory for capability-gated operations (default: true - GA)
  export const KILO_NATIVE_FACTORY_ENABLED = !falsy("KILO_NATIVE_FACTORY_ENABLED")

  // Shadow mode for native factory (logs only, no user impact) - disabled in GA
  export const KILO_NATIVE_FACTORY_SHADOW = truthy("KILO_NATIVE_FACTORY_SHADOW")

  // Canary percentage for gradual rollout (0-100, default: 100 - GA)
  export const KILO_NATIVE_FACTORY_CANARY_PERCENT = number("KILO_NATIVE_FACTORY_CANARY_PERCENT") ?? 100

  // =============================================================================
  // LLM Wiki - CONDITIONAL-GO, default OFF until guardrails and parity gates
  // KILOCLAW_DEVELOPMENT_AGENCY_REFOUNDATION_PLAN_2026-04-12.md
  // =============================================================================

  // Master kill-switch for wiki capability (wiki.ingest, wiki.query, wiki.lint)
  // Default: OFF until CONDITIONAL-GO decision after parity >= 99%
  export const KILO_WIKI_ENABLED = truthy("KILO_WIKI_ENABLED")

  // Wiki L4 context budget per step (tokens)
  export const KILO_WIKI_CONTEXT_BUDGET_PER_STEP = number("KILO_WIKI_CONTEXT_BUDGET_PER_STEP") ?? 4096

  // Wiki L4 context budget per run (tokens)
  export const KILO_WIKI_CONTEXT_BUDGET_PER_RUN = number("KILO_WIKI_CONTEXT_BUDGET_PER_RUN") ?? 8192

  // Wiki lint: block ingest on high-severity conflicts
  export const KILO_WIKI_LINT_BLOCK_CONFLICTS = !falsy("KILO_WIKI_LINT_BLOCK_CONFLICTS")

  // Wiki provenance: require citation in every query output
  export const KILO_WIKI_PROVENANCE_REQUIRED = truthy("KILO_WIKI_PROVENANCE_REQUIRED")
}

// Dynamic getter for KILO_DISABLE_PROJECT_CONFIG
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "KILO_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("KILO_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for KILO_TUI_CONFIG
// This must be evaluated at access time, not module load time,
// because tests and external tooling may set this env var at runtime
Object.defineProperty(Flag, "KILO_TUI_CONFIG", {
  get() {
    return process.env["KILO_TUI_CONFIG"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for KILO_CONFIG_DIR
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "KILO_CONFIG_DIR", {
  get() {
    return process.env["KILO_CONFIG_DIR"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for KILO_CLIENT
// This must be evaluated at access time, not module load time,
// because some commands override the client at runtime
Object.defineProperty(Flag, "KILO_CLIENT", {
  get() {
    return process.env["KILO_CLIENT"] ?? "cli"
  },
  enumerable: true,
  configurable: false,
})
