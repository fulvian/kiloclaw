/**
 * Memory Database - Initialization and Setup
 * Auto-creates tables and initializes repository
 */

import { Database as BunDatabase } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import { migrate } from "drizzle-orm/bun-sqlite/migrator"
import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import { initMemoryRepository } from "./memory.repository.js"
import { MemoryRetention } from "./memory.retention.js"
import { mkdir } from "fs/promises"
import { dirname } from "path"

const log = Log.create({ service: "kiloclaw.memory.db" })

// Memory database path
const MEMORY_DB_PATH = ".kilocode/memory.db"

let _db: ReturnType<typeof drizzle> | null = null

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
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS event_tenant_user_ts_idx ON memory_events(tenant_id, user_id, ts DESC);
CREATE INDEX IF NOT EXISTS event_correlation_idx ON memory_events(correlation_id);
CREATE INDEX IF NOT EXISTS event_type_idx ON memory_events(event_type);

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

-- Fact vectors
CREATE TABLE IF NOT EXISTS fact_vectors (
  id TEXT PRIMARY KEY,
  fact_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'hash-based',
  norm INTEGER,
  metadata_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS vector_fact_idx ON fact_vectors(fact_id);

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

-- Feedback events
CREATE TABLE IF NOT EXISTS feedback_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  vote TEXT NOT NULL,
  reason TEXT,
  correction_text TEXT,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS feedback_target_idx ON feedback_events(target_type, target_id);
CREATE INDEX IF NOT EXISTS feedback_tenant_user_idx ON feedback_events(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS feedback_ts_idx ON feedback_events(ts DESC);

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
`

export namespace MemoryDb {
  /**
   * Check if Memory V2 is enabled
   */
  export function isEnabled(): boolean {
    return Flag.KILO_EXPERIMENTAL_MEMORY_V2
  }

  /**
   * Initialize memory database - creates tables if needed
   */
  export async function init(dbPath?: string): Promise<void> {
    if (!isEnabled()) {
      log.info("memory v2 disabled via KILO_EXPERIMENTAL_MEMORY_V2 flag")
      return
    }

    const path = dbPath ?? MEMORY_DB_PATH

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
    _db = db

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
      // Drizzle doesn't have a close method for bun-sqlite
      // The underlying sqlite connection is managed by Bun
      _db = null
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
