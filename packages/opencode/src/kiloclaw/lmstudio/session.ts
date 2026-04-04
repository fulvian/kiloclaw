import { Log } from "@/util/log"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { Config } from "@/config/config"
import { LMStudioConfigLoader, LMStudioSessionConfig } from "./config"
import { HealthCheck } from "./health"
import { Lifecycle } from "./lifecycle"
import { AutoStart } from "./autostart"
import z from "zod"

const log = Log.create({ service: "lmstudio.session" })

/**
 * LM Studio session state
 */
interface LMStudioSessionState {
  sessionID: string
  modelID?: string
  loaded: boolean
  timeout?: ReturnType<typeof setTimeout>
}

/**
 * Track active LM Studio sessions
 */
const activeSessions = new Map<string, LMStudioSessionState>()

/**
 * Store unsubscribe functions for cleanup
 */
const unsubscribers: Array<() => void> = []

/**
 * Define LM Studio specific bus events
 */
const LMStudioEvents = {
  ModelAutoLoaded: BusEvent.define(
    "lmstudio.model.auto_loaded",
    z.object({ sessionID: z.string(), modelID: z.string() }),
  ),
  ModelAutoUnloaded: BusEvent.define(
    "lmstudio.model.auto_unloaded",
    z.object({ sessionID: z.string(), modelID: z.string() }),
  ),
  SessionStarted: BusEvent.define("lmstudio.session.started", z.object({ sessionID: z.string() })),
  SessionEnded: BusEvent.define(
    "lmstudio.session.ended",
    z.object({ sessionID: z.string(), reason: z.enum(["completed", "error", "interrupted"]) }),
  ),
  Error: BusEvent.define("lmstudio.session.error", z.object({ sessionID: z.string(), error: z.string() })),
}

export namespace LMSession {
  /**
   * Initialize session management for LM Studio.
   * Sets up bus event listeners for session start/end.
   */
  export function init(): void {
    // Subscribe to all events and filter for session lifecycle events
    unsubscribers.push(Bus.subscribeAll(handleBusEvent))
    log.info("LM Studio session management initialized")
  }

  /**
   * Clean up session management.
   * Removes event listeners and unloads any remaining models.
   */
  export function dispose(): void {
    // Call all unsubscribe functions
    for (const unsub of unsubscribers) {
      unsub()
    }
    unsubscribers.length = 0

    // Unload all active session models
    for (const [sessionID, state] of activeSessions) {
      if (state.loaded && state.modelID) {
        unloadModelForSession(sessionID, state.modelID).catch((err) => {
          log.error("Failed to unload model during dispose", { sessionID, error: err })
        })
      }
      if (state.timeout) {
        clearTimeout(state.timeout)
      }
    }
    activeSessions.clear()
    log.info("LM Studio session management disposed")
  }

  /**
   * Handle incoming bus events
   */
  async function handleBusEvent(event: any): Promise<void> {
    // Handle session.created event
    if (event.type === "session.created") {
      await handleSessionCreated(event)
    }
    // Handle session.turn.close event
    else if (event.type === "session.turn.close") {
      await handleSessionTurnClose(event)
    }
  }

  /**
   * Handle session created event.
   * If autoLoadModel is enabled, automatically load the configured model.
   */
  async function handleSessionCreated(event: { properties: { info: { id: string } } }): Promise<void> {
    const sessionID = event.properties.info.id

    try {
      const config = await LMStudioConfigLoader.get()

      if (!config.enabled) {
        return
      }

      // Track the session
      const state: LMStudioSessionState = {
        sessionID,
        loaded: false,
      }
      activeSessions.set(sessionID, state)

      // Check if LM Studio is reachable
      const health = await HealthCheck.check(config.baseURL, {
        timeout: 5000,
        retries: config.healthCheckRetries,
        retryDelay: config.healthCheckRetryDelay,
      })

      if (!health.reachable) {
        if (config.autoStart) {
          const startResult = await AutoStart.startDaemon(config.baseURL)
          if (!startResult.success) {
            log.warn("Auto-start failed, session may not work properly", {
              sessionID,
              error: startResult.error,
            })
          }
        } else {
          log.warn("LM Studio server not reachable. Start it or enable autoStart.", { sessionID })
          return
        }
      }

      // Auto-load model if configured
      if (config.autoLoadModel && config.modelId) {
        await loadModelForSession(sessionID, config.modelId, config)
      }

      Bus.publish(LMStudioEvents.SessionStarted, { sessionID })
    } catch (err) {
      log.error("Error handling session created", { sessionID, error: err })
      Bus.publish(LMStudioEvents.Error, { sessionID, error: String(err) })
    }
  }

  /**
   * Handle session turn close event.
   * If autoUnloadOnSessionEnd is enabled, unload the model when session ends.
   */
  async function handleSessionTurnClose(event: {
    properties: { sessionID: string; reason: "completed" | "error" | "interrupted" }
  }): Promise<void> {
    const sessionID = event.properties.sessionID
    const reason = event.properties.reason

    const state = activeSessions.get(sessionID)
    if (!state) {
      return
    }

    // Clear any pending timeout
    if (state.timeout) {
      clearTimeout(state.timeout)
      state.timeout = undefined
    }

    try {
      const sessionConfig = await getSessionConfig()

      if (sessionConfig.autoUnloadOnSessionEnd && state.loaded && state.modelID) {
        await unloadModelForSession(sessionID, state.modelID)
      }

      activeSessions.delete(sessionID)
      Bus.publish(LMStudioEvents.SessionEnded, { sessionID, reason })
    } catch (err) {
      log.error("Error handling session turn close", { sessionID, error: err })
    }
  }

  /**
   * Load a model for a specific session.
   */
  async function loadModelForSession(
    sessionID: string,
    modelID: string,
    config: { baseURL: string; loadTimeout?: number },
  ): Promise<void> {
    const state = activeSessions.get(sessionID)
    if (!state) {
      log.warn("Session not found for model loading", { sessionID, modelID })
      return
    }

    // Check if model is already loaded
    const isLoaded = await Lifecycle.isModelLoaded(config.baseURL, modelID)
    if (isLoaded) {
      state.modelID = modelID
      state.loaded = true
      log.info("Model already loaded", { sessionID, modelID })
      Bus.publish(LMStudioEvents.ModelAutoLoaded, { sessionID, modelID })
      return
    }

    // Load the model
    try {
      await Lifecycle.loadModel(config.baseURL, { model: modelID }, { timeout: config.loadTimeout })
      state.modelID = modelID
      state.loaded = true
      log.info("Model loaded for session", { sessionID, modelID })
      Bus.publish(LMStudioEvents.ModelAutoLoaded, { sessionID, modelID })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.error("Failed to load model", { sessionID, modelID, error: errorMsg })
      Bus.publish(LMStudioEvents.Error, {
        sessionID,
        error: `Failed to load model: ${errorMsg}. Check LM Studio.`,
      })
      throw err
    }
  }

  /**
   * Unload a model for a specific session.
   */
  async function unloadModelForSession(sessionID: string, modelID: string): Promise<void> {
    const state = activeSessions.get(sessionID)
    if (!state) {
      return
    }

    try {
      await Lifecycle.unloadModel(state.modelID ? state.modelID : modelID, { model: modelID })
      state.loaded = false
      log.info("Model unloaded for session", { sessionID, modelID })
      Bus.publish(LMStudioEvents.ModelAutoUnloaded, { sessionID, modelID })
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.error("Failed to unload model", { sessionID, modelID, error: errorMsg })
      // Don't throw - unloading failure shouldn't break session cleanup
    }
  }

  /**
   * Get session-related configuration.
   */
  async function getSessionConfig(): Promise<{
    autoUnloadOnSessionEnd: boolean
    sessionTimeout: number
  }> {
    try {
      const config = await Config.get()
      const providerConfig = config.provider?.["lmstudio"]

      if (!providerConfig?.options) {
        return { autoUnloadOnSessionEnd: false, sessionTimeout: 600000 }
      }

      const parsed = LMStudioSessionConfig.schema.safeParse(providerConfig.options)
      if (!parsed.success) {
        return { autoUnloadOnSessionEnd: false, sessionTimeout: 600000 }
      }

      return {
        autoUnloadOnSessionEnd: parsed.data.autoUnloadOnSessionEnd,
        sessionTimeout: parsed.data.sessionTimeout,
      }
    } catch {
      return { autoUnloadOnSessionEnd: false, sessionTimeout: 600000 }
    }
  }

  /**
   * Get the current state of a session.
   */
  export function getSessionState(sessionID: string): LMStudioSessionState | undefined {
    return activeSessions.get(sessionID)
  }

  /**
   * Get all active sessions.
   */
  export function getActiveSessions(): Map<string, LMStudioSessionState> {
    return new Map(activeSessions)
  }

  /**
   * Check if a model is loaded for a specific session.
   */
  export async function isModelLoadedForSession(sessionID: string): Promise<boolean> {
    const state = activeSessions.get(sessionID)
    return state?.loaded ?? false
  }

  /**
   * Get the model ID loaded for a specific session.
   */
  export function getModelForSession(sessionID: string): string | undefined {
    return activeSessions.get(sessionID)?.modelID
  }
}
