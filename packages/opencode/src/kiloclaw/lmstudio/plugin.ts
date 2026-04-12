import { Log } from "@/util/log"
import type { Hooks, PluginInput } from "@kilocode/plugin"
import { LMStudioConfigLoader } from "./config"
import { Discovery } from "./discovery"
import { HealthCheck } from "./health"
import { AutoStart } from "./autostart"

const log = Log.create({ service: "lmstudio.plugin" })

/**
 * Create the LM Studio plugin for provider integration.
 *
 * This plugin enables LM Studio as a provider in the CLI session system,
 * with support for:
 * - Model discovery from local LM Studio server
 * - Auto-start of LM Studio daemon if enabled
 * - Automatic model loading for sessions
 */
export async function createLMStudioPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    auth: {
      provider: "lmstudio",
      methods: [
        {
          type: "api",
          label: "Local LM Studio",
          authorize: async () => ({ type: "success", key: "local" }),
        },
      ],
      loader: async (_getAuth, _provider) => {
        // 1. Load config
        const config = await LMStudioConfigLoader.get()

        if (!config.enabled) {
          log.info("LM Studio provider is disabled")
          return {}
        }

        const { baseURL, autoStart, autoLoadModel } = config

        // 2. If autoStart enabled and server not reachable, start daemon
        if (autoStart) {
          const health = await HealthCheck.check(baseURL, {
            timeout: 5000,
            retries: config.healthCheckRetries,
            retryDelay: config.healthCheckRetryDelay,
          })

          if (!health.reachable) {
            log.info("LM Studio server not reachable, attempting auto-start")

            const startResult = await AutoStart.startDaemon(baseURL)

            if (!startResult.success) {
              log.warn("Auto-start failed", {
                error: startResult.error,
                instructions: startResult.instructions,
              })
              // Don't fail - let user know to start manually
            }
          }
        }

        // 3. Discover models from /v1/models
        const models = await Discovery.discoverModels(baseURL, {
          fallbackApiV1: config.discoveryFallbackApiV1,
        })

        // 4. Return options with discovered models
        const options: Record<string, any> = {
          baseURL,
          apiKey: "local", // LM Studio doesn't need an API key
          // Store discovered models info for session management
          _lmstudioModels: models,
          _lmstudioAutoLoadModel: autoLoadModel,
          _lmstudioConfig: config,
        }

        log.info("LM Studio plugin loaded", {
          baseURL,
          modelCount: models.length,
          autoStart,
          autoLoadModel,
        })

        return options
      },
    },
  }
}
