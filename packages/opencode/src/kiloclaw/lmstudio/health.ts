import { Log } from "@/util/log"
import type { HealthStatus } from "./types"

const log = Log.create({ service: "lmstudio.health" })

export namespace HealthCheck {
  /**
   * Check if LM Studio server is reachable
   */
  export async function check(
    baseURL: string,
    options?: {
      timeout?: number
      retries?: number
      retryDelay?: number
    },
  ): Promise<HealthStatus> {
    const timeout = options?.timeout ?? 5000
    const retries = options?.retries ?? 1
    const retryDelay = options?.retryDelay ?? 1000

    for (let attempt = 1; attempt <= retries; attempt++) {
      const start = Date.now()

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), timeout)

        const response = await fetch(`${baseURL}/v1/models`, {
          method: "GET",
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (response.ok || response.status === 401) {
          const latencyMs = Date.now() - start

          // Try to get version from headers or response
          let version: string | undefined
          try {
            const data = await response.json()
            version = data.model // Some LM Studio versions return version info
          } catch {
            // Ignore parse errors
          }

          log.info("health check success", { baseURL, latencyMs, attempt })

          return {
            reachable: true,
            latencyMs,
            version,
          }
        }

        log.warn("health check failed", { baseURL, status: response.status, attempt })
      } catch (err) {
        const latencyMs = Date.now() - start
        const error = err instanceof Error ? err.message : String(err)

        log.warn("health check error", { baseURL, error, latencyMs, attempt })

        // If this is the last attempt, return unreachable status
        if (attempt === retries) {
          return {
            reachable: false,
            error: `Connection failed after ${retries} attempts: ${error}`,
          }
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
      }
    }

    return {
      reachable: false,
      error: `Failed after ${retries} attempts`,
    }
  }
}
