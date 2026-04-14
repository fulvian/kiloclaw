-- Migration: Create Google Workspace token tables
-- Version: 001
-- Description: Create encrypted token storage and audit tables

-- ============================================================================
-- gworkspace_tokens: Persistent encrypted token storage
-- ============================================================================
CREATE TABLE IF NOT EXISTS gworkspace_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  workspace_id VARCHAR(255) NOT NULL,

  -- Encrypted tokens (base64 encoded: salt+iv+tag+ciphertext)
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,

  -- Token lifecycle
  expires_at BIGINT NOT NULL,
  rotated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,

  -- Unique constraint: one token per user per workspace
  CONSTRAINT unique_user_workspace UNIQUE(user_id, workspace_id),

  -- Indexes for common queries
  INDEX idx_user_id (user_id),
  INDEX idx_expires_at (expires_at),
  INDEX idx_workspace_id (workspace_id)
);

-- ============================================================================
-- gworkspace_token_rotations: Audit trail for token rotations
-- ============================================================================
CREATE TABLE IF NOT EXISTS gworkspace_token_rotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  workspace_id VARCHAR(255) NOT NULL,

  -- Hash of old refresh token (never store plaintext)
  old_refresh_token_hash VARCHAR(64),

  -- Rotation metadata
  rotation_reason VARCHAR(50) NOT NULL DEFAULT 'regular',
  -- Values: regular, compromise, refresh, logout, manual

  rotated_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,

  -- Indexes
  INDEX idx_user_id (user_id),
  INDEX idx_rotated_at (rotated_at),
  INDEX idx_workspace_id (workspace_id)
);

-- ============================================================================
-- gworkspace_idempotency_keys: Prevent duplicate writes
-- ============================================================================
CREATE TABLE IF NOT EXISTS gworkspace_idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Idempotency key (operation + content hash)
  operation_key VARCHAR(255) NOT NULL UNIQUE,

  -- Cached result (JSON encoded)
  cached_result TEXT NOT NULL,

  -- TTL
  created_at BIGINT NOT NULL DEFAULT EXTRACT(EPOCH FROM NOW())::BIGINT * 1000,
  expires_at BIGINT NOT NULL,

  -- Indexes
  INDEX idx_operation_key (operation_key),
  INDEX idx_expires_at (expires_at)
);

-- ============================================================================
-- Cleanup job: Remove expired tokens and idempotency keys
-- ============================================================================
-- This should be run periodically (e.g., hourly or daily via cron)
-- SELECT cleanup_gworkspace_tokens();

CREATE OR REPLACE FUNCTION cleanup_gworkspace_tokens()
RETURNS TABLE(tokens_deleted BIGINT, keys_deleted BIGINT) AS $$
DECLARE
  v_tokens_deleted BIGINT;
  v_keys_deleted BIGINT;
BEGIN
  -- Delete expired tokens (keep for 7 days after expiration for audit)
  DELETE FROM gworkspace_tokens
  WHERE expires_at < (EXTRACT(EPOCH FROM NOW())::BIGINT * 1000) - (7 * 24 * 60 * 60 * 1000);
  GET DIAGNOSTICS v_tokens_deleted = ROW_COUNT;

  -- Delete expired idempotency keys
  DELETE FROM gworkspace_idempotency_keys
  WHERE expires_at < EXTRACT(EPOCH FROM NOW())::BIGINT * 1000;
  GET DIAGNOSTICS v_keys_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_tokens_deleted, v_keys_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Grant permissions
-- ============================================================================
-- Replace 'app_user' with your actual application database user
-- GRANT SELECT, INSERT, UPDATE, DELETE ON gworkspace_tokens TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON gworkspace_token_rotations TO app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON gworkspace_idempotency_keys TO app_user;
-- GRANT EXECUTE ON FUNCTION cleanup_gworkspace_tokens() TO app_user;
