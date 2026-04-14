// Travel Skills Index - Registry of all travel agency skills
import { SkillRegistry } from "../registry/skill-registry"
import { Log } from "@/util/log"

const log = Log.create({ service: "travel.skills" })

// ============================================================================
// Skill Imports
// ============================================================================

// Placeholder imports - will be implemented in Sprint 3
// import { destinationDiscovery } from "./destination-discovery"
// import { destinationCompare } from "./destination-compare"
// import { dateOptimizer } from "./date-optimizer"
// import { flightSearch } from "./flight-search"
// import { hotelSearch } from "./hotel-search"
// import { itineraryBuilder } from "./itinerary-builder"
// import { emergencySupport } from "./emergency-support"

// ============================================================================
// Skill Registry
// ============================================================================

export function registerTravelSkills(): void {
  log.info("Registering travel skills")

  // Destination capabilities
  // SkillRegistry.register("travel-destination-discovery", destinationDiscovery)
  // SkillRegistry.register("travel-destination-compare", destinationCompare)

  // Date optimization
  // SkillRegistry.register("travel-date-optimizer", dateOptimizer)

  // Transport
  // SkillRegistry.register("travel-flight-search", flightSearch)
  // SkillRegistry.register("travel-hotel-search", hotelSearch)

  // Itinerary
  // SkillRegistry.register("travel-itinerary-builder", itineraryBuilder)

  // Emergency
  // SkillRegistry.register("travel-emergency-support", emergencySupport)

  log.info("Travel skills registered", { count: 0 })
}

// ============================================================================
// Skill Configuration
// ============================================================================

export interface TravelSkillConfig {
  skillId: string
  capability: string
  description: string
  timeout: number
  retries: number
  fallbackEnabled: boolean
}

export const TRAVEL_SKILL_CONFIGS: Record<string, TravelSkillConfig> = {
  "travel-destination-discovery": {
    skillId: "travel-destination-discovery",
    capability: "destination-discovery",
    description: "Discover travel destinations based on user preferences and budget",
    timeout: 30000,
    retries: 2,
    fallbackEnabled: true,
  },
  "travel-destination-compare": {
    skillId: "travel-destination-compare",
    capability: "destination-compare",
    description: "Compare multiple destinations for a given travel period",
    timeout: 25000,
    retries: 2,
    fallbackEnabled: true,
  },
  "travel-date-optimizer": {
    skillId: "travel-date-optimizer",
    capability: "date-window-optimization",
    description: "Find optimal travel dates based on prices and weather",
    timeout: 20000,
    retries: 1,
    fallbackEnabled: true,
  },
  "travel-flight-search": {
    skillId: "travel-flight-search",
    capability: "flight-search",
    description: "Search for flights between destinations",
    timeout: 30000,
    retries: 2,
    fallbackEnabled: true,
  },
  "travel-hotel-search": {
    skillId: "travel-hotel-search",
    capability: "hotel-search",
    description: "Search for hotels at destination",
    timeout: 25000,
    retries: 2,
    fallbackEnabled: true,
  },
  "travel-itinerary-builder": {
    skillId: "travel-itinerary-builder",
    capability: "itinerary-build",
    description: "Build detailed travel itinerary with daily activities",
    timeout: 40000,
    retries: 1,
    fallbackEnabled: false,
  },
  "travel-emergency-support": {
    skillId: "travel-emergency-support",
    capability: "emergency-nearby",
    description: "Provide emergency assistance and contacts",
    timeout: 15000,
    retries: 0,
    fallbackEnabled: false, // No fallback for emergencies - go to HITL
  },
}

// ============================================================================
// Execution Helpers
// ============================================================================

export function getSkillTimeout(skillId: string): number {
  return TRAVEL_SKILL_CONFIGS[skillId]?.timeout ?? 30000
}

export function getSkillRetries(skillId: string): number {
  return TRAVEL_SKILL_CONFIGS[skillId]?.retries ?? 1
}

export function isFallbackEnabled(skillId: string): boolean {
  return TRAVEL_SKILL_CONFIGS[skillId]?.fallbackEnabled ?? true
}

// ============================================================================
// Skill Metadata for Telemetry
// ============================================================================

export interface TravelSkillExecution {
  skillId: string
  capability: string
  startTime: number
  endTime?: number
  success?: boolean
  error?: string
  fallbackUsed?: boolean
  provider?: string
  latencyMs?: number
}

export function createSkillExecution(skillId: string, capability: string): TravelSkillExecution {
  return {
    skillId,
    capability,
    startTime: Date.now(),
  }
}

export function completeSkillExecution(
  execution: TravelSkillExecution,
  success: boolean,
  error?: string,
): TravelSkillExecution {
  return {
    ...execution,
    endTime: Date.now(),
    success,
    error,
    latencyMs: Date.now() - execution.startTime,
  }
}
