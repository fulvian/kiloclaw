import type { AuditEntry } from "./store"

export interface AuditReadable {
  query(input?: { correlationId?: string; event?: string; limit?: number }): AuditEntry[]
}

export interface AuditQueryInput {
  readonly correlationId?: string
  readonly event?: string
  readonly since?: number
  readonly until?: number
  readonly limit?: number
}

export namespace AuditQuery {
  export function run(store: AuditReadable, input?: AuditQueryInput): AuditEntry[] {
    const rows = store.query({
      correlationId: input?.correlationId,
      event: input?.event,
      limit: input?.limit,
    })

    const since = input?.since
    const until = input?.until

    const filtered = rows.filter((row) => {
      if (typeof since === "number" && row.timestamp < since) return false
      if (typeof until === "number" && row.timestamp > until) return false
      return true
    })

    const out = filtered.sort((a, b) => a.timestamp - b.timestamp)
    const limit = input?.limit ?? out.length
    return out.slice(-limit)
  }
}
