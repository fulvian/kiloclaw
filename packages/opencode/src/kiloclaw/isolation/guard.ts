import { getBlockedPrefix, isCanonicalEnvKey } from "./paths"

export type IsolationMode = "strict" | "compat"

export interface IsolationViolation {
  readonly key: string
  readonly prefix: string
}

export interface IsolationReport {
  readonly mode: IsolationMode
  readonly ok: boolean
  readonly accepted: Record<string, string>
  readonly violations: IsolationViolation[]
}

export interface IsolationLogger {
  warn(msg: string, data?: Record<string, unknown>): void
}

export function validateEnvMap(env: Record<string, string | undefined>): IsolationReport {
  const accepted = Object.entries(env).reduce<Record<string, string>>((acc, [key, value]) => {
    if (!isCanonicalEnvKey(key)) return acc
    if (typeof value !== "string") return acc
    acc[key] = value
    return acc
  }, {})

  const violations = Object.keys(env).flatMap((key) => {
    const prefix = getBlockedPrefix(key)
    if (!prefix) return []
    return [{ key, prefix }]
  })

  return {
    mode: "strict",
    ok: violations.length === 0,
    accepted,
    violations,
  }
}

export function enforceIsolation(input: {
  env: Record<string, string | undefined>
  mode?: IsolationMode
  log?: IsolationLogger
}): IsolationReport {
  const mode = input.mode ?? "strict"
  const base = validateEnvMap(input.env)
  const report: IsolationReport = {
    ...base,
    mode,
  }

  if (report.violations.length === 0) return report

  const log = input.log ?? {
    warn() {
      return
    },
  }
  for (const item of report.violations) {
    log.warn("blocked env namespace", { key: item.key, prefix: item.prefix, mode })
  }

  if (mode === "compat") return report

  const sample = report.violations.map((x) => x.key).join(", ")
  throw new Error(`isolation violation: blocked prefixes detected (${sample})`)
}
