import { describe, expect, it } from "bun:test"
import { KeyManager } from "@/kiloclaw/agency/key-pool"

describe("key pool aliases", () => {
  it("loads keys from primary and alias env prefixes", () => {
    const id = Date.now().toString(36)
    const main = `ROTATE_${id}`
    const alias = `ROTATE_ALIAS_${id}`

    process.env[`${main}_API_KEY_1`] = "k-main-1"
    process.env[`${alias}_API_KEY`] = "k-alias-1"

    const mgr = KeyManager.getInstance()
    mgr.loadKeysFromEnv(main, { requestsPerMinute: 10 }, [alias])

    const pool = mgr.getPool(main)
    const stats = pool.getStats()
    expect(stats.totalKeys).toBe(2)

    delete process.env[`${main}_API_KEY_1`]
    delete process.env[`${alias}_API_KEY`]
  })

  it("supports odds alias migration names", () => {
    const id = Date.now().toString(36)
    const alias = `THE_ODDS_${id}`
    process.env[`${alias}_API_KEY`] = "k-odds-1"

    const mgr = KeyManager.getInstance()
    const pref = `ODDS_${id}`
    mgr.loadKeysFromEnv(pref, { requestsPerMinute: 10 }, [alias])

    const pool = mgr.getPool(pref)
    const stats = pool.getStats()
    expect(stats.totalKeys).toBe(1)

    delete process.env[`${alias}_API_KEY`]
  })

  it("loads perplexity keys in loadAllFromEnv", () => {
    const id = Date.now().toString(36)
    const key = `ppx-${id}-token`
    process.env.PERPLEXITY_API_KEY = key

    const mgr = KeyManager.getInstance()
    mgr.loadAllFromEnv()

    const pool = mgr.getPool("PERPLEXITY")
    const hasKey = pool
      .listKeys()
      .some((item) => item.maskedKey.startsWith(key.slice(0, 4)) && item.maskedKey.endsWith(key.slice(-4)))

    expect(hasKey).toBe(true)

    delete process.env.PERPLEXITY_API_KEY
  })
})
