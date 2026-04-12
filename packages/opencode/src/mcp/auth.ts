import z from "zod"
import { McpAuthStore } from "./auth-store"
import { canonicalUrl } from "./auth-url"

export namespace McpAuth {
  export const Tokens = z.object({
    accessToken: z.string(),
    refreshToken: z.string().optional(),
    expiresAt: z.number().optional(),
    scope: z.string().optional(),
  })
  export type Tokens = z.infer<typeof Tokens>

  export const ClientInfo = z.object({
    clientId: z.string(),
    clientSecret: z.string().optional(),
    clientIdIssuedAt: z.number().optional(),
    clientSecretExpiresAt: z.number().optional(),
  })
  export type ClientInfo = z.infer<typeof ClientInfo>

  export const Entry = z.object({
    tokens: Tokens.optional(),
    clientInfo: ClientInfo.optional(),
    codeVerifier: z.string().optional(),
    oauthState: z.string().optional(),
    serverUrl: z.string().optional(), // Track the URL these credentials are for
  })
  export type Entry = z.infer<typeof Entry>

  // Delegate to canonical+runtime store for all operations
  // This ensures credentials are available across all worktrees

  export async function get(mcpName: string): Promise<Entry | undefined> {
    return McpAuthStore.get(mcpName)
  }

  /**
   * Get auth entry and validate it's for the correct URL.
   * Returns undefined if URL has changed (credentials are invalid).
   * Uses URL canonicalization for stable comparison.
   */
  export async function getForUrl(mcpName: string, serverUrl: string): Promise<Entry | undefined> {
    return McpAuthStore.getForUrl(mcpName, serverUrl)
  }

  export async function all(): Promise<Record<string, Entry>> {
    return McpAuthStore.all()
  }

  export async function set(mcpName: string, entry: Entry, serverUrl?: string): Promise<void> {
    return McpAuthStore.set(mcpName, entry, serverUrl)
  }

  export async function remove(mcpName: string): Promise<void> {
    return McpAuthStore.remove(mcpName)
  }

  export async function updateTokens(mcpName: string, tokens: Tokens, serverUrl?: string): Promise<void> {
    return McpAuthStore.updateTokens(mcpName, tokens, serverUrl)
  }

  export async function updateClientInfo(mcpName: string, clientInfo: ClientInfo, serverUrl?: string): Promise<void> {
    return McpAuthStore.updateClientInfo(mcpName, clientInfo, serverUrl)
  }

  export async function updateCodeVerifier(mcpName: string, codeVerifier: string): Promise<void> {
    return McpAuthStore.updateCodeVerifier(mcpName, codeVerifier)
  }

  export async function clearCodeVerifier(mcpName: string): Promise<void> {
    return McpAuthStore.clearCodeVerifier(mcpName)
  }

  export async function updateOAuthState(mcpName: string, oauthState: string): Promise<void> {
    return McpAuthStore.updateOAuthState(mcpName, oauthState)
  }

  export async function getOAuthState(mcpName: string): Promise<string | undefined> {
    return McpAuthStore.getOAuthState(mcpName)
  }

  export async function clearOAuthState(mcpName: string): Promise<void> {
    return McpAuthStore.clearOAuthState(mcpName)
  }

  /**
   * Check if stored tokens are expired.
   * Returns null if no tokens exist, false if no expiry or not expired, true if expired.
   * Uses a 120-second skew to avoid race conditions near expiry.
   */
  export async function isTokenExpired(mcpName: string): Promise<boolean | null> {
    return McpAuthStore.isTokenExpired(mcpName, 120)
  }
}
