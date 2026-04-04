-- Memory V2 Schema - SQLite DDL
-- ADR-005: Memory Persistence Refoundation

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
  model TEXT NOT NULL DEFAULT 'text-embedding-mxbai-embed-large-v1',
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
