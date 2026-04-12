export const CANON_PREFIX = "KILOCLAW_"
export const BLOCKED_PREFIXES = ["KILO_", "OPENCODE_", "ARIA_"] as const

export type BlockedPrefix = (typeof BLOCKED_PREFIXES)[number]

export function isCanonicalEnvKey(key: string): boolean {
  return key.startsWith(CANON_PREFIX)
}

export function getBlockedPrefix(key: string): BlockedPrefix | null {
  const hit = BLOCKED_PREFIXES.find((prefix) => key.startsWith(prefix))
  return hit ?? null
}

export function isBlockedEnvKey(key: string): boolean {
  return getBlockedPrefix(key) !== null
}
