// API Key Pool Manager - Handles multiple API keys per provider with rotation and rate limiting
// Ensures high availability by distributing requests across keys and failover on rate limits

import { Log } from "@/util/log"

export interface RateLimitConfig {
  requestsPerMinute: number
  requestsPerDay?: number
  retryAfterMs?: number // base retry delay on rate limit
}

export interface ApiKeyState {
  key: string
  isAvailable: boolean
  requestsThisMinute: number
  requestsToday: number
  minuteWindowStart: number
  dayWindowStart: number
  consecutiveErrors: number
  lastUsed: number
  lastError?: string
  cooldownUntil?: number // timestamp when key will be available again
}

// KeyPool manages a set of API keys for a single provider
export class KeyPool {
  private keys: ApiKeyState[] = []
  private config: RateLimitConfig
  private provider: string
  private log: ReturnType<typeof Log.create>
  private currentIndex = 0 // round-robin counter

  constructor(provider: string, config: RateLimitConfig) {
    this.provider = provider
    this.log = Log.create({ service: `kiloclaw.keypool.${provider}` })
    this.config = {
      requestsPerMinute: config.requestsPerMinute ?? 60,
      requestsPerDay: config.requestsPerDay,
      retryAfterMs: config.retryAfterMs ?? 60000, // default 1 minute
    }
  }

  // Add a key to the pool
  addKey(apiKey: string): void {
    if (this.keys.some((k) => k.key === apiKey)) {
      this.log.debug("key already exists, skipping", { provider: this.provider })
      return
    }

    this.keys.push({
      key: apiKey,
      isAvailable: true,
      requestsThisMinute: 0,
      requestsToday: 0,
      minuteWindowStart: Date.now(),
      dayWindowStart: Date.now(),
      consecutiveErrors: 0,
      lastUsed: 0,
    })

    this.log.info("key added to pool", { provider: this.provider, totalKeys: this.keys.length })
  }

  // Get the next available key using round-robin with availability check
  getKey(): ApiKeyState | null {
    if (this.keys.length === 0) {
      this.log.warn("no keys available in pool", { provider: this.provider })
      return null
    }

    // First, check if any keys are coming out of cooldown
    const now = Date.now()
    for (const keyState of this.keys) {
      if (keyState.cooldownUntil && keyState.cooldownUntil <= now) {
        keyState.cooldownUntil = undefined
        keyState.isAvailable = true
        keyState.consecutiveErrors = 0
        this.log.info("key recovered from cooldown", { provider: this.provider })
      }
    }

    // Reset minute window if expired (sliding window)
    for (const keyState of this.keys) {
      if (now - keyState.minuteWindowStart >= 60000) {
        keyState.requestsThisMinute = 0
        keyState.minuteWindowStart = now
      }
    }

    // Reset day window if expired
    if (this.config.requestsPerDay) {
      for (const keyState of this.keys) {
        if (now - keyState.dayWindowStart >= 86400000) {
          keyState.requestsToday = 0
          keyState.dayWindowStart = now
        }
      }
    }

    // Find next available key starting from current index
    const keysChecked: number[] = []
    let attempts = 0
    const maxAttempts = this.keys.length * 2 // prevent infinite loop

    while (attempts < maxAttempts) {
      const keyState = this.keys[this.currentIndex]
      if (!keyState) {
        this.currentIndex = (this.currentIndex + 1) % Math.max(this.keys.length, 1)
        attempts++
        continue
      }

      keysChecked.push(this.currentIndex)

      // Increment index for next call (round-robin)
      this.currentIndex = (this.currentIndex + 1) % this.keys.length
      attempts++

      if (!keyState.isAvailable) {
        continue
      }

      // Check rate limits
      if (keyState.requestsThisMinute >= this.config.requestsPerMinute) {
        this.log.debug("key at minute rate limit", { provider: this.provider, key: keyState.key.slice(0, 8) })
        continue
      }

      if (this.config.requestsPerDay && keyState.requestsToday >= this.config.requestsPerDay) {
        this.log.debug("key at daily rate limit", { provider: this.provider, key: keyState.key.slice(0, 8) })
        // Set cooldown until midnight UTC
        const tomorrow = new Date()
        tomorrow.setUTCHours(24, 0, 0, 0)
        keyState.cooldownUntil = tomorrow.getTime()
        keyState.isAvailable = false
        continue
      }

      if (keyState.cooldownUntil && keyState.cooldownUntil > now) {
        this.log.debug("key in cooldown", { provider: this.provider, key: keyState.key.slice(0, 8) })
        continue
      }

      // Key is available
      keyState.requestsThisMinute++
      keyState.requestsToday++
      keyState.lastUsed = now
      keyState.consecutiveErrors = 0

      return keyState
    }

    this.log.warn("no available keys in pool", {
      provider: this.provider,
      checked: keysChecked.length,
      available: this.keys.filter((k) => k.isAvailable).length,
    })

    return null
  }

  // Mark a key as rate limited (called when API returns 429)
  markRateLimited(key: string, retryAfterSeconds?: number): void {
    const keyState = this.keys.find((k) => k.key === key)
    if (!keyState) return

    keyState.isAvailable = false
    keyState.consecutiveErrors++

    // Use server-provided retry-after or exponential backoff
    const retryAfterMs = retryAfterSeconds
      ? retryAfterSeconds * 1000
      : this.config.retryAfterMs! * Math.pow(2, keyState.consecutiveErrors - 1)

    keyState.cooldownUntil = Date.now() + Math.min(retryAfterMs, 3600000) // max 1 hour
    keyState.lastError = `rate_limited`

    this.log.warn("key marked rate limited", {
      provider: this.provider,
      key: key.slice(0, 8),
      retryAfterMs,
      consecutiveErrors: keyState.consecutiveErrors,
    })
  }

  // Mark a key as errored (called on API errors)
  markError(key: string, error: string): void {
    const keyState = this.keys.find((k) => k.key === key)
    if (!keyState) return

    keyState.consecutiveErrors++
    keyState.lastError = error

    // After 3 consecutive errors, put key in cooldown
    if (keyState.consecutiveErrors >= 3) {
      keyState.isAvailable = false
      keyState.cooldownUntil = Date.now() + this.config.retryAfterMs! * Math.pow(2, keyState.consecutiveErrors - 3)
      this.log.warn("key marked unavailable after consecutive errors", {
        provider: this.provider,
        key: key.slice(0, 8),
        consecutiveErrors: keyState.consecutiveErrors,
      })
    }
  }

  // Mark a key as successful
  markSuccess(key: string): void {
    const keyState = this.keys.find((k) => k.key === key)
    if (!keyState) return

    keyState.consecutiveErrors = 0
    keyState.isAvailable = true
    keyState.lastError = undefined
  }

  // Get pool statistics
  getStats(): {
    provider: string
    totalKeys: number
    availableKeys: number
    keysAtMinuteLimit: number
    keysAtDailyLimit: number
    keysInCooldown: number
  } {
    const now = Date.now()
    const dailyLimit = this.config.requestsPerDay
    return {
      provider: this.provider,
      totalKeys: this.keys.length,
      availableKeys: this.keys.filter((k) => k.isAvailable && (!k.cooldownUntil || k.cooldownUntil <= now)).length,
      keysAtMinuteLimit: this.keys.filter((k) => k.requestsThisMinute >= this.config.requestsPerMinute).length,
      keysAtDailyLimit: dailyLimit ? this.keys.filter((k) => k.requestsToday >= dailyLimit).length : 0,
      keysInCooldown: this.keys.filter((k) => k.cooldownUntil && k.cooldownUntil > now).length,
    }
  }

  // List all keys (masked)
  listKeys(): { maskedKey: string; isAvailable: boolean; lastUsed: number }[] {
    return this.keys.map((k) => ({
      maskedKey: k.key.slice(0, 4) + "..." + k.key.slice(-4),
      isAvailable: k.isAvailable,
      lastUsed: k.lastUsed,
    }))
  }
}

// KeyManager - Global singleton managing all provider key pools
export class KeyManager {
  private static instance: KeyManager | null = null
  private pools = new Map<string, KeyPool>()
  private log = Log.create({ service: "kiloclaw.keymanager" })

  private constructor() {}

  static getInstance(): KeyManager {
    if (!KeyManager.instance) {
      KeyManager.instance = new KeyManager()
    }
    return KeyManager.instance
  }

  // Get or create a pool for a provider
  getPool(provider: string, config?: RateLimitConfig): KeyPool {
    if (!this.pools.has(provider)) {
      this.pools.set(provider, new KeyPool(provider, config ?? { requestsPerMinute: 60 }))
    }
    return this.pools.get(provider)!
  }

  // Auto-discover and load keys from environment
  // Format: PROVIDER_API_KEY_1, PROVIDER_API_KEY_2, ... or PROVIDER_API_KEYS=key1,key2,key3
  loadKeysFromEnv(prefix: string, config?: RateLimitConfig): void {
    const pool = this.getPool(prefix, config)
    let loaded = 0

    // First try indexed format: TAVILY_API_KEY_1, TAVILY_API_KEY_2, etc.
    for (let i = 1; i <= 100; i++) {
      const key = process.env[`${prefix}_API_KEY_${i}`]
      if (key) {
        pool.addKey(key)
        loaded++
      } else if (i === 1) {
        // If _1 doesn't exist, try just PROVIDER_API_KEY (single key)
        const singleKey = process.env[`${prefix}_API_KEY`]
        if (singleKey) {
          pool.addKey(singleKey)
          loaded++
        }
        break
      }
    }

    // Also check comma-separated format: TAVILY_API_KEYS=key1,key2,key3
    const commaKeys = process.env[`${prefix}_API_KEYS`]
    if (commaKeys) {
      for (const key of commaKeys.split(",").map((k) => k.trim())) {
        if (key) {
          pool.addKey(key)
          loaded++
        }
      }
    }

    if (loaded > 0) {
      this.log.info(`loaded ${loaded} API keys for ${prefix}`, {
        prefix,
        keys: loaded,
        config,
      })
    }
  }

  // Load all known provider keys from environment
  loadAllFromEnv(): void {
    // Knowledge providers
    this.loadKeysFromEnv("TAVILY", { requestsPerMinute: 15, requestsPerDay: 500, retryAfterMs: 60000 })
    this.loadKeysFromEnv("BRAVE", { requestsPerMinute: 60, requestsPerDay: 2000, retryAfterMs: 60000 })
    this.loadKeysFromEnv("FIRECRAWL", { requestsPerMinute: 20, requestsPerDay: 1000, retryAfterMs: 60000 })
    this.loadKeysFromEnv("PUBMED", { requestsPerMinute: 10, requestsPerDay: 500, retryAfterMs: 60000 })
    this.loadKeysFromEnv("SEMANTICSCHOLAR", { requestsPerMinute: 10, requestsPerDay: 500, retryAfterMs: 60000 })
    this.loadKeysFromEnv("CROSSREF", { requestsPerMinute: 50, requestsPerDay: 5000, retryAfterMs: 60000 })

    // Nutrition providers
    this.loadKeysFromEnv("USDA", { requestsPerMinute: 60, requestsPerDay: 10000, retryAfterMs: 60000 })
    this.loadKeysFromEnv("OPENFOODFACTS", { requestsPerMinute: 30, requestsPerDay: 5000, retryAfterMs: 60000 })

    // Weather providers
    this.loadKeysFromEnv("OPENWEATHERMAP", { requestsPerMinute: 60, requestsPerDay: 50000, retryAfterMs: 60000 })
    this.loadKeysFromEnv("WEATHERAPI", { requestsPerMinute: 60, requestsPerDay: 1000000, retryAfterMs: 60000 })

    this.log.info("key manager initialization complete", {
      providers: this.pools.size,
      stats: [...this.pools.entries()].map(([name, pool]) => [name, pool.getStats()]),
    })
  }

  // Get all pool stats
  getAllStats(): Record<string, ReturnType<KeyPool["getStats"]>> {
    const stats: Record<string, ReturnType<KeyPool["getStats"]>> = {}
    for (const [name, pool] of this.pools) {
      stats[name] = pool.getStats()
    }
    return stats
  }

  // List all available providers and their key counts
  listProviders(): { provider: string; keyCount: number; availableKeys: number }[] {
    return [...this.pools.entries()].map(([name, pool]) => {
      const stats = pool.getStats()
      return {
        provider: name,
        keyCount: stats.totalKeys,
        availableKeys: stats.availableKeys,
      }
    })
  }
}

// Helper function to create a rate-limited fetch wrapper
export async function withKeyRotation<T>(provider: string, operation: (key: string) => Promise<T>): Promise<T> {
  const manager = KeyManager.getInstance()
  const pool = manager.getPool(provider)

  const keyState = pool.getKey()
  if (!keyState) {
    throw new Error(`No available API keys for provider: ${provider}`)
  }

  try {
    const result = await operation(keyState.key)
    pool.markSuccess(keyState.key)
    return result
  } catch (error: any) {
    const status = error?.status || error?.statusCode

    if (status === 429) {
      // Rate limited - get retry-after from response headers
      const retryAfter = error?.headers?.["retry-after"]
      pool.markRateLimited(keyState.key, retryAfter ? parseInt(retryAfter, 10) : undefined)
    } else if (status >= 400 && status < 500) {
      // Client error - mark as errored
      pool.markError(keyState.key, error?.message || `HTTP ${status}`)
    } else {
      // Server error or network error - mark as errored
      pool.markError(keyState.key, error?.message || "Unknown error")
    }

    throw error
  }
}
