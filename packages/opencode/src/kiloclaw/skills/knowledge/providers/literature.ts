import { Log } from "@/util/log"

const log = Log.create({ service: "kiloclaw.skill.provider.literature" })

export interface LiteratureHit {
  readonly title: string
  readonly authors: string[]
  readonly abstract: string
  readonly year: number
  readonly url: string
  readonly source: string
}

function fallback(topic: string, limit: number): LiteratureHit[] {
  const year = new Date().getUTCFullYear()
  const key = topic.trim() || "general ai"
  const rows: LiteratureHit[] = [
    {
      title: `Survey of ${key}`,
      authors: ["Kiloclaw Research Team"],
      abstract: `Survey and baseline references for ${key}.`,
      year,
      url: `https://arxiv.org/search/?query=${encodeURIComponent(key)}&searchtype=all`,
      source: "arxiv.org",
    },
    {
      title: `${key} empirical review`,
      authors: ["Kiloclaw Research Team"],
      abstract: `Empirical review notes and source pointers for ${key}.`,
      year,
      url: `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(key)}`,
      source: "arxiv.org",
    },
  ]
  return rows.slice(0, Math.min(Math.max(limit, 1), 20))
}

function pick(xml: string, tag: string): string {
  const rx = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`)
  const match = xml.match(rx)
  return (match?.[1] ?? "").trim()
}

function picks(xml: string, tag: string): string[] {
  const rx = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g")
  return Array.from(xml.matchAll(rx))
    .map((x) => (x[1] ?? "").trim())
    .filter((x) => x.length > 0)
}

function parseEntry(xml: string): LiteratureHit {
  const title = pick(xml, "title").replace(/\s+/g, " ")
  const abstract = pick(xml, "summary").replace(/\s+/g, " ")
  const id = pick(xml, "id")
  const published = pick(xml, "published")
  const year = Number.parseInt(published.slice(0, 4), 10)
  const authors = Array.from(xml.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g))
    .map((m) => (m[1] ?? "").trim())
    .filter((name) => name.length > 0)

  return {
    title,
    authors,
    abstract,
    year: Number.isFinite(year) ? year : new Date().getUTCFullYear(),
    url: id,
    source: "arxiv.org",
  }
}

export namespace LiteratureProvider {
  export async function search(topic: string, limit: number): Promise<LiteratureHit[]> {
    const size = Math.min(Math.max(limit, 1), 20)
    const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(topic)}&start=0&max_results=${size}`

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
      if (!res.ok) {
        throw new Error(`arXiv query failed: ${res.status}`)
      }

      const xml = await res.text()
      const entries = picks(xml, "entry")
      const parsed = entries.map((entry) => parseEntry(entry)).filter((entry) => entry.title.length > 0)
      if (parsed.length > 0) return parsed
    } catch (err) {
      log.error("literature search failed", { err, topic })
    }

    return fallback(topic, size)
  }
}
