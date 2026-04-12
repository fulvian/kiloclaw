/**
 * Google Workspace Agency E2E Tests
 * P2: End-to-end tests for GWS agency routing and execution
 *
 * Tests the complete flow: intent classification → routing → tool context → skill execution
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { RoutingPipeline } from "@/kiloclaw/agency/routing/pipeline"
import { AgencyRegistry } from "@/kiloclaw/agency/registry/agency-registry"
import { SkillRegistry } from "@/kiloclaw/agency/registry/skill-registry"
import { bootstrapRegistries, resetBootstrap } from "@/kiloclaw/agency/bootstrap"
import type { RouteResult } from "@/kiloclaw/types"

describe("gworkspace-agency e2e", () => {
  beforeEach(() => {
    // Reset and bootstrap registries for fresh state
    resetBootstrap()
    bootstrapRegistries()
  })

  test("routes Gmail search query to agency-gworkspace", async () => {
    const result = await RoutingPipeline.route({
      id: "test-gws-gmail",
      type: "query",
      description: "cerca email su gmail",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-gworkspace")
    expect(result.layers.L0).toBeDefined()
    expect(result.layers.L0?.domain).toBe("gworkspace")
  })

  test("routes Google Drive search to agency-gworkspace", async () => {
    const result = await RoutingPipeline.route({
      id: "test-gws-drive",
      type: "query",
      description: "cerca file su google drive",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-gworkspace")
    expect(result.layers.L0?.domain).toBe("gworkspace")
  })

  test("routes calendar query to agency-gworkspace", async () => {
    const result = await RoutingPipeline.route({
      id: "test-gws-calendar",
      type: "query",
      description: "mostra i miei eventi calendario",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-gworkspace")
    expect(result.layers.L0?.domain).toBe("gworkspace")
  })

  test("routes Google Docs query to agency-gworkspace", async () => {
    const result = await RoutingPipeline.route({
      id: "test-gws-docs",
      type: "query",
      description: "leggi documento google docs",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-gworkspace")
    expect(result.layers.L0?.domain).toBe("gworkspace")
  })

  test("routes Google Sheets query to agency-gworkspace", async () => {
    const result = await RoutingPipeline.route({
      id: "test-gws-sheets",
      type: "query",
      description: "apri foglio google sheets",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-gworkspace")
    expect(result.layers.L0?.domain).toBe("gworkspace")
  })

  test("gworkspace agency policy allows email capabilities", () => {
    const agency = AgencyRegistry.getAgency("agency-gworkspace")
    expect(agency).toBeDefined()
    expect(agency?.policies.allowedCapabilities).toContain("gmail.search")
    expect(agency?.policies.allowedCapabilities).toContain("gmail.read")
    expect(agency?.policies.allowedCapabilities).toContain("gmail.send")
  })

  test("gworkspace agency policy allows calendar capabilities", () => {
    const agency = AgencyRegistry.getAgency("agency-gworkspace")
    expect(agency?.policies.allowedCapabilities).toContain("calendar.list")
    expect(agency?.policies.allowedCapabilities).toContain("calendar.read")
    expect(agency?.policies.allowedCapabilities).toContain("calendar.create")
  })

  test("gworkspace agency policy allows drive capabilities", () => {
    const agency = AgencyRegistry.getAgency("agency-gworkspace")
    expect(agency?.policies.allowedCapabilities).toContain("drive.search")
    expect(agency?.policies.allowedCapabilities).toContain("drive.list")
    expect(agency?.policies.allowedCapabilities).toContain("drive.read")
  })

  test("gworkspace agency policy denies dangerous operations", () => {
    const agency = AgencyRegistry.getAgency("agency-gworkspace")
    expect(agency?.policies.deniedCapabilities).toContain("gmail.bulk_send")
    expect(agency?.policies.deniedCapabilities).toContain("drive.share_public")
  })

  test("gworkspace agency requires approval for operations", () => {
    const agency = AgencyRegistry.getAgency("agency-gworkspace")
    expect(agency?.policies.requiresApproval).toBe(true)
  })

  test("gworkspace skills are registered", () => {
    const gmailSkill = SkillRegistry.getSkill("gworkspace-gmail-search")
    expect(gmailSkill).toBeDefined()

    const driveSkill = SkillRegistry.getSkill("gworkspace-drive-search")
    expect(driveSkill).toBeDefined()

    const calendarSkill = SkillRegistry.getSkill("gworkspace-calendar-list")
    expect(calendarSkill).toBeDefined()
  })

  test("routeResult structure matches RouteResult type for gworkspace", async () => {
    const result = await RoutingPipeline.route({
      id: "test-gws-route-result",
      type: "query",
      description: "cerca email gmail di lavoro",
      risk: "low",
    })

    const routeResult = result.layers.L1?.routeResult

    if (routeResult) {
      // Validate structure matches RouteResult type
      expect(["skill", "chain", "agent"]).toContain(routeResult.type)
      expect(typeof routeResult.confidence).toBe("number")
      expect(routeResult.confidence).toBeGreaterThanOrEqual(0)
      expect(routeResult.confidence).toBeLessThanOrEqual(1)
    }
  })

  test("specific gworkspace keywords route correctly to gworkspace", async () => {
    const keywords = [
      { desc: "cerca email su gmail", expected: "agency-gworkspace" },
      { desc: "leggi email da gmail", expected: "agency-gworkspace" },
      { desc: "cerca file google drive", expected: "agency-gworkspace" },
      { desc: "mostra eventi calendario google", expected: "agency-gworkspace" },
      { desc: "apri documento google docs", expected: "agency-gworkspace" },
    ]

    for (const { desc, expected } of keywords) {
      const result = await RoutingPipeline.route({
        id: `test-gws-${desc.slice(0, 10)}`,
        type: "query",
        description: desc,
        risk: "low",
      })

      expect(result.agencyId).toBe(expected)
    }
  })
})
