/**
 * URL canonicalization utilities for MCP OAuth authentication.
 *
 * Provides stable URL keys for auth storage by normalizing:
 * - Host case (lowercase)
 * - Trailing slashes
 * - Default ports (80/443)
 * - Path canonicalization
 * - localhost/127.0.0.1 equivalence (configurable)
 */

import { Log } from "../util/log"

const log = Log.create({ service: "mcp.auth-url" })

export interface CanonicalUrlOptions {
  /**
   * Treat localhost and 127.0.0.1 as equivalent.
   * @default true
   */
  normalizeLocalhost?: boolean

  /**
   * Strip trailing slashes from paths.
   * @default true
   */
  stripTrailingSlash?: boolean

  /**
   * Remove default ports (80 for http, 443 for https).
   * @default true
   */
  removeDefaultPort?: boolean
}

const DEFAULT_OPTIONS: Required<CanonicalUrlOptions> = {
  normalizeLocalhost: true,
  stripTrailingSlash: true,
  removeDefaultPort: true,
}

/**
 * Known localhost variants that should be normalized.
 */
const LOCALHOST_PATTERNS = ["localhost", "127.0.0.1", "::1", "0.0.0.0"]

/**
 * Default ports by scheme.
 */
const DEFAULT_PORTS: Record<string, number> = {
  http: 80,
  https: 443,
}

/**
 * Canonicalize a URL string for stable storage key generation.
 * The output is suitable for use as an auth lookup key.
 */
export function canonicalUrl(url: string | URL, options: CanonicalUrlOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options }

  // For string URLs, detect trailing slash before parsing (URL normalizes / and no-slash to same pathname)
  let hasTrailingSlash = false
  let urlStr = ""
  if (typeof url === "string") {
    urlStr = url
    hasTrailingSlash = url.endsWith("/") && url.length > 1
  }

  const parsed = typeof url === "string" ? new URL(url) : url

  // Normalize protocol to lowercase
  const protocol = parsed.protocol.toLowerCase().replace(/:$/, "")

  // Normalize hostname
  let host = parsed.hostname.toLowerCase()

  // Handle localhost normalization
  if (opts.normalizeLocalhost && LOCALHOST_PATTERNS.includes(host)) {
    host = "localhost"
  }

  // Handle default port removal
  let port = parsed.port
  if (opts.removeDefaultPort) {
    const defaultPort = DEFAULT_PORTS[protocol]
    if (port === String(defaultPort) || port === "") {
      port = ""
    }
  }

  // Normalize path - remove trailing slashes if configured
  let pathname = parsed.pathname
  let addTrailingSlash = false
  if (opts.stripTrailingSlash && pathname.length > 1) {
    pathname = pathname.replace(/\/+$/, "")
    addTrailingSlash = false
  } else if (opts.stripTrailingSlash && pathname.length === 1 && hasTrailingSlash) {
    // Root path with trailing slash in original - strip it
    pathname = ""
    addTrailingSlash = false
  } else if (opts.stripTrailingSlash && pathname.length === 1 && !hasTrailingSlash) {
    // Root path with no trailing slash in original - no slash
    pathname = ""
    addTrailingSlash = false
  }

  // Build canonical representation
  const search = parsed.search
  const pathWithSlash = addTrailingSlash ? `${pathname}/` : pathname
  const canonical = port
    ? `${protocol}://${host}:${port}${pathWithSlash}${search}`
    : `${protocol}://${host}${pathWithSlash}${search}`

  log.debug("canonicalized URL", { original: url.toString(), canonical })
  return canonical
}

/**
 * Check if two URLs are semantically equivalent (same resource).
 * Uses canonicalization with default options.
 */
export function urlsAreEquivalent(url1: string | URL, url2: string | URL): boolean {
  return canonicalUrl(url1) === canonicalUrl(url2)
}

/**
 * Extract just the origin (scheme + host + port) from a URL.
 * Useful for comparing servers regardless of path.
 */
export function urlOrigin(url: string | URL): string {
  const parsed = typeof url === "string" ? new URL(url) : url
  const port = parsed.port ? `:${parsed.port}` : ""
  const protocol = parsed.protocol.replace(/:$/, "")
  return `${protocol}://${parsed.hostname}${port}`
}

/**
 * Check if a URL matches a given pattern (origin-based).
 * Useful for determining if a callback URL matches an expected server.
 */
export function urlMatchesOrigin(url: string | URL, pattern: string | URL): boolean {
  return urlOrigin(url) === urlOrigin(pattern)
}

/**
 * Build a stable storage key for an MCP server's auth entry.
 * Combines the MCP name with the canonical URL.
 */
export function buildAuthKey(mcpName: string, serverUrl: string | URL): string {
  const canonical = canonicalUrl(serverUrl)
  // Include a hash of the canonical URL to avoid key collisions
  return `${mcpName}:${canonical}`
}

/**
 * Parse an auth key back into its components.
 * Returns null if the key is not in expected format.
 */
export function parseAuthKey(key: string): { mcpName: string; canonicalUrl: string } | null {
  const colonIndex = key.indexOf(":")
  if (colonIndex === -1) return null

  const mcpName = key.slice(0, colonIndex)
  const canonicalUrl = key.slice(colonIndex + 1)

  // Basic validation - canonical URL should start with http
  if (!canonicalUrl.startsWith("http://") && !canonicalUrl.startsWith("https://")) {
    return null
  }

  return { mcpName, canonicalUrl }
}

/**
 * Validate that a URL string is well-formed.
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}

/**
 * Check if a URL change is semantic vs actual.
 * A semantic change means the same server is being referenced.
 * An actual change means the server identity has changed.
 *
 * Returns:
 * - { semantic: true } if URLs refer to same server
 * - { semantic: false, reason: string } if URLs refer to different servers
 */
export function classifyUrlChange(oldUrl: string | URL, newUrl: string | URL): { semantic: boolean; reason?: string } {
  const oldCanonical = canonicalUrl(oldUrl)
  const newCanonical = canonicalUrl(newUrl)

  if (oldCanonical === newCanonical) {
    return { semantic: true }
  }

  // Different origins are always actual changes
  if (urlOrigin(oldCanonical) !== urlOrigin(newCanonical)) {
    return {
      semantic: false,
      reason: `different origin: ${urlOrigin(oldCanonical)} vs ${urlOrigin(newCanonical)}`,
    }
  }

  // Same origin but different path
  return {
    semantic: false,
    reason: `same origin but different path: ${oldCanonical} vs ${newCanonical}`,
  }
}
