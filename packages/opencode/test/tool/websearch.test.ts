import { describe, expect, mock, test } from "bun:test"
import path from "path"
import { Instance } from "../../src/project/instance"

const projectRoot = path.join(import.meta.dir, "../..")

const ctx = {
  sessionID: "test",
  messageID: "message",
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => {},
  ask: async () => {},
}

const providers: Array<{ name: string; search: (input: { query: string; limit: number }) => Promise<any[]> }> = [
  {
    name: "tavily",
    search: async ({ query, limit }: { query: string; limit: number }) =>
      [
        {
          title: `result for ${query}`,
          url: "https://example.com/result",
          description: "mock description",
          provider: "tavily",
        },
      ].slice(0, limit),
  },
]

mock.module("@/kiloclaw/agency/catalog", () => ({
  getCatalog: () => ({
    listProviders: () => providers,
  }),
}))

describe("tool.websearch", () => {
  test("returns providerUsed and fallback metadata", async () => {
    providers.splice(0, providers.length, {
      name: "tavily",
      search: async ({ query, limit }: { query: string; limit: number }) =>
        [
          {
            title: `result for ${query}`,
            url: "https://example.com/result",
            description: "mock description",
            provider: "tavily",
          },
        ].slice(0, limit),
    })

    const { WebSearchTool } = await import("../../src/tool/websearch")

    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const websearch = await WebSearchTool.init()
        const result = await websearch.execute(
          { query: "macbook pro usato", numResults: 1, provider: "auto" },
          ctx as any,
        )

        expect(result.metadata).toBeDefined()
        expect(result.metadata?.provider).toBe("tavily")
        expect(result.metadata?.providerUsed).toBe("tavily")
        expect(Array.isArray(result.metadata?.fallbackChainTried)).toBe(true)
        expect(result.metadata?.resultCount).toBe(1)
      },
    })
  })

  test("records fallback chain and provider errors before succeeding", async () => {
    providers.splice(
      0,
      providers.length,
      {
        name: "tavily",
        search: async () => {
          throw new Error("temporary provider error")
        },
      },
      {
        name: "brave",
        search: async ({ query, limit }: { query: string; limit: number }) =>
          [
            {
              title: `brave result for ${query}`,
              url: "https://example.com/brave",
              description: "brave description",
              provider: "brave",
            },
          ].slice(0, limit),
      },
    )

    const { WebSearchTool } = await import("../../src/tool/websearch")

    await Instance.provide({
      directory: projectRoot,
      fn: async () => {
        const websearch = await WebSearchTool.init()
        const result = await websearch.execute({ query: "routing audit", numResults: 1, provider: "auto" }, ctx as any)

        expect(result.metadata?.providerUsed).toBe("brave")
        expect(result.metadata?.fallbackChainTried).toEqual(["tavily", "brave"])
        expect(result.metadata?.errorsByProvider).toEqual({ tavily: "temporary provider error" })
      },
    })
  })
})
