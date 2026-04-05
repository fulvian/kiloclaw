/**
 * PostgreSQL Schema for Memory System with pgvector Support
 * Used when KILO_MEMORY_PROVIDER=postgres
 */

export const PostgresSchema = {
  /**
   * Get PostgreSQL DDL for memory tables with pgvector support
   */
  getDDL(): string {
    return `
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Facts table
CREATE TABLE IF NOT EXISTS memory_facts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  confidence INTEGER DEFAULT 70,
  provenance TEXT,
  extraction_source TEXT,
  actor_type TEXT,
  actor_id TEXT,
  source_event_ids TEXT[],
  valid_from BIGINT NOT NULL,
  valid_to BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Fact vectors table with pgvector
CREATE TABLE IF NOT EXISTS memory_fact_vectors (
  id TEXT PRIMARY KEY,
  fact_id TEXT NOT NULL REFERENCES memory_facts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),  -- dimension for text-embedding-mxbai-embed-large-v1
  model TEXT NOT NULL DEFAULT 'text-embedding-mxbai-embed-large-v1',
  norm INTEGER,
  metadata_json JSONB,
  created_at BIGINT NOT NULL
);

-- HNSW index for cosine similarity (preferred for most use cases)
CREATE INDEX IF NOT EXISTS memory_fact_vectors_hnsw 
ON memory_fact_vectors USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- IVFFlat index alternative (better for very large datasets, slower build)
-- CREATE INDEX IF NOT EXISTS memory_fact_vectors_ivfflat 
-- ON memory_fact_vectors USING ivfflat (embedding vector_cosine_ops)
-- WITH (lists = 100);

-- Entities table
CREATE TABLE IF NOT EXISTS memory_entities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  metadata_json JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Graph edges table
CREATE TABLE IF NOT EXISTS memory_edges (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  target_id TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  weight INTEGER DEFAULT 100,
  metadata_json JSONB,
  created_at BIGINT NOT NULL
);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS memory_facts_tenant_idx ON memory_facts(tenant_id);
CREATE INDEX IF NOT EXISTS memory_facts_subject_idx ON memory_facts(tenant_id, subject);
CREATE INDEX IF NOT EXISTS memory_facts_actor_idx ON memory_facts(tenant_id, actor_type, actor_id);
CREATE INDEX IF NOT EXISTS memory_facts_valid_to_idx ON memory_facts(valid_to);
CREATE INDEX IF NOT EXISTS memory_entities_tenant_name_idx ON memory_entities(tenant_id, name);
CREATE INDEX IF NOT EXISTS memory_entities_tenant_type_idx ON memory_entities(tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS memory_edges_tenant_idx ON memory_edges(tenant_id);
CREATE INDEX IF NOT EXISTS memory_edges_tenant_source_idx ON memory_edges(tenant_id, source_id);
CREATE INDEX IF NOT EXISTS memory_edges_tenant_target_idx ON memory_edges(tenant_id, target_id);

-- Working state table
CREATE TABLE IF NOT EXISTS memory_working_state (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  session_id TEXT,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  sensitivity TEXT DEFAULT 'medium',
  expires_at BIGINT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS memory_working_tenant_user_idx ON memory_working_state(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS memory_working_session_idx ON memory_working_state(session_id);
CREATE INDEX IF NOT EXISTS memory_working_expires_idx ON memory_working_state(expires_at);

-- Episodes table
CREATE TABLE IF NOT EXISTS memory_episodes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  task_id TEXT,
  task_description TEXT NOT NULL,
  outcome TEXT NOT NULL,
  started_at BIGINT NOT NULL,
  completed_at BIGINT NOT NULL,
  correlation_id TEXT,
  agency_id TEXT,
  agent_id TEXT,
  actor_type TEXT,
  actor_id TEXT,
  source_event_ids TEXT[],
  artifacts TEXT,
  confidence INTEGER DEFAULT 80,
  expires_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS memory_episode_tenant_user_idx ON memory_episodes(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS memory_episode_correlation_idx ON memory_episodes(correlation_id);
CREATE INDEX IF NOT EXISTS memory_episode_expires_idx ON memory_episodes(expires_at);
`
  },
}
