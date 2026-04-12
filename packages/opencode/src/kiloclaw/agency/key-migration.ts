export const BLOCK_START = "# BEGIN KILOCLAW AGENCY2 KEY ROTATION"
export const BLOCK_END = "# END KILOCLAW AGENCY2 KEY ROTATION"

export const PROVIDERS = ["TAVILY", "FIRECRAWL", "BRAVE", "PERPLEXITY", "BALLDONTLIE", "ODDS", "POLYMARKET"] as const

export type Provider = (typeof PROVIDERS)[number]
export type Buckets = Record<Provider, string[]>

const ALIAS: Record<string, Provider> = {
  BRAVE_SEARCH_API_KEY: "BRAVE",
  THE_ODDS_API_KEY: "ODDS",
  ODDS_API_KEY: "ODDS",
  API_STORE_ODDS_API_KEY: "ODDS",
  API_STORE_BALLDONTLIE_KEY: "BALLDONTLIE",
  API_STORE_PERPLEXITY_KEY: "PERPLEXITY",
}

export interface EnvEntry {
  name: string
  value: string
}

const providerSet = new Set<string>(PROVIDERS)

const unquote = (value: string) => {
  const txt = value.trim()
  if ((txt.startsWith('"') && txt.endsWith('"')) || (txt.startsWith("'") && txt.endsWith("'"))) {
    return txt.slice(1, -1)
  }
  const [head] = txt.split(" #")
  return (head ?? txt).trim()
}

export const parseKeyLines = (content: string) => {
  const lines = content.split(/\r?\n/)
  const out: EnvEntry[] = []

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) continue
    const [, name, value] = match
    const clean = unquote(value)
    if (!clean) continue
    out.push({ name, value: clean })
  }

  return out
}

const inferProvider = (name: string): Provider | null => {
  const alias = ALIAS[name]
  if (alias) return alias

  const direct = PROVIDERS.find((provider) => name === `${provider}_API_KEY`)
  if (direct) return direct

  const indexed = PROVIDERS.find((provider) => name.startsWith(`${provider}_API_KEY_`))
  if (indexed) return indexed

  const list = PROVIDERS.find((provider) => name === `${provider}_API_KEYS`)
  if (list) return list

  const generic = name.match(/^([A-Z0-9_]+)_API_KEY(?:_\d+)?$/)
  const bucket = generic?.[1]
  if (!bucket) return null
  if (!providerSet.has(bucket)) return null
  return bucket as Provider
}

const extractKeys = (name: string, value: string) => {
  if (!name.endsWith("_API_KEYS")) return [value]
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
}

export const createEmptyBuckets = (): Buckets => ({
  TAVILY: [],
  FIRECRAWL: [],
  BRAVE: [],
  PERPLEXITY: [],
  BALLDONTLIE: [],
  ODDS: [],
  POLYMARKET: [],
})

export const normalizeBuckets = (entries: EnvEntry[]) => {
  const out = createEmptyBuckets()
  const seen = new Set<string>()

  for (const entry of entries) {
    const provider = inferProvider(entry.name)
    if (!provider) continue
    const keys = extractKeys(entry.name, entry.value)
    for (const key of keys) {
      const token = `${provider}:${key}`
      if (seen.has(token)) continue
      seen.add(token)
      out[provider].push(key)
    }
  }

  return out
}

export const renderManagedBlock = (buckets: Buckets) => {
  const lines = [BLOCK_START]

  for (const provider of PROVIDERS) {
    const keys = buckets[provider]
    lines.push(`# ${provider} (${keys.length})`)
    if (keys.length === 0) {
      lines.push("")
      continue
    }
    keys.forEach((key, idx) => {
      lines.push(`${provider}_API_KEY_${idx + 1}=${key}`)
    })
    lines.push(`${provider}_API_KEYS=${keys.join(",")}`)
    lines.push("")
  }

  lines.push(BLOCK_END)
  return lines.join("\n")
}

export const replaceManagedBlock = (target: string, block: string) => {
  const text = target.replace(/\r\n/g, "\n")
  const start = text.indexOf(BLOCK_START)
  const end = text.indexOf(BLOCK_END)
  if (start === -1 || end === -1 || end < start) {
    if (!text.trim()) return `${block}\n`
    const suffix = text.endsWith("\n") ? "" : "\n"
    return `${text}${suffix}\n${block}\n`
  }

  const endPos = end + BLOCK_END.length
  const before = text.slice(0, start)
  const after = text.slice(endPos)
  const pad = before.endsWith("\n") || !before ? "" : "\n"
  return `${before}${pad}${block}${after}`
}

export const listVariableNames = (buckets: Buckets) => {
  const vars: string[] = []
  for (const provider of PROVIDERS) {
    const keys = buckets[provider]
    if (keys.length === 0) continue
    keys.forEach((_, idx) => vars.push(`${provider}_API_KEY_${idx + 1}`))
    vars.push(`${provider}_API_KEYS`)
  }
  return vars
}
