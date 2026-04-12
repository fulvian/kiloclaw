/**
 * MCP Auth Store - Canonical + Runtime storage with write-through semantics.
 *
 * This module provides a two-tier storage system:
 * 1. Canonical store: `~/.local/share/kiloclaw/mcp-auth.json` (user-global, worktree-independent)
 * 2. Runtime store: `XDG_DATA_HOME/kiloclaw/mcp-auth.json` (per-project, XDG-compliant)
 *
 * The canonical store is the source of truth. On read, we merge from both stores.
 * On write, we write to both stores (write-through) to maintain consistency.
 *
 * Merge policy:
 * - Prefer entry with more recent `expiresAt` (indicates newer credentials)
 * - If `refreshToken` is present in either, preserve it
 * - Always preserve valid `clientInfo`
 * - Use URL canonicalization for stable lookups
 */

import path from "path"
import os from "os"
import fs from "fs/promises"
import { Global } from "../global"
import { Filesystem } from "../util/filesystem"
import { canonicalUrl, buildAuthKey } from "./auth-url"
import { Log } from "../util/log"
import { McpAuth } from "./auth"

const log = Log.create({ service: "mcp.auth-store" })

/**
 * Paths to both store locations.
 */
export const AUTH_STORE_PATHS = {
  /**
   * Canonical store - user-global, worktree-independent.
   * This is the source of truth for auth credentials.
   */
  get canonical(): string {
    const home = process.env.KILO_TEST_HOME || os.homedir()
    return path.join(home, ".local", "share", "kiloclaw", "mcp-auth.json")
  },

  /**
   * Runtime store - per-project, XDG-compliant.
   * This is the local cache that may exist in project runtimes.
   */
  get runtime(): string {
    return path.join(Global.Path.data, "mcp-auth.json")
  },
} as const

/**
 * Check if two store paths refer to the same file.
 */
export function isSameStore(path1: string, path2: string): boolean {
  try {
    return Filesystem.resolve(path1) === Filesystem.resolve(path2)
  } catch {
    return path1 === path2
  }
}

/**
 * Read lock file to detect concurrent access.
 * Lock file format: PID:timestamp
 */
const LOCK_FILE_SUFFIX = ".lock"

async function acquireLock(lockPath: string, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now()
  const pid = process.pid

  while (Date.now() - start < timeoutMs) {
    try {
      // Try to create lock file exclusively
      await fs.writeFile(lockPath, `${pid}:${Date.now()}`, { mode: 0o600 })
      return true
    } catch (err) {
      // Lock exists, wait and retry
      await Bun.sleep(50)
    }
  }

  log.warn("failed to acquire lock", { lockPath })
  return false
}

async function releaseLock(lockPath: string): Promise<void> {
  try {
    await fs.rm(lockPath)
  } catch {
    // Ignore errors when releasing lock
  }
}

/**
 * Atomically write JSON to a file using temp file + rename.
 * Ensures no partial writes or corruption on crash.
 */
async function atomicWriteJson(filepath: string, data: unknown, mode = 0o600): Promise<void> {
  const dir = path.dirname(filepath)
  const basename = path.basename(filepath)
  const tmpPath = path.join(dir, `.${basename}.tmp.${process.pid}`)

  try {
    // Write to temp file first
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), { mode })

    // Rename to final location (atomic on POSIX)
    await fs.rename(tmpPath, filepath)
  } catch (err) {
    // Clean up temp file on error
    try {
      await fs.rm(tmpPath)
    } catch {}
    throw err
  }
}

/**
 * Entry type matching McpAuth.Entry but with canonical URL field.
 */
export interface AuthEntry {
  tokens?: {
    accessToken: string
    refreshToken?: string
    expiresAt?: number
    scope?: string
  }
  clientInfo?: {
    clientId: string
    clientSecret?: string
    clientIdIssuedAt?: number
    clientSecretExpiresAt?: number
  }
  codeVerifier?: string
  oauthState?: string
  serverUrl?: string
  /** Canonical URL computed from serverUrl for stable lookups */
  canonicalUrl?: string
}

/**
 * Full store structure.
 */
type AuthStore = Record<string, AuthEntry>

/**
 * Read the canonical store.
 */
async function readCanonicalStore(): Promise<AuthStore> {
  try {
    return await Filesystem.readJson<AuthStore>(AUTH_STORE_PATHS.canonical)
  } catch {
    return {}
  }
}

/**
 * Read the runtime store.
 */
async function readRuntimeStore(): Promise<AuthStore> {
  // Skip if same as canonical
  if (isSameStore(AUTH_STORE_PATHS.canonical, AUTH_STORE_PATHS.runtime)) {
    return {}
  }

  try {
    return await Filesystem.readJson<AuthStore>(AUTH_STORE_PATHS.runtime)
  } catch {
    return {}
  }
}

/**
 * Merge two store entries using the defined tie-break policy.
 */
function mergeEntry(local: AuthEntry | undefined, remote: AuthEntry | undefined): AuthEntry {
  if (!local && !remote) return {}
  if (!local) return { ...remote! }
  if (!remote) return { ...local }

  // Start with local as base
  const merged: AuthEntry = { ...local }

  // Merge tokens - prefer entry with more recent expiresAt or presence of refreshToken
  if (local.tokens && remote.tokens) {
    const localExpiry = local.tokens.expiresAt ?? 0
    const remoteExpiry = remote.tokens.expiresAt ?? 0
    const localHasRefresh = !!local.tokens.refreshToken
    const remoteHasRefresh = !!remote.tokens.refreshToken

    // If remote has more recent expiry OR remote has refresh but local doesn't
    if (remoteExpiry > localExpiry || (remoteHasRefresh && !localHasRefresh)) {
      merged.tokens = { ...remote.tokens }
      // Preserve refresh token from local if remote doesn't have one
      if (!merged.tokens.refreshToken && local.tokens.refreshToken) {
        merged.tokens.refreshToken = local.tokens.refreshToken
      }
    } else {
      merged.tokens = { ...local.tokens }
      // Preserve refresh token from remote if local doesn't have one
      if (!merged.tokens.refreshToken && remote.tokens.refreshToken) {
        merged.tokens.refreshToken = remote.tokens.refreshToken
      }
    }
  } else if (remote.tokens) {
    merged.tokens = { ...remote.tokens }
  }

  // Merge clientInfo - prefer local if both exist (client registration is stable)
  if (!merged.clientInfo && remote.clientInfo) {
    merged.clientInfo = { ...remote.clientInfo }
  }

  // Merge other fields - latest wins
  if (remote.codeVerifier && !merged.codeVerifier) {
    merged.codeVerifier = remote.codeVerifier
  }
  if (remote.oauthState && !merged.oauthState) {
    merged.oauthState = remote.oauthState
  }

  // Use remote serverUrl if local doesn't have one
  if (!merged.serverUrl && remote.serverUrl) {
    merged.serverUrl = remote.serverUrl
  }

  return merged
}

/**
 * Compute canonical URL for an entry if serverUrl exists.
 */
function computeCanonicalUrl(entry: AuthEntry): AuthEntry {
  if (entry.serverUrl && !entry.canonicalUrl) {
    entry.canonicalUrl = canonicalUrl(entry.serverUrl)
  }
  return entry
}

/**
 * Merge entries from both stores, using canonical URL for deduplication.
 */
async function readMergedStore(): Promise<AuthStore> {
  const [canonical, runtime] = await Promise.all([readCanonicalStore(), readRuntimeStore()])

  // If runtime is same as canonical, return as-is
  if (isSameStore(AUTH_STORE_PATHS.canonical, AUTH_STORE_PATHS.runtime)) {
    const result: AuthStore = {}
    for (const [key, entry] of Object.entries(canonical)) {
      result[key] = computeCanonicalUrl(entry)
    }
    return result
  }

  // Merge canonical entries first
  const merged: AuthStore = {}
  for (const [key, entry] of Object.entries(canonical)) {
    merged[key] = computeCanonicalUrl(entry)
  }

  // Merge runtime entries
  for (const [key, entry] of Object.entries(runtime)) {
    const existing = merged[key]
    merged[key] = computeCanonicalUrl(mergeEntry(existing, entry))
  }

  return merged
}

/**
 * Write to both stores (write-through).
 */
async function writeToBothStores(data: AuthStore): Promise<void> {
  const lockPath = AUTH_STORE_PATHS.canonical + LOCK_FILE_SUFFIX

  // Ensure directories exist using raw fs
  await fs.mkdir(path.dirname(AUTH_STORE_PATHS.canonical), { recursive: true })
  await fs.mkdir(path.dirname(AUTH_STORE_PATHS.runtime), { recursive: true })

  // Try to acquire lock for canonical store
  const locked = await acquireLock(lockPath)
  if (!locked) {
    log.warn("could not acquire lock, proceeding without lock", { lockPath })
  }

  try {
    // Write to canonical store first (source of truth)
    await atomicWriteJson(AUTH_STORE_PATHS.canonical, data, 0o600)

    // Also write to runtime store if different
    if (!isSameStore(AUTH_STORE_PATHS.canonical, AUTH_STORE_PATHS.runtime)) {
      await atomicWriteJson(AUTH_STORE_PATHS.runtime, data, 0o600)
    }
  } finally {
    if (locked) {
      await releaseLock(lockPath)
    }
  }
}

// ============================================================================
// Public API - Mirrors McpAuth namespace but uses canonical+runtime store
// ============================================================================

export namespace McpAuthStore {
  /**
   * Get an auth entry by MCP name.
   * Uses URL canonicalization for stable lookups.
   */
  export async function get(mcpName: string): Promise<AuthEntry | undefined> {
    const store = await readMergedStore()
    return store[mcpName]
  }

  /**
   * Get an auth entry by MCP name and validated URL.
   * Returns undefined if URL has changed (credentials are for a different server).
   */
  export async function getForUrl(mcpName: string, serverUrl: string): Promise<AuthEntry | undefined> {
    const entry = await get(mcpName)
    if (!entry) return undefined

    // If no serverUrl stored, this is from an old version
    if (!entry.serverUrl) return undefined

    // Canonicalize both URLs for comparison
    const storedCanonical = canonicalUrl(entry.serverUrl)
    const requestedCanonical = canonicalUrl(serverUrl)

    if (storedCanonical !== requestedCanonical) {
      log.info("URL mismatch in getForUrl", {
        mcpName,
        stored: storedCanonical,
        requested: requestedCanonical,
      })
      return undefined
    }

    return entry
  }

  /**
   * Get all entries from the merged store.
   */
  export async function all(): Promise<Record<string, AuthEntry>> {
    return readMergedStore()
  }

  /**
   * Set an auth entry for an MCP server.
   * Writes to both canonical and runtime stores.
   */
  export async function set(mcpName: string, entry: AuthEntry, serverUrl?: string): Promise<void> {
    const store = await readMergedStore()

    // Always update serverUrl if provided
    if (serverUrl) {
      entry.serverUrl = serverUrl
      entry.canonicalUrl = canonicalUrl(serverUrl)
    }

    // Compute canonical URL for the entry
    const entryWithCanonical = computeCanonicalUrl({ ...entry })

    store[mcpName] = entryWithCanonical
    await writeToBothStores(store)

    log.info("saved auth entry", { mcpName, hasTokens: !!entryWithCanonical.tokens })
  }

  /**
   * Remove an auth entry for an MCP server.
   */
  export async function remove(mcpName: string): Promise<void> {
    const store = await readMergedStore()
    if (mcpName in store) {
      delete store[mcpName]
      await writeToBothStores(store)
      log.info("removed auth entry", { mcpName })
    }
  }

  /**
   * Update tokens for an MCP server.
   * Preserves existing refresh token if new one not provided (common in Google OAuth).
   */
  export async function updateTokens(mcpName: string, tokens: AuthEntry["tokens"], serverUrl?: string): Promise<void> {
    const entry = (await get(mcpName)) ?? {}

    // Preserve existing refresh token if new one not provided
    if (tokens && tokens.refreshToken === undefined && entry.tokens?.refreshToken) {
      tokens = { ...tokens, refreshToken: entry.tokens.refreshToken }
    }

    // Ensure accessToken is always present
    if (tokens && !tokens.accessToken) {
      tokens = { ...tokens, accessToken: entry.tokens?.accessToken ?? "" }
    }

    entry.tokens = tokens
    await set(mcpName, entry, serverUrl)
  }

  /**
   * Update client info for an MCP server.
   */
  export async function updateClientInfo(
    mcpName: string,
    clientInfo: AuthEntry["clientInfo"],
    serverUrl?: string,
  ): Promise<void> {
    const entry = (await get(mcpName)) ?? {}
    entry.clientInfo = clientInfo
    await set(mcpName, entry, serverUrl)
  }

  /**
   * Update code verifier for OAuth flow.
   */
  export async function updateCodeVerifier(mcpName: string, codeVerifier: string): Promise<void> {
    const entry = (await get(mcpName)) ?? {}
    entry.codeVerifier = codeVerifier
    await set(mcpName, entry)
  }

  /**
   * Clear code verifier.
   */
  export async function clearCodeVerifier(mcpName: string): Promise<void> {
    const entry = await get(mcpName)
    if (entry) {
      delete entry.codeVerifier
      await set(mcpName, entry)
    }
  }

  /**
   * Update OAuth state.
   */
  export async function updateOAuthState(mcpName: string, oauthState: string): Promise<void> {
    const entry = (await get(mcpName)) ?? {}
    entry.oauthState = oauthState
    await set(mcpName, entry)
  }

  /**
   * Get OAuth state.
   */
  export async function getOAuthState(mcpName: string): Promise<string | undefined> {
    const entry = await get(mcpName)
    return entry?.oauthState
  }

  /**
   * Clear OAuth state.
   */
  export async function clearOAuthState(mcpName: string): Promise<void> {
    const entry = await get(mcpName)
    if (entry) {
      delete entry.oauthState
      await set(mcpName, entry)
    }
  }

  /**
   * Check if tokens are expired.
   * Returns null if no tokens exist, false if not expired, true if expired.
   *
   * Uses a skew of 120 seconds to avoid race conditions near expiry.
   */
  export async function isTokenExpired(mcpName: string, skewSeconds = 120): Promise<boolean | null> {
    const entry = await get(mcpName)
    if (!entry?.tokens) return null
    if (!entry.tokens.expiresAt) return false

    // Apply skew to avoid race near expiry
    const effectiveExpiry = entry.tokens.expiresAt - skewSeconds
    return Date.now() / 1000 >= effectiveExpiry
  }

  /**
   * Check if an entry has valid (non-expired) refresh token.
   */
  export async function hasRefreshToken(mcpName: string): Promise<boolean> {
    const entry = await get(mcpName)
    return !!entry?.tokens?.refreshToken
  }

  /**
   * Migrate legacy runtime store entries to canonical store.
   * Call this at startup to ensure old credentials are available globally.
   */
  export async function migrateFromLegacy(): Promise<number> {
    const runtimeStore = await readRuntimeStore()

    if (isSameStore(AUTH_STORE_PATHS.canonical, AUTH_STORE_PATHS.runtime)) {
      return 0 // Same file, no migration needed
    }

    const canonicalStore = await readCanonicalStore()
    const merged = { ...canonicalStore }

    let migratedCount = 0
    for (const [key, entry] of Object.entries(runtimeStore)) {
      if (!(key in merged)) {
        merged[key] = computeCanonicalUrl(entry)
        migratedCount++
      }
    }

    if (migratedCount > 0) {
      await writeToBothStores(merged)
      log.info("migrated legacy auth entries", { count: migratedCount })
    }

    return migratedCount
  }

  /**
   * List all MCP servers with stored auth.
   */
  export async function list(): Promise<string[]> {
    const store = await readMergedStore()
    return Object.keys(store)
  }

  /**
   * Get count of stored auth entries.
   */
  export async function count(): Promise<number> {
    const store = await readMergedStore()
    return Object.keys(store).length
  }
}
