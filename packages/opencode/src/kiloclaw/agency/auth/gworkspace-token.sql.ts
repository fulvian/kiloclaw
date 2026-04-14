import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core"
import { Timestamps } from "@/storage/schema.sql"

/**
 * Encrypted Google Workspace token storage
 * Stores encrypted access tokens with refresh tokens for persistent auth
 */
export const GWorkspaceTokenTable = sqliteTable(
  "gworkspace_token",
  {
    id: text().primaryKey(), // UUID
    user_id: text().notNull(),
    workspace_id: text().notNull(),
    encrypted_access_token: text().notNull(), // AES-256-GCM encrypted
    encrypted_refresh_token: text(), // Optional, also encrypted
    expires_at: integer().notNull(), // milliseconds since epoch
    rotated_at: integer().notNull(), // last rotation timestamp
    ...Timestamps,
  },
  (table) => [
    uniqueIndex("gworkspace_token_user_workspace_idx").on(table.user_id, table.workspace_id),
    index("gworkspace_token_user_idx").on(table.user_id),
    index("gworkspace_token_expires_idx").on(table.expires_at),
  ],
)

/**
 * Audit trail for token rotations and revocations
 */
export const GWorkspaceTokenRotationTable = sqliteTable(
  "gworkspace_token_rotation",
  {
    id: text().primaryKey(), // UUID
    user_id: text().notNull(),
    workspace_id: text().notNull(),
    old_refresh_token_hash: text().notNull(), // SHA-256 hash, never plaintext
    rotation_reason: text().notNull(), // 'regular' | 'compromise' | 'refresh' | 'logout' | 'manual'
    ...Timestamps,
  },
  (table) => [
    index("gworkspace_token_rotation_user_idx").on(table.user_id),
    index("gworkspace_token_rotation_workspace_idx").on(table.workspace_id),
  ],
)

/**
 * Idempotency keys for deduplication
 * Prevents duplicate operations within a time window
 */
export const GWorkspaceIdempotencyKeyTable = sqliteTable(
  "gworkspace_idempotency_key",
  {
    key: text().primaryKey(), // UUID
    result_hash: text().notNull(), // Hash of operation result
    expires_at: integer().notNull(), // TTL: 30 minutes
    ...Timestamps,
  },
  (table) => [
    index("gworkspace_idempotency_key_expires_idx").on(table.expires_at),
  ],
)
