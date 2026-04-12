// Google Workspace OAuth Integration
// OAuth 2.1 with PKCE support

import { Log } from "@/util/log"
import z from "zod"

// ============================================================================
// Configuration
// ============================================================================

export const OAuthConfigSchema = z.object({
  clientId: z.string(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().optional(),
  scopes: z
    .array(z.string())
    .default([
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/drive.readonly",
    ]),
})

export type OAuthConfig = z.infer<typeof OAuthConfigSchema>

// ============================================================================
// Token Store
// ============================================================================

export interface TokenStore {
  accessToken: string
  refreshToken?: string
  expiresAt: number
  tokenType: string
}

// ============================================================================
// OAuth Namespace
// ============================================================================

export namespace GWorkspaceOAuth {
  const log = Log.create({ service: "gworkspace.oauth" })

  const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
  const TOKEN_URL = "https://oauth2.googleapis.com/token"

  // In-memory token cache
  const tokenCache = new Map<string, TokenStore>()

  const TokenResponseSchema = z.object({
    access_token: z.string().optional(),
    accessToken: z.string().optional(),
    refresh_token: z.string().optional(),
    refreshToken: z.string().optional(),
    token_type: z.string().optional(),
    tokenType: z.string().optional(),
    expires_in: z.number().optional(),
    expiresIn: z.number().optional(),
  })

  function parseTokens(payload: unknown, keep?: string): TokenStore {
    const data = TokenResponseSchema.parse(payload)
    const accessToken = data.access_token || data.accessToken
    if (!accessToken) {
      throw new Error("Token response missing access token")
    }

    const tokenType = data.token_type || data.tokenType || "Bearer"
    const expiresIn = data.expires_in ?? data.expiresIn
    if (!expiresIn) {
      throw new Error("Token response missing expires_in")
    }

    const refreshToken = data.refresh_token || data.refreshToken || keep

    return {
      accessToken,
      refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
      tokenType,
    }
  }

  /**
   * Get authorization URL with PKCE
   */
  export function getAuthorizationUrl(config: OAuthConfig, state: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri || "http://localhost:8080/oauth/callback",
      response_type: "code",
      scope: config.scopes.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    })
    return `${AUTH_URL}?${params.toString()}`
  }

  /**
   * Exchange authorization code for tokens
   */
  export async function exchangeCode(config: OAuthConfig, code: string, codeVerifier: string): Promise<TokenStore> {
    log.info("exchanging authorization code")

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret || "",
      redirect_uri: config.redirectUri || "http://localhost:8080/oauth/callback",
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
    })

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })

    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.statusText}`)
    }

    const payload = await response.json()
    return parseTokens(payload)
  }

  /**
   * Refresh access token
   */
  export async function refreshTokens(config: OAuthConfig, refreshToken: string): Promise<TokenStore> {
    log.info("refreshing tokens")

    const params = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret || "",
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    })

    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })

    if (!response.ok) {
      throw new Error(`Token refresh failed: ${response.statusText}`)
    }

    const payload = await response.json()
    return parseTokens(payload, refreshToken)
  }

  /**
   * Store tokens for user
   */
  export function storeTokens(userId: string, tokens: TokenStore): void {
    tokenCache.set(userId, tokens)
  }

  /**
   * Get tokens for user
   */
  export function getTokens(userId: string): TokenStore | undefined {
    return tokenCache.get(userId)
  }

  /**
   * Clear tokens for user
   */
  export function clearTokens(userId: string): void {
    tokenCache.delete(userId)
  }

  /**
   * Check if token is expired
   */
  export function isTokenExpired(userId: string): boolean {
    const tokens = tokenCache.get(userId)
    if (!tokens) return true
    return Date.now() >= tokens.expiresAt
  }

  /**
   * Get valid access token, refreshing if needed
   */
  export async function getValidAccessToken(config: OAuthConfig, userId: string): Promise<string> {
    const tokens = tokenCache.get(userId)
    if (!tokens) {
      throw new Error("No tokens found for user")
    }

    if (Date.now() >= tokens.expiresAt - 60000) {
      log.info("token expiring, refreshing")
      if (!tokens.refreshToken) {
        throw new Error("Cannot refresh access token: refresh token is missing")
      }
      const newTokens = await refreshTokens(config, tokens.refreshToken)
      tokenCache.set(userId, newTokens)
      return newTokens.accessToken
    }

    return tokens.accessToken
  }

  /**
   * Generate PKCE code verifier
   */
  export function generateCodeVerifier(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "")
  }

  /**
   * Generate PKCE code challenge
   */
  export async function generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(verifier)
    const digest = await crypto.subtle.digest("SHA-256", data)
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "")
  }

  /**
   * Generate state parameter
   */
  export function generateState(): string {
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "")
  }
}
