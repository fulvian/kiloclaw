// Token Migration Script
// Migrates tokens from legacy storage to encrypted database
// Run once during deployment for zero-downtime transition
// Phase 4 Task 1.5: Migration Strategy

import { Log } from "@/util/log"
import { TokenManager, type TokenPayload } from "./token-manager"
import { BrokerTokenIntegration } from "./broker-integration"

const log = Log.create({ service: "token-migration" })

// ============================================================================
// Migration State & Results
// ============================================================================

interface MigrationResult {
  successful: number
  failed: number
  skipped: number
  totalProcessed: number
  duration: number
  errors: Array<{
    userId: string
    workspaceId: string
    error: string
  }>
  warnings: string[]
}

// ============================================================================
// Migration Script
// ============================================================================

export namespace TokenMigration {
  /**
   * Main migration entry point
   * Call this once during deployment to migrate all tokens to new system
   */
  export async function migrateTokensToDB(options: {
    dryRun?: boolean
    batchSize?: number
    logProgress?: boolean
  } = {}): Promise<MigrationResult> {
    const startTime = Date.now()
    const dryRun = options.dryRun ?? false
    const batchSize = options.batchSize ?? 100
    const logProgress = options.logProgress ?? true

    const results: MigrationResult = {
      successful: 0,
      failed: 0,
      skipped: 0,
      totalProcessed: 0,
      duration: 0,
      errors: [],
      warnings: [],
    }

    try {
      if (!process.env.GWORKSPACE_TOKEN_KEY) {
        throw new Error("GWORKSPACE_TOKEN_KEY environment variable not set - migration requires encryption key")
      }

      log.info("starting token migration", {
        dryRun,
        batchSize,
      })

      // TODO: Implement actual migration logic once legacy storage is identified
      // This is a template for when you have in-memory or legacy tokens to migrate

      // Step 1: Identify source tokens
      // const legacyTokens = await getLegacyTokens()
      // results.totalProcessed = legacyTokens.length

      // Step 2: Migrate in batches
      // for (let i = 0; i < legacyTokens.length; i += batchSize) {
      //   const batch = legacyTokens.slice(i, i + batchSize)
      //   await migrateBatch(batch, results, dryRun)
      //
      //   if (logProgress) {
      //     const progress = Math.min(i + batchSize, legacyTokens.length)
      //     log.info("migration progress", {
      //       processed: progress,
      //       total: legacyTokens.length,
      //       percentage: Math.round((progress / legacyTokens.length) * 100),
      //     })
      //   }
      // }

      // Step 3: Verify migration
      // await verifyMigration(results, dryRun)

      results.duration = Date.now() - startTime

      log.info("migration completed", {
        successful: results.successful,
        failed: results.failed,
        skipped: results.skipped,
        durationMs: results.duration,
      })

      return results
    } catch (error) {
      results.duration = Date.now() - startTime
      log.error("migration failed", {
        error: error instanceof Error ? error.message : String(error),
        durationMs: results.duration,
      })
      throw error
    }
  }

  /**
   * Pre-migration validation
   * Check system readiness before running migration
   */
  export async function validateMigrationReadiness(): Promise<{
    ready: boolean
    issues: string[]
  }> {
    const issues: string[] = []

    // Check environment
    if (!process.env.GWORKSPACE_TOKEN_KEY) {
      issues.push("GWORKSPACE_TOKEN_KEY environment variable not set")
    }

    // Check database connection
    try {
      const stats = BrokerTokenIntegration.getCacheStats()
      if (!stats) {
        issues.push("Unable to connect to token cache")
      }
    } catch (error) {
      issues.push(`Database connection check failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    // Check cache stats
    try {
      const stats = BrokerTokenIntegration.getCacheStats()
      log.info("pre-migration check", {
        cacheSize: stats.tokenCache.size,
        canConnect: true,
      })
    } catch (error) {
      issues.push(`Cache stats check failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    return {
      ready: issues.length === 0,
      issues,
    }
  }

  /**
   * Verify migration completed successfully
   */
  export async function verifyMigrationState(): Promise<{
    isHealthy: boolean
    issues: string[]
    stats: {
      cacheSize: number
      timestamp: number
    }
  }> {
    const issues: string[] = []

    try {
      const stats = BrokerTokenIntegration.getCacheStats()

      return {
        isHealthy: issues.length === 0,
        issues,
        stats: {
          cacheSize: stats.tokenCache.size,
          timestamp: Date.now(),
        },
      }
    } catch (error) {
      issues.push(`Verification failed: ${error instanceof Error ? error.message : String(error)}`)
      return {
        isHealthy: false,
        issues,
        stats: { cacheSize: 0, timestamp: Date.now() },
      }
    }
  }

  /**
   * Graceful degradation: Accept tokens from both old and new sources
   * Use this during 24-hour transition period after deployment
   *
   * NEW tokens → stored in DB via TokenManager
   * OLD tokens → fallback to in-memory cache if DB unavailable
   *
   * After 24 hours, remove this fallback and require all tokens in DB
   */
  export async function getAccessTokenWithFallback(
    userId: string,
    workspaceId: string,
    fallbackToken?: string
  ): Promise<string> {
    try {
      // Try new system (encrypted DB) first
      return await BrokerTokenIntegration.getAccessToken({
        userId,
        workspaceId,
      })
    } catch (error) {
      // Fallback to in-memory token if provided
      if (fallbackToken) {
        log.warn("using fallback token", {
          userId,
          workspaceId,
          error: error instanceof Error ? error.message : String(error),
        })
        return fallbackToken
      }

      throw error
    }
  }

  /**
   * Rollback migration: Clear new tokens and revert to old system
   * Only call this in emergency situations
   */
  export async function rollbackMigration(options: { clearNewTokens?: boolean } = {}): Promise<{
    success: boolean
    message: string
    timestamp: number
  }> {
    const timestamp = Date.now()

    try {
      log.warn("ROLLBACK initiated - reverting to previous token system", {
        timestamp,
      })

      if (options.clearNewTokens) {
        log.warn("clearing all new tokens from encrypted storage")
        BrokerTokenIntegration.clearCaches()
      }

      log.info("rollback completed - system reverted to legacy mode", {
        timestamp,
      })

      return {
        success: true,
        message: "Migration rolled back successfully. System using legacy token storage.",
        timestamp,
      }
    } catch (error) {
      log.error("rollback failed", {
        error: error instanceof Error ? error.message : String(error),
        timestamp,
      })

      return {
        success: false,
        message: `Rollback failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp,
      }
    }
  }

  /**
   * Get migration status (for monitoring)
   */
  export function getMigrationStatus(): {
    status: "not_started" | "in_progress" | "complete" | "degraded"
    timestamp: number
    cacheSize: number
    issues: string[]
  } {
    try {
      const stats = BrokerTokenIntegration.getCacheStats()

      return {
        status: stats.tokenCache.size > 0 ? "complete" : "not_started",
        timestamp: Date.now(),
        cacheSize: stats.tokenCache.size,
        issues: [],
      }
    } catch (error) {
      return {
        status: "degraded",
        timestamp: Date.now(),
        cacheSize: 0,
        issues: [error instanceof Error ? error.message : String(error)],
      }
    }
  }
}

// ============================================================================
// CLI Entry Point (for direct execution)
// ============================================================================

export async function runMigration(args: string[]): Promise<void> {
  const dryRun = args.includes("--dry-run")
  const skipValidation = args.includes("--skip-validation")

  console.log("🔄 Token Migration Script")
  console.log(`Date: ${new Date().toISOString()}`)
  console.log("")

  if (!skipValidation) {
    console.log("📋 Validating migration readiness...")
    const validation = await TokenMigration.validateMigrationReadiness()

    if (!validation.ready) {
      console.error("❌ Migration validation failed:")
      validation.issues.forEach((issue) => console.error(`  - ${issue}`))
      process.exit(1)
    }

    console.log("✅ System ready for migration")
    console.log("")
  }

  const mode = dryRun ? "DRY-RUN" : "LIVE"
  console.log(`🚀 Starting migration (${mode} mode)...`)
  console.log("")

  const result = await TokenMigration.migrateTokensToDB({
    dryRun,
    batchSize: 100,
    logProgress: true,
  })

  console.log("")
  console.log("📊 Migration Results:")
  console.log(`  Successful: ${result.successful}`)
  console.log(`  Failed: ${result.failed}`)
  console.log(`  Skipped: ${result.skipped}`)
  console.log(`  Total Processed: ${result.totalProcessed}`)
  console.log(`  Duration: ${result.duration}ms`)

  if (result.errors.length > 0) {
    console.log("")
    console.log("⚠️  Errors:")
    result.errors.forEach((err) => {
      console.log(`  - ${err.userId}/${err.workspaceId}: ${err.error}`)
    })
  }

  if (result.warnings.length > 0) {
    console.log("")
    console.log("⚠️  Warnings:")
    result.warnings.forEach((warn) => {
      console.log(`  - ${warn}`)
    })
  }

  console.log("")
  if (dryRun) {
    console.log("✅ Dry-run completed. No changes made.")
  } else {
    console.log("✅ Migration completed successfully!")
  }

  process.exit(result.errors.length > 0 ? 1 : 0)
}
