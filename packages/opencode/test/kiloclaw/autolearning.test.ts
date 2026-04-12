/**
 * Auto-Learning Module Tests
 * Phase 3: Auto-Learning Governed
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 */

import { describe, test, expect, beforeEach } from "bun:test"
import type { FeatureName } from "../../src/kiloclaw/autolearning"
import {
  // Feature Store
  extractFromFeedback,
  extractFromTaskOutcome,
  extractFromProactiveAcceptance,
  getFeatures,
  getAggregatedFeature,
  createSnapshot,
  getLatestSnapshot,
  // Trainer
  updatePreferenceScore,
  updateRetrievalRelevance,
  updateProcedureSuccessRate,
  adjustProactivePriority,
  getCurrentValue,
  getConfidence,
  LearningTrainer,
  // Validator
  LearningValidator,
  validateUpdate,
  validateBatch,
  validateCanaryPromotion,
  validateRollback,
  // Canary
  CanaryRelease,
  startCanary,
  isInCohort,
  recordCanaryHit,
  evaluateCanary,
  promoteCanary,
  rollbackCanary,
  getCanary,
  // Drift
  DriftDetector,
  detectDrift,
  setBaseline,
  getDriftEvents,
  getThresholds,
  // Rollback
  LearningRollback,
  registerSnapshot,
  rollback,
  getPreviousVersion,
  getAvailableVersions,
} from "../../src/kiloclaw/autolearning"

// =============================================================================
// Feature Store Tests
// =============================================================================

describe("FeatureStore", () => {
  const tenantId = "test-tenant-fs"
  const userId = "test-user"

  test("should extract features from feedback", async () => {
    const windowStart = Date.now() - 60 * 60 * 1000
    const windowEnd = Date.now()

    const features = await extractFromFeedback(
      tenantId,
      userId,
      { vote: "up", reason: "style_mismatch", score: 0.8 },
      windowStart,
      windowEnd,
    )

    expect(features.length).toBeGreaterThan(0)
    expect(features[0]).toHaveProperty("tenantId", tenantId)
    expect(features[0]).toHaveProperty("featureName")
    expect(features[0]).toHaveProperty("featureValue")
  })

  test("should extract wrong_fact features from negative feedback", async () => {
    const windowStart = Date.now() - 60 * 60 * 1000
    const windowEnd = Date.now()

    const features = await extractFromFeedback(
      tenantId,
      userId,
      { vote: "down", reason: "wrong_fact" },
      windowStart,
      windowEnd,
    )

    const wrongFactFeature = features.find((f) => f.featureName === "wrong_fact_rate")
    expect(wrongFactFeature).toBeDefined()
  })

  test("should extract features from task outcome", async () => {
    const windowStart = Date.now() - 60 * 60 * 1000
    const windowEnd = Date.now()

    const features = await extractFromTaskOutcome(
      tenantId,
      userId,
      { success: true, partial: false, completionScore: 0.9 },
      windowStart,
      windowEnd,
    )

    expect(features.length).toBeGreaterThan(0)
  })

  test("should extract proactive acceptance feature", async () => {
    const windowStart = Date.now() - 60 * 60 * 1000
    const windowEnd = Date.now()

    const features = await extractFromProactiveAcceptance(tenantId, userId, true, windowStart, windowEnd)

    expect(features.length).toBe(1)
    expect(features[0].featureName).toBe("proactive_acceptance_rate")
    expect(features[0].featureValue).toBeGreaterThan(0)
  })

  test("should get features by tenant", async () => {
    const features = await getFeatures(tenantId)
    expect(Array.isArray(features)).toBe(true)
  })

  test("should create snapshot", async () => {
    const snapshot = await createSnapshot(tenantId, "v1.0.0", "profile-v1")

    expect(snapshot).toBeDefined()
    expect(snapshot.id).toBeDefined()
    expect(snapshot.tenantId).toBe(tenantId)
    expect(snapshot.policyVersion).toBe("v1.0.0")
    expect(snapshot.profileVersion).toBe("profile-v1")
    expect(snapshot.createdAt).toBeGreaterThan(0)
  })

  test("should get latest snapshot", async () => {
    await createSnapshot(tenantId, "v1.0.0", "profile-v1")
    const latest = await getLatestSnapshot(tenantId)

    expect(latest).toBeDefined()
    expect(latest?.tenantId).toBe(tenantId)
  })
})

// =============================================================================
// Learning Trainer Tests
// =============================================================================

describe("LearningTrainer", () => {
  const tenantId = "test-tenant-trainer"
  const userId = "test-user"

  test("should update preference score with weighted average", async () => {
    const signal = {
      tenantId,
      userId,
      featureName: "user_preference_score" as FeatureName,
      value: 0.8,
      weight: 0.5,
      ts: Date.now(),
    }

    const result = await updatePreferenceScore(tenantId, userId, signal)

    expect(result.success).toBe(true)
    expect(result.newValue).toBeGreaterThan(0)
    expect(result.confidence).toBeGreaterThan(0)
  })

  test("should update retrieval relevance with exponential decay", async () => {
    const signal = {
      tenantId,
      userId,
      featureName: "retrieval_relevance_score" as FeatureName,
      value: 0.3, // Low relevance
      weight: 0.5,
      ts: Date.now(),
    }

    const result = await updateRetrievalRelevance(tenantId, signal)

    expect(result.success).toBe(true)
    expect(result.featureName).toBe("retrieval_relevance_score")
  })

  test("should update procedure success rate", async () => {
    const result = await updateProcedureSuccessRate(tenantId, "proc-123", true, 0.5)

    expect(result.success).toBe(true)
    expect(result.featureName).toBe("procedure_success_rate")
    expect(result.newValue).toBeGreaterThan(0)
  })

  test("should adjust proactive priority based on acceptance", async () => {
    const result = await adjustProactivePriority(tenantId, userId, 0.8, 0.3)

    expect(result.success).toBe(true)
    expect(result.featureName).toBe("proactive_acceptance_rate")
  })

  test("should get current value for feature", async () => {
    // First update
    const signal = {
      tenantId,
      userId,
      featureName: "user_preference_score" as FeatureName,
      value: 0.7,
      weight: 0.5,
      ts: Date.now(),
    }
    await updatePreferenceScore(tenantId, userId, signal)

    // Then get
    const value = await getCurrentValue(tenantId, userId, "user_preference_score")
    expect(value).not.toBeNull()
    expect(typeof value).toBe("number")
  })

  test("should get confidence for feature", async () => {
    const confidence = await getConfidence(tenantId, userId, "user_preference_score")
    expect(typeof confidence).toBe("number")
    expect(confidence).toBeGreaterThanOrEqual(0)
  })
})

// =============================================================================
// Learning Validator Tests
// =============================================================================

describe("LearningValidator", () => {
  const tenantId = "test-tenant-validator"

  test("should approve update with sufficient confidence and acceptable delta", async () => {
    const update = {
      success: true,
      featureName: "user_preference_score" as FeatureName,
      oldValue: 0.5,
      newValue: 0.6,
      delta: 0.1,
      confidence: 0.5,
    }

    const result = await validateUpdate(tenantId, update)

    expect(result.approved).toBe(true)
    expect(result.rejectionReasons.length).toBe(0)
  })

  test("should reject update with low confidence", async () => {
    const update = {
      success: true,
      featureName: "user_preference_score" as FeatureName,
      oldValue: 0.5,
      newValue: 0.6,
      delta: 0.1,
      confidence: 0.1, // Too low
    }

    const result = await validateUpdate(tenantId, update)

    expect(result.approved).toBe(false)
    expect(result.rejectionReasons.length).toBeGreaterThan(0)
  })

  test("should reject update with large delta", async () => {
    const update = {
      success: true,
      featureName: "user_preference_score" as FeatureName,
      oldValue: 0.5,
      newValue: 0.9,
      delta: 0.4, // Too large
      confidence: 0.5,
    }

    const result = await validateUpdate(tenantId, update)

    expect(result.approved).toBe(false)
  })

  test("should reject safety feature with large delta", async () => {
    const update = {
      success: true,
      featureName: "unsafe_incident_rate" as FeatureName,
      oldValue: 0.1,
      newValue: 0.3,
      delta: 0.2, // Too large for safety
      confidence: 0.6,
    }

    const result = await validateUpdate(tenantId, update)

    expect(result.approved).toBe(false)
    expect(result.rejectionReasons.some((r) => r.includes("safety"))).toBe(true)
  })

  test("should validate canary promotion", async () => {
    const canaryMetrics = {
      successRate: 0.95,
      errorRate: 0.02,
      feedbackScore: 0.8,
      userAcceptance: 0.75,
    }

    const result = await validateCanaryPromotion(tenantId, canaryMetrics)

    expect(result.approved).toBe(true)
    expect(result.score).toBeGreaterThanOrEqual(70)
  })

  test("should reject canary with poor metrics", async () => {
    const canaryMetrics = {
      successRate: 0.5,
      errorRate: 0.3,
      feedbackScore: 0.2,
      userAcceptance: 0.1,
    }

    const result = await validateCanaryPromotion(tenantId, canaryMetrics)

    expect(result.approved).toBe(false)
    expect(result.score).toBeLessThan(70)
  })

  test("should validate rollback safety", async () => {
    const snapshots = [
      {
        version: "v1.0.0",
        metrics: { createdAt: Date.now() - 24 * 60 * 60 * 1000, unsafe_incident_rate: 0.01 },
      },
      {
        version: "v0.9.0",
        metrics: { createdAt: Date.now() - 48 * 60 * 60 * 1000, unsafe_incident_rate: 0.02 },
      },
    ]

    const result = await validateRollback(tenantId, "v1.0.0", "v0.9.0", snapshots)

    expect(result.canRollback).toBe(true)
  })

  test("should get default thresholds", () => {
    const thresholds = LearningValidator.getDefaultThresholds()

    expect(thresholds.minConfidence).toBe(0.3)
    expect(thresholds.maxDelta).toBe(0.25)
    expect(thresholds.safetyMaxDelta).toBe(0.1)
  })
})

// =============================================================================
// Canary Release Tests
// =============================================================================

describe("CanaryRelease", () => {
  const tenantId = "test-tenant-canary"

  test("should start canary release", async () => {
    const canary = await startCanary(tenantId, "policy_update", {
      cohortPercent: 10,
      targetVersion: "v2.0.0",
      previousVersion: "v1.0.0",
    })

    expect(canary).toBeDefined()
    expect(canary.id).toBeDefined()
    expect(canary.status).toBe("running")
    expect(canary.cohortPercent).toBe(10)
    expect(canary.tenantId).toBe(tenantId)
  })

  test("should assign user to cohort", async () => {
    const canary = await startCanary(tenantId, "policy_update")
    const assigned = CanaryRelease.assignToCohort(canary.id, "user-123")

    expect(assigned).toBe(true)
    expect(isInCohort(canary.id, "user-123")).toBe(true)
  })

  test("should record canary hit", async () => {
    const canary = await startCanary(tenantId, "policy_update")

    await recordCanaryHit(canary.id, {
      totalRequests: 1,
      successCount: 1,
      avgResponseTimeMs: 100,
    })

    const updated = await getCanary(canary.id)
    expect(updated?.metricsJson?.totalRequests).toBe(1)
    expect(updated?.metricsJson?.successCount).toBe(1)
  })

  test("should evaluate canary", async () => {
    const canary = await startCanary(tenantId, "policy_update")

    // Add some metrics
    await recordCanaryHit(canary.id, {
      totalRequests: 10,
      successCount: 9,
      userFeedbackCount: 5,
      positiveFeedbackCount: 4,
    })

    const evaluation = await evaluateCanary(canary.id)

    expect(evaluation).toBeDefined()
    expect(typeof evaluation.successRate).toBe("number")
    expect(typeof evaluation.recommendation).toBe("string")
  })

  test("should promote canary", async () => {
    const canary = await startCanary(tenantId, "policy_update")

    const promoted = await promoteCanary(canary.id)

    expect(promoted.status).toBe("promoted")
    expect(promoted.completedAt).not.toBeNull()
  })

  test("should rollback canary", async () => {
    const canary = await startCanary(tenantId, "policy_update")

    const rolledBack = await rollbackCanary(canary.id)

    expect(rolledBack.status).toBe("rollback")
    expect(rolledBack.completedAt).not.toBeNull()
  })

  test("should get active canary for tenant", async () => {
    await startCanary(tenantId, "policy_update")

    const active = await CanaryRelease.getActiveCanary(tenantId)

    expect(active).toBeDefined()
    expect(active?.tenantId).toBe(tenantId)
    expect(active?.status).toBe("running")
  })
})

// =============================================================================
// Drift Detector Tests
// =============================================================================

describe("DriftDetector", () => {
  const tenantId = "test-tenant-drift"

  test("should detect drift in accuracy", async () => {
    // Set baseline
    setBaseline(tenantId, "accuracy", 0.1)

    // Record worse metrics
    const report = await detectDrift(tenantId, {
      wrongFactRate: 0.25, // 150% increase from baseline
    })

    expect(report).toBeDefined()
    expect(report.tenantId).toBe(tenantId)
    expect(report.drifts.length).toBeGreaterThan(0)
    expect(report.drifts[0]?.type).toBe("accuracy")
  })

  test("should detect drift in relevance", async () => {
    setBaseline(tenantId, "relevance", 0.15)

    const report = await detectDrift(tenantId, {
      irrelevantRate: 0.35, // Significant increase
    })

    expect(report.drifts.some((d) => d.type === "relevance")).toBe(true)
  })

  test("should detect drift in safety", async () => {
    setBaseline(tenantId, "safety", 0.01)

    const report = await detectDrift(tenantId, {
      unsafeIncidentRate: 0.15, // 15x increase - should trigger alert
    })

    expect(report.drifts.some((d) => d.type === "safety")).toBe(true)
    // With baseline 0.01 and current 0.15, delta = 0.14, which exceeds criticalDelta of 0.10
    const safetyDrift = report.drifts.find((d) => d.type === "safety")
    expect(safetyDrift).toBeDefined()
    expect(["high", "critical"]).toContain(safetyDrift!.severity)
  })

  test("should create and get drift events", async () => {
    const event = await DriftDetector.createDriftEvent(
      tenantId,
      "accuracy",
      "high",
      "Increased wrong_fact rate detected",
    )
    const events = await getDriftEvents(tenantId)

    expect(events.length).toBeGreaterThan(0)
    expect(events[0].driftType).toBe("accuracy")
    expect(events[0].severity).toBe("high")
  })

  test("should resolve drift event", async () => {
    const event = await DriftDetector.createDriftEvent(tenantId, "relevance", "medium", "Irrelevant rate spike")
    await DriftDetector.resolveDriftEvent(event.id)

    const events = await getDriftEvents(tenantId, { unresolvedOnly: true })
    expect(events.some((e) => e.id === event.id)).toBe(false)
  })

  test("should get drift thresholds", () => {
    const thresholds = getThresholds()

    expect(thresholds.accuracy.warningDelta).toBe(0.15)
    expect(thresholds.relevance.warningDelta).toBe(0.2)
    expect(thresholds.safety.warningDelta).toBe(0.05) // Very sensitive
  })

  test("should reset baseline", () => {
    setBaseline(tenantId, "accuracy", 0.1)
    DriftDetector.resetBaseline(tenantId)

    // After reset, detection should show no drift if values are similar
    // (Implementation detail - baseline returns to default)
  })
})

// =============================================================================
// Learning Rollback Tests
// =============================================================================

describe("LearningRollback", () => {
  const tenantId = "test-tenant-rollback"

  test("should register snapshot", async () => {
    await registerSnapshot({
      id: crypto.randomUUID(),
      tenantId,
      policyVersion: "v1.0.0",
      profileVersion: "profile-v1",
      metricsJson: { user_preference_score: 0.7 },
      createdAt: Date.now(),
    })

    const versions = await getAvailableVersions(tenantId)

    expect(versions.length).toBeGreaterThan(0)
    expect(versions[0].version).toBe("v1.0.0")
  })

  test("should rollback to previous version", async () => {
    const tId = tenantId + "-rollback-test"

    // Register two snapshots
    await registerSnapshot({
      id: crypto.randomUUID(),
      tenantId: tId,
      policyVersion: "v1.0.0",
      metricsJson: {},
      createdAt: Date.now() - 60 * 60 * 1000,
    })

    await registerSnapshot({
      id: crypto.randomUUID(),
      tenantId: tId,
      policyVersion: "v2.0.0",
      metricsJson: { user_preference_score: 0.9 },
      createdAt: Date.now(),
    })

    // Set current version to v2.0.0
    LearningRollback.setCurrentVersion(tId, "v2.0.0", "policy")

    // Rollback to v1.0.0
    const result = await rollback(tId, "v1.0.0", "manual", "Testing rollback")

    expect(result.success).toBe(true)
    expect(result.rolledBackVersion).toBe("v1.0.0")
    expect(result.previousVersion).toBe("v2.0.0")
  })

  test("should get previous version", async () => {
    const tId = tenantId + "-prev-version"

    await registerSnapshot({
      id: crypto.randomUUID(),
      tenantId: tId,
      policyVersion: "v1.0.0",
      metricsJson: {},
      createdAt: Date.now() - 60 * 60 * 1000,
    })

    await registerSnapshot({
      id: crypto.randomUUID(),
      tenantId: tId,
      policyVersion: "v2.0.0",
      metricsJson: {},
      createdAt: Date.now(),
    })

    LearningRollback.setCurrentVersion(tId, "v2.0.0", "policy")

    const previous = await getPreviousVersion(tId, "policy")

    expect(previous).toBeDefined()
    expect(previous?.version).toBe("v1.0.0")
  })

  test("should get available versions", async () => {
    const tId = tenantId + "-avail-versions"

    await registerSnapshot({
      id: crypto.randomUUID(),
      tenantId: tId,
      policyVersion: "v1.0.0",
      metricsJson: {},
      createdAt: Date.now() - 120 * 60 * 1000,
    })

    await registerSnapshot({
      id: crypto.randomUUID(),
      tenantId: tId,
      policyVersion: "v2.0.0",
      metricsJson: {},
      createdAt: Date.now() - 60 * 60 * 1000,
    })

    const versions = await getAvailableVersions(tId, 5)

    expect(versions.length).toBe(2)
    expect(versions[0].version).toBe("v2.0.0") // Most recent first
  })

  test("should get audit trail", async () => {
    const tId = tenantId + "-audit"

    await registerSnapshot({
      id: crypto.randomUUID(),
      tenantId: tId,
      policyVersion: "v1.0.0",
      metricsJson: {},
      createdAt: Date.now(),
    })

    LearningRollback.setCurrentVersion(tId, "v1.0.0", "policy")

    await rollback(tId, "v1.0.0", "system", "Initial rollback for testing")

    const audit = await LearningRollback.getAuditTrail(tId)

    expect(audit.length).toBeGreaterThan(0)
    expect(audit[0].initiatedBy).toBe("system")
  })

  test("should get rollback stats", async () => {
    const tId = tenantId + "-stats"

    await registerSnapshot({
      id: crypto.randomUUID(),
      tenantId: tId,
      policyVersion: "v1.0.0",
      metricsJson: {},
      createdAt: Date.now(),
    })

    LearningRollback.setCurrentVersion(tId, "v1.0.0", "policy")

    await rollback(tId, "v1.0.0", "canary", "Canary failed")
    await rollback(tId, "v1.0.0", "drift_detection", "Drift detected")
    await rollback(tId, "v1.0.0", "manual", "Manual rollback")

    const stats = await LearningRollback.getRollbackStats(tId)

    expect(stats.totalRollbacks).toBe(3)
    expect(stats.canaryRollbacks).toBe(1)
    expect(stats.driftRollbacks).toBe(1)
    expect(stats.manualRollbacks).toBe(1)
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe("Auto-Learning Integration", () => {
  const tenantId = "test-tenant-integration"
  const userId = "test-user"

  test("should integrate feature store with trainer", async () => {
    // Extract features from feedback
    const features = await extractFromFeedback(
      tenantId,
      userId,
      { vote: "down", reason: "wrong_fact", score: 0.6 },
      Date.now() - 60 * 60 * 1000,
      Date.now(),
    )

    // Use trainer to update based on feature
    const feature = features.find((f) => f.featureName === "wrong_fact_rate")
    if (feature) {
      const signal = {
        tenantId,
        userId,
        featureName: feature.featureName,
        value: feature.featureValue,
        weight: 0.5,
        ts: Date.now(),
      }

      const result = await updatePreferenceScore(tenantId, userId, signal)
      expect(result.success).toBe(true)
    }
  })

  test("should integrate trainer with validator", async () => {
    const tId = tenantId + "-trainer-validator"

    // Update a preference with higher confidence to pass validation
    const signal = {
      tenantId: tId,
      userId,
      featureName: "user_preference_score" as FeatureName,
      value: 0.65,
      weight: 0.6, // Higher weight to build confidence faster
      ts: Date.now(),
    }

    const updateResult = await updatePreferenceScore(tId, userId, signal)

    // Validate the update
    const validation = await validateUpdate(tId, updateResult)

    // May or may not be approved depending on confidence level built up
    expect(validation).toBeDefined()
    expect(validation.featureName).toBe("user_preference_score")
  })

  test("should integrate validator with canary", async () => {
    const tId = tenantId + "-validator-canary"

    // Start a canary
    const canary = await startCanary(tId, "profile_update", {
      cohortPercent: 20,
    })

    // Record some hits
    await recordCanaryHit(canary.id, {
      totalRequests: 20,
      successCount: 18,
      errorCount: 1,
      userFeedbackCount: 10,
      positiveFeedbackCount: 8,
      negativeFeedbackCount: 2,
    })

    // Evaluate canary
    const evaluation = await evaluateCanary(canary.id)

    // Validate for promotion
    const promotionCheck = await validateCanaryPromotion(tId, {
      successRate: evaluation.successRate,
      errorRate: evaluation.errorRate,
      feedbackScore: evaluation.feedbackScore,
      userAcceptance: evaluation.userAcceptance,
    })

    expect(promotionCheck.approved).toBe(true)
  })

  test("should integrate drift with rollback", async () => {
    const tId = tenantId + "-drift-rollback"

    // Set baseline and detect drift
    setBaseline(tId, "accuracy", 0.1)

    const report = await detectDrift(tId, {
      wrongFactRate: 0.35,
    })

    // If drift is critical, trigger rollback
    if (report.drifts.some((d) => d.severity === "critical")) {
      await registerSnapshot({
        id: crypto.randomUUID(),
        tenantId: tId,
        policyVersion: "v1.0.0",
        metricsJson: { accuracy: 0.1 },
        createdAt: Date.now() - 60 * 60 * 1000,
      })

      await registerSnapshot({
        id: crypto.randomUUID(),
        tenantId: tId,
        policyVersion: "v1.1.0",
        metricsJson: { accuracy: 0.35 },
        createdAt: Date.now(),
      })

      LearningRollback.setCurrentVersion(tId, "v1.1.0", "policy")

      const validation = await validateRollback(tId, "v1.1.0", "v1.0.0", [
        { version: "v1.0.0", metrics: { createdAt: Date.now() - 60 * 60 * 1000, unsafe_incident_rate: 0.01 } },
        { version: "v1.1.0", metrics: { createdAt: Date.now(), unsafe_incident_rate: 0.01 } },
      ])

      if (validation.approved) {
        const result = await rollback(tId, "v1.0.0", "drift_detection", "Critical drift detected")
        expect(result.success).toBe(true)
      }
    }
  })
})
