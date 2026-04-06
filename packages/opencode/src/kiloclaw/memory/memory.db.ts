/**
 * Memory Database - Initialization and Setup
 * Auto-creates tables and initializes repository
 */

import { Database as BunDatabase } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import { initMemoryRepository, disposeMemoryRepository } from "./memory.repository.js"
import { MemoryRetention } from "./memory.retention.js"
import { mkdir } from "fs/promises"
import { dirname } from "path"

const log = Log.create({ service: "kiloclaw.memory.db" })

// Memory database path
const MEMORY_DB_PATH = ".kiloclaw/memory.db"

// =============================================================================
// Database Configuration (for PostgreSQL/SQLite abstraction)
// =============================================================================

export interface VectorIndexConfig {
  type: "hnsw" | "ivfflat"
  m: number // HNSW: connections per node (default 16)
  efConstruction: number // HNSW: build-time accuracy (default 64)
  lists: number // IVFFlat: number of clusters
}

export interface DatabaseConfig {
  provider: "sqlite" | "postgres"
  connectionString?: string
  vectorIndex?: VectorIndexConfig
}

/**
 * Memory database provider configuration
 */
export namespace MemoryDb {
  /**
   * Check if Memory V2 is enabled
   */
  export function isEnabled(): boolean {
    return Flag.KILO_EXPERIMENTAL_MEMORY_V2
  }

  /**
   * Get the database provider (sqlite or postgres)
   */
  export function getProvider(): "sqlite" | "postgres" {
    return (process.env["KILO_MEMORY_PROVIDER"] as "sqlite" | "postgres") ?? "sqlite"
  }

  /**
   * Get PostgreSQL connection string
   */
  export function getConnectionString(): string | undefined {
    return process.env["KILO_POSTGRES_CONNECTION_STRING"]
  }

  /**
   * Get vector index configuration
   */
  export function getVectorIndexConfig(): VectorIndexConfig | undefined {
    const type = process.env["KILO_MEMORY_VECTOR_INDEX_TYPE"] as "hnsw" | "ivfflat" | undefined
    if (!type) return undefined
    return {
      type,
      m: Number(process.env["KILO_MEMORY_HNSW_M"] ?? 16),
      efConstruction: Number(process.env["KILO_MEMORY_HNSW_EF_CONSTRUCTION"] ?? 64),
      lists: Number(process.env["KILO_MEMORY_IVFFLAT_LISTS"] ?? 100),
    }
  }
}

let _db: ReturnType<typeof drizzle> | null = null
let _path: string | null = null
let _sqlite: BunDatabase | null = null

/**
 * SQL statements to create memory tables
 */
const CREATE_TABLES_SQL = `
-- Tenant table
CREATE TABLE IF NOT EXISTS tenant (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

-- Working state
CREATE TABLE IF NOT EXISTS working_state (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'medium',
  expires_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS working_tenant_user_idx ON working_state(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS working_session_idx ON working_state(session_id);
CREATE INDEX IF NOT EXISTS working_expires_idx ON working_state(expires_at);

-- Memory events
CREATE TABLE IF NOT EXISTS memory_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  correlation_id TEXT,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  sensitivity TEXT NOT NULL DEFAULT 'medium',
  actor_type TEXT,
  actor_id TEXT,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS event_tenant_user_ts_idx ON memory_events(tenant_id, user_id, ts DESC);
CREATE INDEX IF NOT EXISTS event_correlation_idx ON memory_events(correlation_id);
CREATE INDEX IF NOT EXISTS event_type_idx ON memory_events(event_type);
CREATE INDEX IF NOT EXISTS event_actor_idx ON memory_events(actor_type, actor_id);

-- Episodes
CREATE TABLE IF NOT EXISTS episodes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  task_id TEXT,
  task_description TEXT NOT NULL,
  outcome TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  correlation_id TEXT,
  agency_id TEXT,
  agent_id TEXT,
  actor_type TEXT,
  actor_id TEXT,
  source_event_ids TEXT DEFAULT '[]',
  artifacts TEXT,
  confidence INTEGER NOT NULL DEFAULT 80,
  expires_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS episode_tenant_user_idx ON episodes(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS episode_correlation_idx ON episodes(correlation_id);
CREATE INDEX IF NOT EXISTS episode_expires_idx ON episodes(expires_at);
CREATE INDEX IF NOT EXISTS episode_completed_idx ON episodes(completed_at);
CREATE INDEX IF NOT EXISTS episode_actor_idx ON episodes(actor_type, actor_id);

-- Facts
CREATE TABLE IF NOT EXISTS facts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 50,
  provenance TEXT,
  extraction_source TEXT,
  actor_type TEXT,
  actor_id TEXT,
  source_event_ids TEXT DEFAULT '[]',
  valid_from INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  valid_to INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS fact_tenant_user_idx ON facts(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS fact_subject_idx ON facts(subject);
CREATE INDEX IF NOT EXISTS fact_predicate_idx ON facts(predicate);
CREATE INDEX IF NOT EXISTS fact_confidence_idx ON facts(confidence DESC);
CREATE INDEX IF NOT EXISTS fact_valid_to_idx ON facts(valid_to);
CREATE INDEX IF NOT EXISTS fact_actor_idx ON facts(actor_type, actor_id);

-- Fact vectors
CREATE TABLE IF NOT EXISTS fact_vectors (
  id TEXT PRIMARY KEY,
  fact_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'text-embedding-mxbai-embed-large-v1',
  norm INTEGER,
  metadata_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS vector_fact_idx ON fact_vectors(fact_id);

-- Graph entities
CREATE TABLE IF NOT EXISTS memory_entities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  metadata_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS entity_tenant_type_idx ON memory_entities(tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS entity_name_idx ON memory_entities(name);
CREATE UNIQUE INDEX IF NOT EXISTS entity_tenant_name_type_uq ON memory_entities(tenant_id, name, entity_type);

-- Graph edges
CREATE TABLE IF NOT EXISTS memory_edges (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  target_id TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  weight INTEGER NOT NULL DEFAULT 100,
  metadata_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS edge_tenant_source_idx ON memory_edges(tenant_id, source_id);
CREATE INDEX IF NOT EXISTS edge_tenant_target_idx ON memory_edges(tenant_id, target_id);
CREATE INDEX IF NOT EXISTS edge_relation_idx ON memory_edges(relation);
CREATE UNIQUE INDEX IF NOT EXISTS edge_unique_uq ON memory_edges(tenant_id, source_id, relation, target_id);

-- Procedures
CREATE TABLE IF NOT EXISTS procedures (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  scope TEXT NOT NULL DEFAULT 'global',
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  current_version TEXT NOT NULL DEFAULT '1.0.0',
  success_rate INTEGER NOT NULL DEFAULT 0,
  usage_count INTEGER NOT NULL DEFAULT 0,
  pattern_tags TEXT DEFAULT '[]',
  steps TEXT DEFAULT '[]',
  prerequisites TEXT DEFAULT '[]',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS proc_tenant_user_idx ON procedures(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS proc_scope_idx ON procedures(scope);
CREATE INDEX IF NOT EXISTS proc_name_idx ON procedures(name);
CREATE INDEX IF NOT EXISTS proc_status_idx ON procedures(status);

-- Procedure versions
CREATE TABLE IF NOT EXISTS procedure_versions (
  id TEXT PRIMARY KEY,
  procedure_id TEXT NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  triggers_json TEXT,
  confidence INTEGER NOT NULL DEFAULT 50,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  created_by TEXT,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS procver_procedure_idx ON procedure_versions(procedure_id);
CREATE INDEX IF NOT EXISTS procver_version_idx ON procedure_versions(version);

-- User profiles
CREATE TABLE IF NOT EXISTS user_profile (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  preferences_json TEXT DEFAULT '{}',
  communication_style TEXT DEFAULT 'neutral',
  constraints_json TEXT DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS profile_tenant_user_idx ON user_profile(tenant_id, user_id);

-- Feedback events (Phase 1 extended schema)
CREATE TABLE IF NOT EXISTS feedback_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  vote TEXT NOT NULL,
  reason TEXT,
  correction_text TEXT,
  -- Phase 1 additions
  task_id TEXT,
  session_id TEXT,
  correlation_id TEXT,
  channel TEXT DEFAULT 'cli',
  score REAL,
  expected_outcome TEXT,
  actual_outcome TEXT,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS feedback_target_idx ON feedback_events(target_type, target_id);
CREATE INDEX IF NOT EXISTS feedback_tenant_user_idx ON feedback_events(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS feedback_ts_idx ON feedback_events(ts DESC);
CREATE INDEX IF NOT EXISTS feedback_session_idx ON feedback_events(session_id);
CREATE INDEX IF NOT EXISTS feedback_correlation_idx ON feedback_events(correlation_id);

-- Audit log
CREATE TABLE IF NOT EXISTS memory_audit_log (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  reason TEXT,
  correlation_id TEXT,
  previous_hash TEXT,
  hash TEXT NOT NULL,
  metadata_json TEXT,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS audit_target_idx ON memory_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON memory_audit_log(actor);
CREATE INDEX IF NOT EXISTS audit_ts_idx ON memory_audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS audit_hash_idx ON memory_audit_log(hash);

-- Proactive tasks (Phase 2 scheduler persistence)
CREATE TABLE IF NOT EXISTS proactive_tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_config TEXT NOT NULL,
  schedule_cron TEXT,
  next_run_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS proactive_task_tenant_idx ON proactive_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS proactive_task_status_idx ON proactive_tasks(status);
CREATE INDEX IF NOT EXISTS proactive_task_next_run_idx ON proactive_tasks(next_run_at) WHERE next_run_at IS NOT NULL;

-- Proactive task runs
CREATE TABLE IF NOT EXISTS proactive_task_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES proactive_tasks(id) ON DELETE CASCADE,
  outcome TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  gate_decisions TEXT,
  evidence_refs TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS proactive_run_task_idx ON proactive_task_runs(task_id);
CREATE INDEX IF NOT EXISTS proactive_run_created_idx ON proactive_task_runs(created_at DESC);

-- Proactive dead letter queue
CREATE TABLE IF NOT EXISTS proactive_dlq (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES proactive_tasks(id) ON DELETE CASCADE,
  run_id TEXT,
  error TEXT NOT NULL,
  payload TEXT,
  retry_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS proactive_dlq_task_idx ON proactive_dlq(task_id);
CREATE INDEX IF NOT EXISTS proactive_dlq_retry_idx ON proactive_dlq(retry_at) WHERE retry_at IS NOT NULL;

-- Learning features (Phase 3 auto-learning)
CREATE TABLE IF NOT EXISTS learning_features (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  feature_name TEXT NOT NULL,
  feature_value REAL NOT NULL,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS learning_feat_tenant_user_idx ON learning_features(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS learning_feat_name_idx ON learning_features(feature_name);
CREATE INDEX IF NOT EXISTS learning_feat_window_idx ON learning_features(window_start, window_end);

-- Learning snapshots
CREATE TABLE IF NOT EXISTS learning_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  policy_version TEXT,
  profile_version TEXT,
  metrics_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS learning_snap_tenant_user_idx ON learning_snapshots(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS learning_snap_created_idx ON learning_snapshots(created_at DESC);

-- Canary releases (Phase 3)
CREATE TABLE IF NOT EXISTS learning_canary_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  update_type TEXT NOT NULL,
  cohort_percent INTEGER NOT NULL DEFAULT 10,
  status TEXT NOT NULL DEFAULT 'running',
  started_at INTEGER NOT NULL,
  completed_at INTEGER,
  metrics_json TEXT
);

CREATE INDEX IF NOT EXISTS learning_canary_tenant_idx ON learning_canary_runs(tenant_id);
CREATE INDEX IF NOT EXISTS learning_canary_status_idx ON learning_canary_runs(status);

-- Drift events (Phase 3)
CREATE TABLE IF NOT EXISTS learning_drift_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  drift_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  detected_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  action_taken TEXT,
  resolved_at INTEGER
);

CREATE INDEX IF NOT EXISTS learning_drift_tenant_idx ON learning_drift_events(tenant_id);
CREATE INDEX IF NOT EXISTS learning_drift_severity_idx ON learning_drift_events(severity);
`

export namespace MemoryDb {
  /**
   * Initialize memory database - creates tables if needed
   */
  export async function init(dbPath?: string): Promise<void> {
    if (!isEnabled()) {
      log.info("memory v2 disabled via KILO_EXPERIMENTAL_MEMORY_V2 flag")
      return
    }

    const path =
      dbPath ?? process.env["KILOCLAW_MEMORY_DB_PATH"] ?? process.env["KILO_MEMORY_DB_PATH"] ?? MEMORY_DB_PATH

    if (_db) {
      if (_path === path) {
        log.debug("memory database already initialized")
        return
      }
      log.warn("memory database already initialized with a different path", {
        existingPath: _path,
        requestedPath: path,
      })
      return
    }

    log.info("initializing memory database", { path })

    // Ensure directory exists before opening database
    try {
      const dir = dirname(path)
      await mkdir(dir, { recursive: true })
    } catch (err) {
      log.warn("failed to create memory db directory", { dir: dirname(path), err })
      // Continue anyway - SQLite might still work
    }

    // Open SQLite database
    const sqlite = new BunDatabase(path, { create: true })

    // Enable WAL mode for better concurrency
    sqlite.run("PRAGMA journal_mode = WAL")
    sqlite.run("PRAGMA foreign_keys = ON")

    // Create tables if they don't exist
    sqlite.exec(CREATE_TABLES_SQL)

    // Initialize drizzle
    const db = drizzle({ client: sqlite })

    // Initialize repository
    initMemoryRepository(db)
    _sqlite = sqlite
    _db = db
    _path = path

    log.info("memory database initialized successfully")

    // Schedule cleanup job
    scheduleCleanup()
  }

  /**
   * Get database instance
   */
  export function getDb() {
    if (!_db) {
      throw new Error("Memory database not initialized. Call MemoryDb.init() first.")
    }
    return _db
  }

  /**
   * Close database connection
   */
  export function close(): void {
    if (_db) {
      if (_sqlite) {
        _sqlite.close()
      }
      disposeMemoryRepository()
      _sqlite = null
      _db = null
      _path = null
      log.info("memory database closed")
    }
  }

  /**
   * Schedule periodic cleanup of expired entries
   */
  function scheduleCleanup(): void {
    // Run cleanup every 5 minutes
    const cleanupInterval = 5 * 60 * 1000

    setInterval(async () => {
      if (!isEnabled()) return

      try {
        log.debug("running memory cleanup job")

        // Get stats before cleanup
        const beforeStats = await MemoryRetention.getStats("system")

        // Cleanup working memory
        const workingResult = await MemoryRetention.enforcePolicy("system", "working")

        // Cleanup episodic memory
        const episodicResult = await MemoryRetention.enforcePolicy("system", "episodic")

        log.info("memory cleanup completed", {
          working: workingResult.purged,
          episodic: episodicResult.purged,
        })
      } catch (err) {
        log.error("memory cleanup failed", { err })
      }
    }, cleanupInterval)

    log.info("memory cleanup job scheduled", { intervalMs: cleanupInterval })
  }
}
