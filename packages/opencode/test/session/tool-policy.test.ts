import { describe, expect, test } from "bun:test"
import path from "path"
import {
  mapKnowledgeCapabilitiesToTools,
  mapNbaCapabilitiesToTools,
  resolveAgencyAllowedTools,
} from "../../src/session/tool-policy"

describe("session.tool-policy", () => {
  test("maps knowledge capabilities to expected tools", () => {
    const result = mapKnowledgeCapabilitiesToTools(["search", "verification", "synthesis", "web-search", "unknown-cap"])

    expect(result).toContain("websearch")
    expect(result).toContain("webfetch")
    expect(result).toContain("skill")
    expect(new Set(result).size).toBe(result.length)
  })

  test("returns disabled policy when flag is off", () => {
    const result = resolveAgencyAllowedTools({
      agencyId: "agency-knowledge",
      enabled: false,
      capabilities: ["search"],
    })

    expect(result.enabled).toBe(false)
    expect(result.allowedTools).toEqual([])
  })

  test("returns disabled policy for unknown agency", () => {
    const result = resolveAgencyAllowedTools({
      agencyId: "agency-unknown",
      enabled: true,
      capabilities: ["search"],
    })

    expect(result.enabled).toBe(false)
    expect(result.allowedTools).toEqual([])
  })

  test("enforces knowledge allowlist with capability expansion", () => {
    const result = resolveAgencyAllowedTools({
      agencyId: "agency-knowledge",
      enabled: true,
      capabilities: ["search", "verification", "synthesis"],
    })

    expect(result.enabled).toBe(true)
    expect(result.allowedTools).toContain("websearch")
    expect(result.allowedTools).toContain("webfetch")
    expect(result.allowedTools).toContain("skill")
    expect(result.allowedTools).not.toContain("codesearch")
    expect(result.allowedTools).not.toContain("exa_search")
  })

  test("maps nba capabilities to nba-relevant tools", () => {
    const mapped = mapNbaCapabilitiesToTools(["schedule_live", "odds_markets", "edge_detection"])

    expect(mapped).toContain("websearch")
    expect(mapped).toContain("webfetch")
    expect(mapped).toContain("skill")
    expect(new Set(mapped).size).toBe(mapped.length)
  })

  test("enforces nba allowlist with capability expansion", () => {
    const result = resolveAgencyAllowedTools({
      agencyId: "agency-nba",
      enabled: true,
      capabilities: ["schedule_live", "odds_markets", "edge_detection"],
    })

    expect(result.enabled).toBe(true)
    expect(result.allowedTools).toContain("websearch")
    expect(result.allowedTools).toContain("webfetch")
    expect(result.allowedTools).toContain("skill")
    expect(result.allowedTools).not.toContain("codesearch")
  })
})

describe("knowledge routing labels", () => {
  const root = path.join(import.meta.dir, "../..")

  test("runtime websearch labels no longer contain Exa Web Search", async () => {
    const files = [
      "src/cli/cmd/run.ts",
      "src/cli/cmd/tui/routes/session/index.tsx",
      "src/cli/cmd/tui/routes/session/permission.tsx",
    ]

    const checks = await Promise.all(files.map(async (rel) => Bun.file(path.join(root, rel)).text()))
    const hasLegacy = checks.some((text) => text.includes("Exa Web Search"))
    expect(hasLegacy).toBe(false)
  })
})
