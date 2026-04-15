-- Create Google Workspace token tables
-- Version: 20260414182349
-- Description: Encrypted token storage for Google Workspace OAuth2 integration

-- ============================================================================
-- gworkspace_token: Persistent encrypted token storage
-- ============================================================================
CREATE TABLE IF NOT EXISTS gworkspace_token (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,

  -- Encrypted tokens (base64 encoded: salt+iv+tag+ciphertext)
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,

  -- Token lifecycle
  expires_at INTEGER NOT NULL,
  rotated_at INTEGER NOT NULL,

  -- Timestamps
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL,

  -- Unique constraint: one token per user per workspace
  UNIQUE(user_id, workspace_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS gworkspace_token_user_idx ON gworkspace_token(user_id);
CREATE INDEX IF NOT EXISTS gworkspace_token_expires_idx ON gworkspace_token(expires_at);
CREATE INDEX IF NOT EXISTS gworkspace_token_workspace_idx ON gworkspace_token(workspace_id);
CREATE UNIQUE INDEX IF NOT EXISTS gworkspace_token_user_workspace_idx ON gworkspace_token(user_id, workspace_id);

-- ============================================================================
-- gworkspace_token_rotation: Audit trail for token rotations
-- ============================================================================
CREATE TABLE IF NOT EXISTS gworkspace_token_rotation (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,

  -- Hash of old refresh token (never store plaintext)
  old_refresh_token_hash TEXT,

  -- Rotation metadata
  rotation_reason TEXT NOT NULL DEFAULT 'regular',
  -- Values: regular, compromise, refresh, logout, manual

  -- Timestamps
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS gworkspace_token_rotation_user_idx ON gworkspace_token_rotation(user_id);
CREATE INDEX IF NOT EXISTS gworkspace_token_rotation_workspace_idx ON gworkspace_token_rotation(workspace_id);
CREATE INDEX IF NOT EXISTS gworkspace_token_rotation_created_idx ON gworkspace_token_rotation(time_created);

-- ============================================================================
-- gworkspace_idempotency_key: Prevent duplicate writes
-- ============================================================================
CREATE TABLE IF NOT EXISTS gworkspace_idempotency_key (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  operation TEXT NOT NULL,

  -- Cached result (JSON encoded)
  result_data TEXT NOT NULL,

  -- TTL (30 minutes)
  expires_at INTEGER NOT NULL,

  -- Timestamps
  time_created INTEGER NOT NULL,
  time_updated INTEGER NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS gworkspace_idempotency_key_user_workspace_idx ON gworkspace_idempotency_key(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS gworkspace_idempotency_key_operation_idx ON gworkspace_idempotency_key(operation);
CREATE INDEX IF NOT EXISTS gworkspace_idempotency_key_expires_idx ON gworkspace_idempotency_key(expires_at);
