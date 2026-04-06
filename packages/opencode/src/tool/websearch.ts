import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./websearch.txt"
import { abortAfterAny } from "../util/abort"
import { getCatalog } from "../kiloclaw/agency/catalog"
import { Flag } from "@/flag/flag"

// Default number of results
const DEFAULT_NUM_RESULTS = 8

export const WebSearchTool = Tool.define("websearch", async () => {
  return {
    get description() {
      return DESCRIPTION.replace("{{year}}", new Date().getFullYear().toString())
    },
    parameters: z.object({
      query: z.string().describe("Websearch query"),
      numResults: z.number().optional().describe("Number of search results to return (default: 8)"),
      provider: z
        .enum(["tavily", "firecrawl", "ddg", "auto"])
        .optional()
        .describe(
          "Search provider to use: 'tavily', 'firecrawl', 'ddg', or 'auto' (default: auto - uses first available)",
        ),
    }),
    async execute(params, ctx) {
      await ctx.ask({
        permission: "websearch",
        patterns: [params.query],
        always: ["*"],
        metadata: {
          query: params.query,
          numResults: params.numResults,
          provider: params.provider,
        },
      })

      const { signal, clearTimeout } = abortAfterAny(25000, ctx.abort)

      const numResults = params.numResults || DEFAULT_NUM_RESULTS

      try {
        const catalog = getCatalog()
        const providers = catalog.listProviders("knowledge")

        // Priority order for search providers (ddg is free fallback)
        const providerPriority = ["tavily", "firecrawl", "brave", "ddg", "wikipedia"]

        // Check for forced provider via environment variable
        const forcedProvider = Flag.KILOCLAW_KNOWLEDGE_FORCE_PROVIDER
        const selectedProvider = forcedProvider || params.provider || "auto"

        // Sort providers by priority
        const sortedProviders = providers.sort((a, b) => {
          if (selectedProvider !== "auto") {
            // If specific provider requested, prioritize it
            if (a.name === selectedProvider) return -1
            if (b.name === selectedProvider) return 1
          }
          const aIdx = providerPriority.indexOf(a.name)
          const bIdx = providerPriority.indexOf(b.name)
          return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
        })

        let lastError: Error | null = null
        let results: any[] = []
        let providerUsed = ""
        const errors: string[] = []

        // Try providers in order
        for (const prov of sortedProviders) {
          if (results.length >= numResults) break

          try {
            const searchResults = await prov.search({
              query: params.query,
              limit: numResults,
            })

            if (searchResults.length > 0) {
              results = searchResults
              providerUsed = prov.name
              break
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err)
            errors.push(`${prov.name}: ${errMsg}`)
            lastError = err instanceof Error ? err : new Error(String(err))
            // Continue to next provider
          }
        }

        clearTimeout()

        if (results.length === 0) {
          const errorDetails = errors.length > 0 ? `\nProvider errors: ${errors.join("; ")}` : ""
          const hint = errors.some((e) => e.includes("No available API keys"))
            ? "\nHint: Set TAVILY_API_KEY, FIRECRAWL_API_KEY, or BRAVE_API_KEY for better results. DDG is available as a free fallback."
            : ""
          return {
            output: `No search results found. Please try a different query.${errorDetails}${hint}`,
            title: `Web search: ${params.query}`,
            metadata: { provider: "none", errors },
          }
        }

        // Format results for LLM consumption
        const formattedResults = results
          .slice(0, numResults)
          .map((r, i) => `${i + 1}. [${r.title}](${r.url}) - ${r.description || r.snippet || ""}`)
          .join("\n\n")

        const responseText = `Search results for "${params.query}" (via ${providerUsed}):\n\n${formattedResults}`

        const metadata: Record<string, unknown> = {
          provider: providerUsed,
        }
        if (results.length > 0) {
          metadata.resultCount = results.length
        }

        return {
          output: responseText,
          title: `Web search: ${params.query}`,
          metadata,
        }
      } catch (error) {
        clearTimeout()

        if (error instanceof Error && error.name === "AbortError") {
          throw new Error("Search request timed out")
        }

        throw error
      }
    },
  }
})
