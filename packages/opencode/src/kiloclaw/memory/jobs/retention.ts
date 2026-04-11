import type { MemoryBroker, MemoryLifecycle } from "../types.js"

export interface RetentionSummary {
  scanned: number
  purged: number
  failed: number
  byLayer: Record<string, number>
  errors: string[]
}

export namespace RetentionJob {
  export async function run(input: {
    broker: Pick<MemoryBroker, "read" | "purge">
    lifecycle: Pick<MemoryLifecycle, "applyRetentionPolicy">
    now?: number
    dryRun?: boolean
  }): Promise<RetentionSummary> {
    const now = input.now ?? Date.now()

    try {
      const rows = await input.broker.read({ limit: 5000 })
      const acc: RetentionSummary = {
        scanned: rows.length,
        purged: 0,
        failed: 0,
        byLayer: {},
        errors: [],
      }

      for (const row of rows) {
        acc.byLayer[row.layer] = (acc.byLayer[row.layer] ?? 0) + 1
        const policy = input.lifecycle.applyRetentionPolicy(row.layer)
        const age = now - Date.parse(row.createdAt)
        const ttlExpired = typeof policy.ttlMs === "number" && age > policy.ttlMs
        const explicitExpired = typeof row.expiresAt === "string" && Date.parse(row.expiresAt) <= now
        const shouldPurge = ttlExpired || explicitExpired
        if (!shouldPurge) continue
        if (input.dryRun) continue

        try {
          await input.broker.purge(row.id, "expired")
          acc.purged += 1
        } catch (err) {
          acc.failed += 1
          acc.errors.push(err instanceof Error ? err.message : String(err))
        }
      }

      return acc
    } catch (err) {
      return {
        scanned: 0,
        purged: 0,
        failed: 1,
        byLayer: {},
        errors: [err instanceof Error ? err.message : String(err)],
      }
    }
  }
}
