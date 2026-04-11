import { mkdirSync, appendFileSync, existsSync, readFileSync } from "node:fs"
import { dirname } from "node:path"
import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"

const log = Log.create({ service: "kiloclaw.audit.store" })

export const AuditEntrySchema = z.object({
  id: z.string(),
  correlationId: z.string(),
  timestamp: z.number().int().nonnegative(),
  event: z.string(),
  payload: z.record(z.string(), z.unknown()),
})

export type AuditEntry = z.infer<typeof AuditEntrySchema>

export const AuditFilterSchema = z.object({
  correlationId: z.string().optional(),
  event: z.string().optional(),
  limit: z.number().int().positive().default(200),
})

export type AuditFilter = z.infer<typeof AuditFilterSchema>

export namespace AuditStore {
  export const create = fn(
    z.object({
      path: z.string(),
    }),
    (input) => {
      const file = input.path
      mkdirSync(dirname(file), { recursive: true })

      const append = fn(
        z.object({
          correlationId: z.string(),
          event: z.string(),
          payload: z.record(z.string(), z.unknown()),
          timestamp: z.number().int().nonnegative().optional(),
        }),
        (entry): AuditEntry => {
          const out = AuditEntrySchema.parse({
            id: crypto.randomUUID(),
            correlationId: entry.correlationId,
            timestamp: entry.timestamp ?? Date.now(),
            event: entry.event,
            payload: entry.payload,
          })
          appendFileSync(file, `${JSON.stringify(out)}\n`, "utf8")
          return out
        },
      )

      const query = fn(AuditFilterSchema.partial(), (filter): AuditEntry[] => {
        const opts = AuditFilterSchema.parse(filter)
        if (!existsSync(file)) return []
        const raw = readFileSync(file, "utf8")
        if (!raw.trim()) return []

        const rows = raw
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .flatMap((line) => {
            try {
              return [AuditEntrySchema.parse(JSON.parse(line))]
            } catch (err) {
              log.warn("skipping malformed audit row", { err })
              return []
            }
          })

        const byCorr = opts.correlationId ? rows.filter((x) => x.correlationId === opts.correlationId) : rows
        const byEvent = opts.event ? byCorr.filter((x) => x.event === opts.event) : byCorr
        return byEvent.slice(-opts.limit)
      })

      const byCorrelation = fn(
        z.object({ correlationId: z.string(), limit: z.number().int().positive().optional() }),
        (input) => query({ correlationId: input.correlationId, limit: input.limit }),
      )

      const byEvent = fn(z.object({ event: z.string(), limit: z.number().int().positive().optional() }), (input) =>
        query({ event: input.event, limit: input.limit }),
      )

      return {
        path: file,
        append,
        query,
        byCorrelation,
        byEvent,
      }
    },
  )
}
