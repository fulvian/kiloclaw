export interface Citation {
  readonly title: string
  readonly url: string
  readonly source: string
  readonly snippet?: string
}

export interface EvidencePack {
  readonly citations: Citation[]
  readonly references: string[]
}

export namespace Evidence {
  export function pack(citations: Citation[]): EvidencePack {
    const refs = citations.map((c, idx) => `[${idx + 1}] ${c.title} - ${c.url}`)
    return {
      citations,
      references: refs,
    }
  }

  export function summarize(topic: string, citations: Citation[]): string {
    if (citations.length === 0) {
      return `No external evidence found for "${topic}".`
    }
    const sources = Array.from(new Set(citations.map((x) => x.source)))
      .slice(0, 3)
      .join(", ")
    return `Collected ${citations.length} evidence citation(s) for "${topic}" from ${sources}.`
  }
}
