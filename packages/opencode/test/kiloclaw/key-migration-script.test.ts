import { describe, expect, it } from "bun:test"
import {
  BLOCK_END,
  BLOCK_START,
  normalizeBuckets,
  parseKeyLines,
  renderManagedBlock,
  replaceManagedBlock,
} from "@/kiloclaw/agency/key-migration"

describe("key migration script helpers", () => {
  it("parses dotenv style key lines", () => {
    const env = `
      # comment
      export BRAVE_SEARCH_API_KEY=brave-a
      TAVILY_API_KEYS=tav-1,tav-2
      IGNORE_ME=
      INVALID LINE
    `

    const entries = parseKeyLines(env)
    expect(entries).toEqual([
      { name: "BRAVE_SEARCH_API_KEY", value: "brave-a" },
      { name: "TAVILY_API_KEYS", value: "tav-1,tav-2" },
    ])
  })

  it("normalizes aliases into provider buckets and dedups keys", () => {
    const entries = parseKeyLines(`
      BRAVE_SEARCH_API_KEY=brave-a
      BRAVE_API_KEY=brave-a
      API_STORE_PERPLEXITY_KEY=ppx-a
      PERPLEXITY_API_KEYS=ppx-a,ppx-b
      API_STORE_ODDS_API_KEY=odds-a
      ODDS_API_KEY=odds-a
      THE_ODDS_API_KEY=odds-b
      API_STORE_BALLDONTLIE_KEY=ball-a
      POLYMARKET_API_KEY_1=poly-a
    `)

    const buckets = normalizeBuckets(entries)

    expect(buckets.BRAVE).toEqual(["brave-a"])
    expect(buckets.PERPLEXITY).toEqual(["ppx-a", "ppx-b"])
    expect(buckets.ODDS).toEqual(["odds-a", "odds-b"])
    expect(buckets.BALLDONTLIE).toEqual(["ball-a"])
    expect(buckets.POLYMARKET).toEqual(["poly-a"])
  })

  it("renders and replaces managed block", () => {
    const buckets = normalizeBuckets(
      parseKeyLines(`
        BRAVE_SEARCH_API_KEY=brave-a
        PERPLEXITY_API_KEY=ppx-a
      `),
    )

    const block = renderManagedBlock(buckets)
    expect(block).toContain(BLOCK_START)
    expect(block).toContain(BLOCK_END)
    expect(block).toContain("BRAVE_API_KEY_1=brave-a")
    expect(block).toContain("PERPLEXITY_API_KEYS=ppx-a")

    const original = `FOO=1\n${BLOCK_START}\nOLD=1\n${BLOCK_END}\nBAR=2\n`
    const replaced = replaceManagedBlock(original, block)
    expect(replaced).toContain("FOO=1")
    expect(replaced).toContain("BAR=2")
    expect(replaced).not.toContain("OLD=1")
    expect(replaced).toContain("BRAVE_API_KEY_1=brave-a")
  })

  it("does not render empty API_KEYS variables", () => {
    const buckets = normalizeBuckets(
      parseKeyLines(`
        BRAVE_SEARCH_API_KEY=brave-a
      `),
    )

    const block = renderManagedBlock(buckets)
    expect(block).toContain("BRAVE_API_KEYS=brave-a")
    expect(block).not.toContain("FIRECRAWL_API_KEYS=")
    expect(block).not.toContain("POLYMARKET_API_KEYS=")
  })
})
