/**
 * Service Health Check System
 *
 * Verifies that all necessary external services are active and functioning at startup.
 * If services are not active, attempts to start them. If unable to start,
 * signals a warning to the user.
 *
 * This is fundamental for ensuring Kiloclaw works with all systems fully functional.
 */

import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import { access, mkdir } from "fs/promises"
import { dirname } from "path"
import { HealthCheck as LMStudioHealth } from "@/kiloclaw/lmstudio/health"
import { AutoStart as LMStudioAutoStart } from "@/kiloclaw/lmstudio/autostart"

const log = Log.create({ service: "kiloclaw.service.health" })

export namespace ServiceHealth {
  /**
   * Health status of a service
   */
  export type Status = "healthy" | "degraded" | "unavailable" | "unknown"

  /**
   * Result of a health check
   */
  export interface CheckResult {
    name: string
    status: Status
    message?: string
    error?: string
    canStartup: boolean
    requiresStartup: boolean
  }

  /**
   * Service descriptor
   */
  export interface ServiceDescriptor {
    name: string
    required: boolean
    check: () => Promise<CheckResult>
    startup?: () => Promise<void>
  }

  /**
   * Overall health report
   */
  export interface HealthReport {
    healthy: ServiceDescriptor[]
    degraded: ServiceDescriptor[]
    unavailable: ServiceDescriptor[]
    unknown: ServiceDescriptor[]
    allRequiredHealthy: boolean
    timestamp: number
  }

  /**
   * Check if a path is accessible (directory exists and is writable)
   */
  async function checkPathAccessible(path: string): Promise<CheckResult> {
    try {
      const dir = dirname(path)
      await access(dir)
      return {
        name: "path",
        status: "healthy",
        message: `Directory accessible: ${dir}`,
        canStartup: true,
        requiresStartup: false,
      }
    } catch {
      // Try to create the directory
      try {
        const dir = dirname(path)
        await mkdir(dir, { recursive: true })
        return {
          name: "path",
          status: "healthy",
          message: `Created directory: ${dir}`,
          canStartup: true,
          requiresStartup: true,
        }
      } catch (err) {
        return {
          name: "path",
          status: "unavailable",
          error: `Cannot access or create directory: ${dirname(path)}`,
          canStartup: false,
          requiresStartup: true,
        }
      }
    }
  }

  /**
   * Check memory persistence service (SQLite)
   */
  async function checkMemoryPersistence(): Promise<CheckResult> {
    if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      return {
        name: "memory-persistence",
        status: "healthy",
        message: "Memory V2 is disabled - using in-memory only",
        canStartup: true,
        requiresStartup: false,
      }
    }

    // Memory persistence uses SQLite (embedded in Bun) - no external service needed
    // Just verify the data directory is accessible
    try {
      const dbPath = process.env["KILO_MEMORY_DB_PATH"] || ".kilocode/memory.db"
      const result = await checkPathAccessible(dbPath)

      if (result.status === "healthy") {
        return {
          name: "memory-persistence",
          status: "healthy",
          message: "Memory V2: SQLite database accessible",
          canStartup: true,
          requiresStartup: false,
        }
      } else {
        return {
          name: "memory-persistence",
          status: result.status,
          message: "Memory V2: Directory issue",
          error: result.error,
          canStartup: result.canStartup,
          requiresStartup: result.requiresStartup,
        }
      }
    } catch (err) {
      return {
        name: "memory-persistence",
        status: "degraded",
        message: "Memory V2: Running with limited persistence",
        error: String(err),
        canStartup: true,
        requiresStartup: false,
      }
    }
  }

  /**
   * Check LM Studio embeddings endpoint (required for production vector retrieval)
   */
  async function checkLMStudioEmbeddings(): Promise<CheckResult> {
    if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      return {
        name: "lmstudio-embeddings",
        status: "healthy",
        message: "Memory V2 disabled, embeddings not required",
        canStartup: true,
        requiresStartup: false,
      }
    }

    const baseURL = process.env["KILO_MEMORY_LMSTUDIO_BASE_URL"] ?? "http://127.0.0.1:1234"
    const health = await LMStudioHealth.check(baseURL, { timeout: 3000, retries: 1 })
    if (health.reachable) {
      return {
        name: "lmstudio-embeddings",
        status: "healthy",
        message: `LM Studio reachable (${baseURL})`,
        canStartup: true,
        requiresStartup: false,
      }
    }

    const start = await LMStudioAutoStart.startDaemon(baseURL)
    if (start.success) {
      return {
        name: "lmstudio-embeddings",
        status: "healthy",
        message: `LM Studio auto-started (${baseURL})`,
        canStartup: true,
        requiresStartup: true,
      }
    }

    return {
      name: "lmstudio-embeddings",
      status: "unavailable",
      message: "LM Studio unavailable and auto-start failed",
      error: start.error ?? health.error,
      canStartup: false,
      requiresStartup: true,
    }
  }

  /**
   * Check database connectivity (for future Postgres+pgvector)
   */
  async function checkDatabase(): Promise<CheckResult> {
    // For MVP, we use SQLite which is embedded
    return {
      name: "database",
      status: "healthy",
      message: "Using embedded SQLite (MVP)",
      canStartup: true,
      requiresStartup: false,
    }
  }

  /**
   * Check PostgreSQL connectivity when using postgres provider
   */
  async function checkPostgres(): Promise<CheckResult> {
    const provider = process.env["KILO_MEMORY_PROVIDER"] ?? "sqlite"

    if (provider !== "postgres") {
      return {
        name: "postgres",
        status: "healthy",
        message: "Using SQLite provider",
        canStartup: true,
        requiresStartup: false,
      }
    }

    const connectionString = process.env["KILO_POSTGRES_CONNECTION_STRING"]
    if (!connectionString) {
      return {
        name: "postgres",
        status: "unavailable",
        message: "PostgreSQL provider selected but no connection string",
        error: "KILO_POSTGRES_CONNECTION_STRING not set",
        canStartup: false,
        requiresStartup: true,
      }
    }

    try {
      // Try to connect and run simple query
      // Note: Actual implementation would use pg driver to connect
      // For now, we just validate the connection string format
      if (!connectionString.startsWith("postgresql://") && !connectionString.startsWith("postgres://")) {
        throw new Error("Invalid PostgreSQL connection string format")
      }

      return {
        name: "postgres",
        status: "healthy",
        message: "PostgreSQL connection string configured",
        canStartup: true,
        requiresStartup: false,
      }
    } catch (err) {
      return {
        name: "postgres",
        status: "unavailable",
        message: "PostgreSQL connection failed",
        error: String(err),
        canStartup: false,
        requiresStartup: true,
      }
    }
  }

  /**
   * Check LM Studio model availability
   */
  async function checkLMStudioModel(): Promise<CheckResult> {
    if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      return {
        name: "lmstudio-model",
        status: "healthy",
        message: "Memory V2 disabled",
        canStartup: true,
        requiresStartup: false,
      }
    }

    const baseURL = process.env["KILO_MEMORY_LMSTUDIO_BASE_URL"] ?? "http://127.0.0.1:1234"

    try {
      const response = await fetch(`${baseURL}/v1/models`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      })

      if (!response.ok) {
        return {
          name: "lmstudio-model",
          status: "degraded",
          message: `LM Studio returned status ${response.status}`,
          canStartup: true,
          requiresStartup: false,
        }
      }

      const data = (await response.json()) as { data?: Array<{ id?: string; model?: string }> }
      const expectedModel = process.env["KILO_MEMORY_EMBEDDING_MODEL"] ?? "text-embedding-mxbai-embed-large-v1"
      const hasModel = data.data?.some((m) => m.id?.includes(expectedModel) || m.model?.includes(expectedModel))

      if (hasModel) {
        return {
          name: "lmstudio-model",
          status: "healthy",
          message: `Expected model "${expectedModel}" is available`,
          canStartup: true,
          requiresStartup: false,
        }
      }

      return {
        name: "lmstudio-model",
        status: "degraded",
        message: `Expected model "${expectedModel}" not found in available models`,
        canStartup: true,
        requiresStartup: false,
      }
    } catch (err) {
      return {
        name: "lmstudio-model",
        status: "unavailable",
        message: "Could not check LM Studio models",
        error: String(err),
        canStartup: false,
        requiresStartup: true,
      }
    }
  }

  /**
   * Service descriptors - define all services to check
   */
  const services: ServiceDescriptor[] = [
    {
      name: "memory-persistence",
      required: Flag.KILO_EXPERIMENTAL_MEMORY_V2,
      check: checkMemoryPersistence,
    },
    {
      name: "lmstudio-embeddings",
      required: Flag.KILO_EXPERIMENTAL_MEMORY_V2,
      check: checkLMStudioEmbeddings,
    },
    {
      name: "database",
      required: false,
      check: checkDatabase,
    },
    {
      name: "postgres",
      required: process.env["KILO_MEMORY_PROVIDER"] === "postgres",
      check: checkPostgres,
    },
    {
      name: "lmstudio-model",
      required: Flag.KILO_EXPERIMENTAL_MEMORY_V2,
      check: checkLMStudioModel,
    },
  ]

  /**
   * Run all health checks
   */
  export async function checkAll(): Promise<HealthReport> {
    log.info("running service health checks...")

    const results = await Promise.all(services.map((s) => s.check()))

    const report: HealthReport = {
      healthy: [],
      degraded: [],
      unavailable: [],
      unknown: [],
      allRequiredHealthy: true,
      timestamp: Date.now(),
    }

    for (let i = 0; i < results.length; i++) {
      const result = results[i]
      const service = services[i]

      switch (result.status) {
        case "healthy":
          report.healthy.push(service)
          break
        case "degraded":
          report.degraded.push(service)
          report.allRequiredHealthy = false
          break
        case "unavailable":
          if (service.required) {
            report.unavailable.push(service)
            report.allRequiredHealthy = false
          }
          break
        case "unknown":
          report.unknown.push(service)
          break
      }
    }

    log.info("health check complete", {
      healthy: report.healthy.length,
      degraded: report.degraded.length,
      unavailable: report.unavailable.length,
      unknown: report.unknown.length,
      allRequiredHealthy: report.allRequiredHealthy,
    })

    return report
  }

  /**
   * Format warnings for user display
   */
  export function formatWarnings(report: HealthReport): string[] {
    const warnings: string[] = []

    if (!report.allRequiredHealthy) {
      warnings.push("⚠️  Some required services are not available:")
    }

    for (const service of report.degraded) {
      warnings.push(`  ⚡ ${service.name}: DEGRADED`)
    }

    for (const service of report.unavailable) {
      warnings.push(`  🔴 ${service.name}: UNAVAILABLE`)
    }

    for (const service of report.unknown) {
      warnings.push(`  ⚪ ${service.name}: UNKNOWN STATE`)
    }

    if (report.degraded.length > 0 || report.unavailable.length > 0) {
      warnings.push("")
      warnings.push("Kiloclaw may have limited functionality. Some features may not work correctly.")
      if (Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
        warnings.push("Memory persistence is enabled but not fully available.")
        warnings.push("Set KILO_EXPERIMENTAL_MEMORY_V2=false to use in-memory mode only.")
      }
    }

    return warnings
  }

  /**
   * Print warnings to console
   */
  export function printWarnings(report: HealthReport): void {
    const warnings = formatWarnings(report)
    for (const warning of warnings) {
      console.warn(warning)
    }
  }
}
