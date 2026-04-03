// AgencyRegistry Tests - Phase 2: Flexible Agency Architecture

import { describe, it, expect, beforeEach } from "bun:test"
import { AgencyRegistry } from "@/kiloclaw/agency/registry/agency-registry"
import type { AgencyDefinition } from "@/kiloclaw/agency/registry/types"

// Test fixtures
const createTestAgency = (overrides: Partial<AgencyDefinition> = {}): AgencyDefinition => ({
  id: "test-agency",
  name: "Test Agency",
  domain: "test",
  policies: {
    allowedCapabilities: [],
    deniedCapabilities: [],
    maxRetries: 3,
    requiresApproval: false,
    dataClassification: "internal",
  },
  providers: [],
  metadata: {},
  ...overrides,
})

describe("AgencyRegistry", () => {
  beforeEach(() => {
    AgencyRegistry.clear()
  })

  describe("registerAgency", () => {
    it("should register a valid agency", () => {
      const agency = createTestAgency({ id: "knowledge-agency", domain: "knowledge" })
      AgencyRegistry.registerAgency(agency)
      const result = AgencyRegistry.getAgency("knowledge-agency")
      expect(result).toBeDefined()
      expect(result?.id).toBe("knowledge-agency")
      expect(result?.domain).toBe("knowledge")
    })

    it("should throw when registering duplicate agency", () => {
      const agency = createTestAgency({ id: "duplicate" })
      AgencyRegistry.registerAgency(agency)
      expect(() => AgencyRegistry.registerAgency(agency)).toThrow("Agency duplicate already registered")
    })

    it("should throw when domain already registered", () => {
      AgencyRegistry.registerAgency(createTestAgency({ id: "agency-1", domain: "knowledge" }))
      expect(() => AgencyRegistry.registerAgency(createTestAgency({ id: "agency-2", domain: "knowledge" }))).toThrow(
        "Domain 'knowledge' already registered by agency 'agency-1'",
      )
    })

    it("should index agency by domain", () => {
      const agency = createTestAgency({ id: "indexed-agency", domain: "indexed" })
      AgencyRegistry.registerAgency(agency)
      const result = AgencyRegistry.getByDomain("indexed")
      expect(result?.id).toBe("indexed-agency")
    })
  })

  describe("unregisterAgency", () => {
    it("should unregister existing agency", () => {
      AgencyRegistry.registerAgency(createTestAgency({ id: "to-remove" }))
      const result = AgencyRegistry.unregisterAgency("to-remove")
      expect(result).toBe(true)
      expect(AgencyRegistry.getAgency("to-remove")).toBeUndefined()
    })

    it("should remove domain index on unregister", () => {
      AgencyRegistry.registerAgency(createTestAgency({ id: "remove-domain", domain: "to-remove-domain" }))
      AgencyRegistry.unregisterAgency("remove-domain")
      expect(AgencyRegistry.getByDomain("to-remove-domain")).toBeUndefined()
    })

    it("should return false for non-existent agency", () => {
      const result = AgencyRegistry.unregisterAgency("non-existent")
      expect(result).toBe(false)
    })
  })

  describe("getAgency", () => {
    it("should retrieve registered agency", () => {
      const agency = createTestAgency({ id: "retrievable" })
      AgencyRegistry.registerAgency(agency)
      const result = AgencyRegistry.getAgency("retrievable")
      expect(result?.id).toBe("retrievable")
    })

    it("should return undefined for non-existent agency", () => {
      const result = AgencyRegistry.getAgency("non-existent")
      expect(result).toBeUndefined()
    })
  })

  describe("getByDomain", () => {
    it("should retrieve agency by domain", () => {
      const agency = createTestAgency({ id: "domain-agency", domain: "specific-domain" })
      AgencyRegistry.registerAgency(agency)
      const result = AgencyRegistry.getByDomain("specific-domain")
      expect(result?.id).toBe("domain-agency")
    })

    it("should return undefined for non-existent domain", () => {
      const result = AgencyRegistry.getByDomain("non-existent")
      expect(result).toBeUndefined()
    })
  })

  describe("getAllAgencies", () => {
    it("should return all registered agencies", () => {
      AgencyRegistry.registerAgency(createTestAgency({ id: "agency-1", domain: "domain-1" }))
      AgencyRegistry.registerAgency(createTestAgency({ id: "agency-2", domain: "domain-2" }))
      const result = AgencyRegistry.getAllAgencies()
      expect(result).toHaveLength(2)
    })

    it("should return empty array when registry is empty", () => {
      const result = AgencyRegistry.getAllAgencies()
      expect(result).toHaveLength(0)
    })
  })

  describe("getAllowedCapabilities", () => {
    it("should return allowed capabilities for agency", () => {
      const agency = createTestAgency({
        id: "caps-agency",
        policies: {
          allowedCapabilities: ["coding", "review"],
          deniedCapabilities: [],
          maxRetries: 3,
          requiresApproval: false,
          dataClassification: "internal",
        },
      })
      AgencyRegistry.registerAgency(agency)
      const result = AgencyRegistry.getAllowedCapabilities("caps-agency")
      expect(result).toEqual(["coding", "review"])
    })

    it("should return empty array for non-existent agency", () => {
      const result = AgencyRegistry.getAllowedCapabilities("non-existent")
      expect(result).toEqual([])
    })
  })

  describe("getDeniedCapabilities", () => {
    it("should return denied capabilities for agency", () => {
      const agency = createTestAgency({
        id: "denied-agency",
        policies: {
          allowedCapabilities: [],
          deniedCapabilities: ["network", "filesystem"],
          maxRetries: 3,
          requiresApproval: false,
          dataClassification: "internal",
        },
      })
      AgencyRegistry.registerAgency(agency)
      const result = AgencyRegistry.getDeniedCapabilities("denied-agency")
      expect(result).toEqual(["network", "filesystem"])
    })

    it("should return empty array for non-existent agency", () => {
      const result = AgencyRegistry.getDeniedCapabilities("non-existent")
      expect(result).toEqual([])
    })
  })

  describe("clear", () => {
    it("should remove all agencies from registry", () => {
      AgencyRegistry.registerAgency(createTestAgency({ id: "agency-1", domain: "domain-1" }))
      AgencyRegistry.registerAgency(createTestAgency({ id: "agency-2", domain: "domain-2" }))
      AgencyRegistry.clear()
      const result = AgencyRegistry.getAllAgencies()
      expect(result).toHaveLength(0)
    })

    it("should clear domain index", () => {
      AgencyRegistry.registerAgency(createTestAgency({ id: "agency-1", domain: "domain-1" }))
      AgencyRegistry.clear()
      expect(AgencyRegistry.getByDomain("domain-1")).toBeUndefined()
    })
  })
})
