import { Log } from "@/util/log"

const log = Log.create({ service: "kiloclaw.skill.provider.web-search" })

export interface WebHit {
  readonly title: string
  readonly url: string
  readonly snippet: string
  readonly source: string
}

function fallback(query: string, limit: number): WebHit[] {
  const topic = query.trim() || "general knowledge"
  const rows: WebHit[] = [
    {
      title: `${topic} overview`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(topic.replace(/\s+/g, "_"))}`,
      snippet: `Overview article for ${topic}.`,
      source: "wikipedia.org",
    },
    {
      title: `${topic} reference guide`,
      url: `https://duckduckgo.com/?q=${encodeURIComponent(topic)}`,
      snippet: `Search reference for ${topic}.`,
      source: "duckduckgo.com",
    },
  ]
  return rows.slice(0, Math.min(Math.max(limit, 1), 20))
}

function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch (err) {
    log.warn("failed to parse domain", { err, url })
    return "unknown"
  }
}

function decodeHtml(input: string): string {
  return input
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
}

async function searchWikipedia(query: string, limit: number): Promise<WebHit[]> {
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${limit}&namespace=0&format=json`
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
  if (!res.ok) {
    throw new Error(`wikipedia query failed: ${res.status}`)
  }
  const payload = (await res.json()) as [string, string[], string[], string[]]
  const titles = payload[1] ?? []
  const snippets = payload[2] ?? []
  const links = payload[3] ?? []
  return titles.map((title, idx) => ({
    title,
    url: links[idx] ?? "",
    snippet: snippets[idx] ?? "",
    source: domain(links[idx] ?? "https://wikipedia.org"),
  }))
}

async function searchDuckDuckGo(query: string, limit: number): Promise<WebHit[]> {
  const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
  if (!res.ok) {
    throw new Error(`duckduckgo query failed: ${res.status}`)
  }
  const html = await res.text()
  const rows = Array.from(
    html.matchAll(
      /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g,
    ),
  )
  return rows.slice(0, limit).map((m) => {
    const href = m[1] ?? ""
    const rawTitle = m[2] ?? ""
    const rawSnippet = m[3] ?? ""
    const title = decodeHtml(rawTitle.replace(/<[^>]*>/g, "").trim())
    const snippet = decodeHtml(rawSnippet.replace(/<[^>]*>/g, "").trim())
    const resultUrl = decodeURIComponent(href.replace(/^\/l\/\?uddg=/, "").split("&")[0] ?? "")
    return {
      title,
      url: resultUrl,
      snippet,
      source: domain(resultUrl),
    }
  })
}

export namespace WebSearchProvider {
  export async function search(query: string, limit: number): Promise<WebHit[]> {
    const size = Math.min(Math.max(limit, 1), 20)
    try {
      const wiki = await searchWikipedia(query, size)
      if (wiki.length > 0) return wiki
    } catch (err) {
      log.warn("wikipedia search failed", { err, query })
    }

    try {
      const results = await searchDuckDuckGo(query, size)
      if (results.length > 0) return results
    } catch (err) {
      log.error("duckduckgo search failed", { err, query })
    }

    return fallback(query, size)
  }
}
