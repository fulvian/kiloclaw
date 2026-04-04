import z from "zod"
import { Log } from "@/util/log"
import { Config } from "@/config/config"
import { LMStudioConfig } from "./types"

const log = Log.create({ service: "lmstudio.config" })

export namespace LMStudioConfigLoader {
  /**
   * Load LM Studio configuration from config provider settings
   */
  export async function load(): Promise<LMStudioConfig.Info | undefined> {
    const config = await Config.get()
    const providerConfig = config.provider?.["lmstudio"]

    if (!providerConfig?.options) {
      return undefined
    }

    // Parse and validate with defaults
    const parsed = LMStudioConfig.schema.safeParse(providerConfig.options)

    if (!parsed.success) {
      log.warn("Invalid LM Studio config, using defaults", {
        issues: parsed.error.issues,
      })
      return LMStudioConfig.schema.parse({})
    }

    return parsed.data
  }

  /**
   * Get LM Studio config or return defaults if not available
   */
  export async function get(): Promise<LMStudioConfig.Info> {
    const config = await load()
    if (!config) {
      return LMStudioConfig.schema.parse({})
    }
    return config
  }
}

/**
 * Session-related configuration for LM Studio provider
 */
export namespace LMStudioSessionConfig {
  export const schema = LMStudioConfig.schema.extend({
    autoUnloadOnSessionEnd: z.boolean().default(false),
    sessionTimeout: z.number().default(600000), // 10 minutes
  })

  export type Info = z.infer<typeof schema>
}
