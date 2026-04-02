import { Log } from "@/util/log"
import type { Procedure, ProcedureId, Version, VersionId, SkillPattern, PatternId, ProcedureFilter } from "./types.js"
import { SkillId } from "../types.js"
import {
  ProcedureSchema,
  ProcedureIdFactory,
  VersionSchema,
  VersionIdFactory,
  SkillPatternSchema,
  ProcedureFilterSchema,
} from "./types.js"
import type { ProceduralMemory as IProceduralMemory } from "./types.js"

const log = Log.create({ service: "kiloclaw.memory.procedural" })

// Module-level state
const procedures = new Map<ProcedureId, Procedure>()
const versions = new Map<ProcedureId, Version[]>()
const patterns = new Map<PatternId, SkillPattern>()
const patternsBySkill = new Map<SkillId, PatternId>()
const proceduresByAgency = new Map<string, ProcedureId[]>()
const proceduresBySkill = new Map<SkillId, ProcedureId[]>()

export namespace ProceduralMemory {
  /**
   * Register a new procedure
   */
  export async function register(procedure: Omit<Procedure, "id" | "createdAt" | "updatedAt">): Promise<ProcedureId> {
    const id = ProcedureIdFactory.create()
    const now = new Date().toISOString()

    const fullProcedure: Procedure = ProcedureSchema.parse({
      ...procedure,
      id,
      createdAt: now,
      updatedAt: now,
    })

    // Store procedure
    procedures.set(id, fullProcedure)

    // Create initial version
    const version: Version = VersionSchema.parse({
      id: VersionIdFactory.create(),
      procedureId: id,
      version: fullProcedure.version,
      procedure: fullProcedure,
      createdAt: now,
      createdBy: "system",
      reason: "Initial version",
    })

    const procedureVersions = versions.get(id) || []
    procedureVersions.push(version)
    versions.set(id, procedureVersions)

    // Index by agency
    if (fullProcedure.agencyId) {
      const agencyProcs = proceduresByAgency.get(fullProcedure.agencyId) || []
      agencyProcs.push(id)
      proceduresByAgency.set(fullProcedure.agencyId, agencyProcs)
    }

    // Index by skill
    if (fullProcedure.skillId) {
      const skillProcs = proceduresBySkill.get(fullProcedure.skillId) || []
      skillProcs.push(id)
      proceduresBySkill.set(fullProcedure.skillId, skillProcs)
    }

    log.debug("procedure registered", { procedureId: id, name: fullProcedure.name })
    return id
  }

  /**
   * Get a procedure by ID
   */
  export async function get(procedureId: ProcedureId): Promise<Procedure | null> {
    return procedures.get(procedureId) || null
  }

  /**
   * List procedures with optional filter
   */
  export async function list(filter?: ProcedureFilter): Promise<Procedure[]> {
    if (!filter) {
      return Array.from(procedures.values())
    }

    const validated = ProcedureFilterSchema.parse(filter || {})
    let allProcedures = Array.from(procedures.values())

    // Apply filters
    if (validated.agencyId) {
      const ids = proceduresByAgency.get(validated.agencyId) || []
      const idSet = new Set(ids)
      allProcedures = allProcedures.filter((p) => idSet.has(p.id))
    }

    if (validated.skillId) {
      const ids = proceduresBySkill.get(validated.skillId) || []
      const idSet = new Set(ids)
      allProcedures = allProcedures.filter((p) => idSet.has(p.id))
    }

    if (validated.name) {
      allProcedures = allProcedures.filter((p) => p.name.toLowerCase().includes(validated.name!.toLowerCase()))
    }

    if (validated.version) {
      allProcedures = allProcedures.filter((p) => p.version === validated.version)
    }

    return allProcedures
  }

  /**
   * Update a procedure
   */
  export async function update(procedureId: ProcedureId, updates: Partial<Procedure>): Promise<void> {
    const procedure = procedures.get(procedureId)
    if (!procedure) return

    const now = new Date().toISOString()
    const updatedProcedure: Procedure = {
      ...procedure,
      ...updates,
      id: procedureId,
      createdAt: procedure.createdAt,
      updatedAt: now,
    }

    // Validate and store
    procedures.set(procedureId, ProcedureSchema.parse(updatedProcedure))

    // Create new version entry if version changed
    if (updates.version && updates.version !== procedure.version) {
      const version: Version = VersionSchema.parse({
        id: VersionIdFactory.create(),
        procedureId,
        version: updatedProcedure.version,
        procedure: updatedProcedure,
        createdAt: now,
        createdBy: "system",
        reason: `Updated from ${procedure.version}`,
      })

      const procedureVersions = versions.get(procedureId) || []
      procedureVersions.push(version)
      versions.set(procedureId, procedureVersions)
    }

    log.debug("procedure updated", { procedureId })
  }

  /**
   * Get version history for a procedure
   */
  export async function getVersionHistory(procedureId: ProcedureId): Promise<Version[]> {
    return versions.get(procedureId) || []
  }

  /**
   * Rollback to a specific version
   */
  export async function rollback(procedureId: ProcedureId, versionId: VersionId): Promise<void> {
    const procedureVersions = versions.get(procedureId)
    if (!procedureVersions) return

    const targetVersion = procedureVersions.find((v) => v.id === versionId)
    if (!targetVersion) return

    const now = new Date().toISOString()
    const rolledBack: Procedure = {
      ...targetVersion.procedure,
      updatedAt: now,
    }

    procedures.set(procedureId, ProcedureSchema.parse(rolledBack))

    // Record rollback as new version
    const version: Version = VersionSchema.parse({
      id: VersionIdFactory.create(),
      procedureId,
      version: rolledBack.version,
      procedure: rolledBack,
      createdAt: now,
      createdBy: "system",
      reason: `Rollback to version ${targetVersion.version}`,
    })

    procedureVersions.push(version)
    versions.set(procedureId, procedureVersions)

    log.debug("procedure rolled back", { procedureId, versionId })
  }

  /**
   * Register a skill pattern
   */
  export async function registerPattern(pattern: Omit<SkillPattern, "id">): Promise<PatternId> {
    const id = `pat_${crypto.randomUUID()}` as PatternId
    const fullPattern: SkillPattern = SkillPatternSchema.parse({
      ...pattern,
      id,
    })

    patterns.set(id, fullPattern)
    patternsBySkill.set(fullPattern.skillId, id)

    log.debug("skill pattern registered", { patternId: id, skillId: pattern.skillId })
    return id
  }

  /**
   * Find pattern for a skill
   */
  export async function findPattern(skillId: SkillId): Promise<SkillPattern | null> {
    const patternId = patternsBySkill.get(skillId)
    if (!patternId) return null
    return patterns.get(patternId) || null
  }

  /**
   * Update pattern statistics
   */
  export async function updatePatternStats(patternId: PatternId, success: boolean): Promise<void> {
    const pattern = patterns.get(patternId)
    if (!pattern) return

    // Update usage count and success rate
    const newCount = pattern.usageCount + 1
    const newSuccessRate = success
      ? (pattern.successRate * pattern.usageCount + 1) / newCount
      : (pattern.successRate * pattern.usageCount) / newCount

    const updatedPattern: SkillPattern = {
      ...pattern,
      usageCount: newCount,
      successRate: newSuccessRate,
      lastUsed: new Date().toISOString(),
    }

    patterns.set(patternId, updatedPattern)
  }

  /**
   * Get all patterns
   */
  export async function getAllPatterns(): Promise<SkillPattern[]> {
    return Array.from(patterns.values())
  }

  /**
   * Clear all procedural memory (for testing)
   */
  export function clear(): void {
    procedures.clear()
    versions.clear()
    patterns.clear()
    patternsBySkill.clear()
    proceduresByAgency.clear()
    proceduresBySkill.clear()
    log.debug("procedural memory cleared")
  }
}

// Export as interface implementation
export const proceduralMemory: IProceduralMemory = {
  register: ProceduralMemory.register,
  get: ProceduralMemory.get,
  list: ProceduralMemory.list,
  update: ProceduralMemory.update,
  getVersionHistory: ProceduralMemory.getVersionHistory,
  rollback: ProceduralMemory.rollback,
  registerPattern: ProceduralMemory.registerPattern,
  findPattern: ProceduralMemory.findPattern,
  updatePatternStats: ProceduralMemory.updatePatternStats,
  clear: ProceduralMemory.clear,
}
