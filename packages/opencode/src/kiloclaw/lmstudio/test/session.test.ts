import { describe, test, expect } from "bun:test"

/**
 * Session module tests
 *
 * Note: The LMSession module requires proper instance context (Config, Bus, etc.)
 * which is only available during full application initialization.
 * These tests verify the module structure without triggering full initialization.
 */

describe("LMSession module structure", () => {
  test("should export LMSession namespace", async () => {
    // Dynamic import to avoid triggering full initialization
    const { LMSession } = await import("../session")
    expect(LMSession).toBeDefined()
  })

  test("should export init function", async () => {
    const { LMSession } = await import("../session")
    expect(typeof LMSession.init).toBe("function")
  })

  test("should export dispose function", async () => {
    const { LMSession } = await import("../session")
    expect(typeof LMSession.dispose).toBe("function")
  })

  test("should export getSessionState function", async () => {
    const { LMSession } = await import("../session")
    expect(typeof LMSession.getSessionState).toBe("function")
  })

  test("should export getActiveSessions function", async () => {
    const { LMSession } = await import("../session")
    expect(typeof LMSession.getActiveSessions).toBe("function")
  })

  test("should export isModelLoadedForSession function", async () => {
    const { LMSession } = await import("../session")
    expect(typeof LMSession.isModelLoadedForSession).toBe("function")
  })

  test("should export getModelForSession function", async () => {
    const { LMSession } = await import("../session")
    expect(typeof LMSession.getModelForSession).toBe("function")
  })

  test("getSessionState should return undefined for unknown session", async () => {
    const { LMSession } = await import("../session")
    const state = LMSession.getSessionState("unknown-session")
    expect(state).toBeUndefined()
  })

  test("getActiveSessions should return empty map initially", async () => {
    const { LMSession } = await import("../session")
    const sessions = LMSession.getActiveSessions()
    expect(sessions.size).toBe(0)
  })

  test("isModelLoadedForSession should return false for unknown session", async () => {
    const { LMSession } = await import("../session")
    const loaded = await LMSession.isModelLoadedForSession("unknown-session")
    expect(loaded).toBe(false)
  })

  test("getModelForSession should return undefined for unknown session", async () => {
    const { LMSession } = await import("../session")
    const modelID = LMSession.getModelForSession("unknown-session")
    expect(modelID).toBeUndefined()
  })
})
