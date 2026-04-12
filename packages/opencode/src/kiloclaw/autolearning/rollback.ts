/**
 * Learning Rollback - Fallback to Previous Policy/Profile Version
 * Phase 3: Auto-Learning Governed
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 *
 * Provides complete auditing for automatic rollback decisions
 */

import { z } from "zod"
import { Log } from "@/util/log"
import type { LearningSnapshot } from "./feature-store"

const log = Log.create({ service: "kiloclaw.autolearning.rollback" })

// =============================================================================
// Rollback Types
// =============================================================================

export const RollbackTargetSchema = z.object({
  version: z.string(),
  type: z.enum(["policy", "profile", "procedure", "retrieval", "full"]),
  snapshotId: z.string().optional(),
  createdAt: z.number().int().positive(),
  reason: z.string().optional(),
})
export type RollbackTarget = z.infer<typeof RollbackTargetSchema>

export const RollbackAuditSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  initiatedBy: z.enum(["system", "manual", "canary", "drift_detection"]),
  reason: z.string(),
  previousSnapshotId: z.string().nullable(),
  targetSnapshotId: z.string().nullable(),
  timestamp: z.number().int().positive(),
  featuresAffected: z.array(z.string()),
  rollbackDurationMs: z.number().int().nonnegative(),
})
export type RollbackAudit = z.infer<typeof RollbackAuditSchema>

export const RollbackResultSchema = z.object({
  success: z.boolean(),
  previousVersion: z.string().nullable(),
  rolledBackVersion: z.string(),
  featuresRestored: z.number(),
  metricsRestored: z.record(z.string(), z.unknown()),
  auditTrail: RollbackAuditSchema,
})
export type RollbackResult = z.infer<typeof RollbackResultSchema>

// =============================================================================
// Learning Rollback Namespace
// =============================================================================

export namespace LearningRollback {
  // Store for snapshots (would be database in production)
  const snapshots: LearningSnapshot[] = []

  // Audit trail
  const auditTrail: RollbackAudit[] = []

  // Current versions per tenant
  const currentVersions = new Map<string, string>()

  /**
   * Register a snapshot for potential rollback
   */
  export async function registerSnapshot(snapshot: LearningSnapshot): Promise<void> {
    snapshots.push(snapshot)

    // Update current version
    if (snapshot.policyVersion) {
      currentVersions.set(`${snapshot.tenantId}:policy`, snapshot.policyVersion)
    }
    if (snapshot.profileVersion) {
      currentVersions.set(`${snapshot.tenantId}:profile`, snapshot.profileVersion)
    }

    log.info("snapshot registered for rollback", {
      tenantId: snapshot.tenantId,
      snapshotId: snapshot.id,
      policyVersion: snapshot.policyVersion,
      profileVersion: snapshot.profileVersion,
    })
  }

  /**
   * Rollback to a specific version
   */
  export async function rollback(
    tenantId: string,
    targetVersion: string,
    initiatedBy: RollbackAudit["initiatedBy"] = "manual",
    reason?: string,
  ): Promise<RollbackResult> {
    const startTime = Date.now()
    const previousVersion = currentVersions.get(`${tenantId}:policy`) ?? null

    // Find target snapshot
    const targetSnapshot = snapshots.find(
      (s) => s.tenantId === tenantId && (s.policyVersion === targetVersion || s.profileVersion === targetVersion),
    )

    if (!targetSnapshot) {
      log.error("rollback target not found", { tenantId, targetVersion })
      return {
        success: false,
        previousVersion,
        rolledBackVersion: targetVersion,
        featuresRestored: 0,
        metricsRestored: {},
        auditTrail: createAuditTrail({
          tenantId,
          initiatedBy,
          reason: reason ?? "rollback target not found",
          previousSnapshotId: null,
          targetSnapshotId: null,
          featuresAffected: [],
          rollbackDurationMs: Date.now() - startTime,
        }),
      }
    }

    // Get features to restore
    const featuresRestored = Object.keys(targetSnapshot.metricsJson).length
    const metricsRestored = { ...targetSnapshot.metricsJson }

    // Create audit entry
    const audit = createAuditTrail({
      tenantId,
      initiatedBy,
      reason: reason ?? "manual rollback",
      previousSnapshotId: findSnapshotIdByVersion(tenantId, previousVersion ?? "") ?? null,
      targetSnapshotId: targetSnapshot.id,
      featuresAffected: Object.keys(targetSnapshot.metricsJson),
      rollbackDurationMs: Date.now() - startTime,
    })

    auditTrail.push(audit)

    // Update current version
    if (targetSnapshot.policyVersion) {
      currentVersions.set(`${tenantId}:policy`, targetSnapshot.policyVersion)
    }
    if (targetSnapshot.profileVersion) {
      currentVersions.set(`${tenantId}:profile`, targetSnapshot.profileVersion)
    }

    log.info("rollback completed", {
      tenantId,
      previousVersion,
      rolledBackVersion: targetVersion,
      featuresRestored,
      initiatedBy,
      auditId: audit.id,
    })

    return {
      success: true,
      previousVersion,
      rolledBackVersion: targetVersion,
      featuresRestored,
      metricsRestored,
      auditTrail: audit,
    }
  }

  /**
   * Get the previous valid version for a tenant
   */
  export async function getPreviousVersion(
    tenantId: string,
    type: RollbackTarget["type"] = "full",
  ): Promise<RollbackTarget | null> {
    const versionKey = `${tenantId}:${type}`

    // Find current version
    const current = currentVersions.get(versionKey)
    if (!current) return null

    // Get all snapshots for tenant, sorted by createdAt descending
    const tenantSnapshots = snapshots.filter((s) => s.tenantId === tenantId).sort((a, b) => b.createdAt - a.createdAt)

    // Find the snapshot with the current version
    const currentIndex = tenantSnapshots.findIndex(
      (s) => (type === "policy" && s.policyVersion === current) || (type === "profile" && s.profileVersion === current),
    )

    // Get the one before current
    if (currentIndex < tenantSnapshots.length - 1) {
      const previous = tenantSnapshots[currentIndex + 1]
      return {
        version: (type === "policy" ? previous.policyVersion : previous.profileVersion) ?? "",
        type,
        snapshotId: previous.id,
        createdAt: previous.createdAt,
      }
    }

    return null
  }

  /**
   * Get available versions for rollback
   */
  export async function getAvailableVersions(tenantId: string, limit: number = 10): Promise<RollbackTarget[]> {
    const tenantSnapshots = snapshots
      .filter((s) => s.tenantId === tenantId)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)

    return tenantSnapshots.map((s) => ({
      version: s.policyVersion ?? s.profileVersion ?? "",
      type: s.policyVersion ? "policy" : "profile",
      snapshotId: s.id,
      createdAt: s.createdAt,
    }))
  }

  /**
   * Get audit trail for a tenant
   */
  export async function getAuditTrail(tenantId: string, limit: number = 50): Promise<RollbackAudit[]> {
    return auditTrail
      .filter((a) => a.tenantId === tenantId)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit)
  }

  /**
   * Find snapshot ID by version
   */
  function findSnapshotIdByVersion(tenantId: string, version: string): string | null {
    const snapshot = snapshots.find(
      (s) => s.tenantId === tenantId && (s.policyVersion === version || s.profileVersion === version),
    )
    return snapshot?.id ?? null
  }

  /**
   * Create audit trail entry
   */
  function createAuditTrail(params: {
    tenantId: string
    initiatedBy: RollbackAudit["initiatedBy"]
    reason: string
    previousSnapshotId: string | null
    targetSnapshotId: string | null
    featuresAffected: string[]
    rollbackDurationMs: number
  }): RollbackAudit {
    return {
      id: crypto.randomUUID(),
      tenantId: params.tenantId,
      initiatedBy: params.initiatedBy,
      reason: params.reason,
      previousSnapshotId: params.previousSnapshotId,
      targetSnapshotId: params.targetSnapshotId,
      timestamp: Date.now(),
      featuresAffected: params.featuresAffected,
      rollbackDurationMs: params.rollbackDurationMs,
    }
  }

  /**
   * Get current version for a tenant
   */
  export async function getCurrentVersion(
    tenantId: string,
    type: RollbackTarget["type"] = "policy",
  ): Promise<string | null> {
    return currentVersions.get(`${tenantId}:${type}`) ?? null
  }

  /**
   * Set current version explicitly
   */
  export function setCurrentVersion(tenantId: string, version: string, type: RollbackTarget["type"]): void {
    currentVersions.set(`${tenantId}:${type}`, version)
    log.info("current version set", { tenantId, version, type })
  }

  /**
   * Prune old snapshots
   */
  export async function pruneSnapshots(retentionDays: number = 90): Promise<number> {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const initialCount = snapshots.length

    const remaining = snapshots.filter((s) => {
      if (s.createdAt < cutoff) {
        // Don't prune the most recent snapshot per tenant
        const tenantSnapshots = snapshots.filter((ts) => ts.tenantId === s.tenantId)
        const newest = tenantSnapshots.reduce((latest, current) =>
          current.createdAt > latest.createdAt ? current : latest,
        )
        return s.id !== newest.id
      }
      return true
    })

    const pruned = initialCount - remaining.length
    snapshots.length = 0
    snapshots.push(...remaining)

    log.info("old snapshots pruned", { pruned, retentionDays })

    return pruned
  }

  /**
   * Get rollback statistics
   */
  export async function getRollbackStats(tenantId: string): Promise<{
    totalRollbacks: number
    manualRollbacks: number
    systemRollbacks: number
    canaryRollbacks: number
    driftRollbacks: number
    avgDurationMs: number
    lastRollbackAt: number | null
  }> {
    const tenantAudits = auditTrail.filter((a) => a.tenantId === tenantId)

    return {
      totalRollbacks: tenantAudits.length,
      manualRollbacks: tenantAudits.filter((a) => a.initiatedBy === "manual").length,
      systemRollbacks: tenantAudits.filter((a) => a.initiatedBy === "system").length,
      canaryRollbacks: tenantAudits.filter((a) => a.initiatedBy === "canary").length,
      driftRollbacks: tenantAudits.filter((a) => a.initiatedBy === "drift_detection").length,
      avgDurationMs:
        tenantAudits.length > 0
          ? tenantAudits.reduce((sum, a) => sum + a.rollbackDurationMs, 0) / tenantAudits.length
          : 0,
      lastRollbackAt: tenantAudits.length > 0 ? Math.max(...tenantAudits.map((a) => a.timestamp)) : null,
    }
  }
}

// =============================================================================
// Exports
// =============================================================================

export const registerSnapshot = LearningRollback.registerSnapshot
export const rollback = LearningRollback.rollback
export const getPreviousVersion = LearningRollback.getPreviousVersion
export const getAvailableVersions = LearningRollback.getAvailableVersions
export const getAuditTrail = LearningRollback.getAuditTrail
export const getCurrentVersion = LearningRollback.getCurrentVersion
export const setCurrentVersion = LearningRollback.setCurrentVersion
export const pruneSnapshots = LearningRollback.pruneSnapshots
export const getRollbackStats = LearningRollback.getRollbackStats
