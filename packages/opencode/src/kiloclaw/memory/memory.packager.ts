/**
 * Memory Packager - Structured Memory Formatting for LLM Injection
 * Based on BP-14 of KILOCLAW_MEMORY_ENHANCEMENT_PLAN
 * Packages retrieved memory into structured, LLM-friendly format
 */

import type { RankedItem } from "./memory.ranking"

export interface PackagingConfig {
  includeConfidence: boolean
  includeLayer: boolean
  includeTimestamp: boolean
  structuredFormat: boolean
  maxItemsPerLayer: number
}

export const DEFAULT_PACKAGING_CONFIG: PackagingConfig = {
  includeConfidence: true,
  includeLayer: true,
  includeTimestamp: true,
  structuredFormat: true,
  maxItemsPerLayer: 5,
}

export namespace MemoryPackager {
  /**
   * Package ranked memory items for prompt injection.
   * Returns structured blocks that are easy for LLM to parse.
   */
  export function packageMemory(items: RankedItem<any>[], config: Partial<PackagingConfig> = {}): string {
    const cfg = { ...DEFAULT_PACKAGING_CONFIG, ...config }

    if (items.length === 0) {
      return "No relevant memories found."
    }

    if (cfg.structuredFormat) {
      return packageAsStructuredBlocks(items, cfg)
    } else {
      return packageAsSimpleList(items, cfg)
    }
  }

  function packageAsStructuredBlocks(items: RankedItem<any>[], cfg: PackagingConfig): string {
    // Group by layer for organized presentation
    const byLayer = new Map<string, RankedItem<any>[]>()
    for (const item of items) {
      const layer = (item.item as any).layer ?? "unknown"
      if (!byLayer.has(layer)) byLayer.set(layer, [])
      byLayer.get(layer)!.push(item)
    }

    const sections: string[] = []

    // Working memory section
    if (byLayer.has("working")) {
      const workingItems = byLayer.get("working")!
      sections.push("## Working Memory (Current Context)")
      sections.push("")
      for (const item of workingItems.slice(0, cfg.maxItemsPerLayer)) {
        const key = (item.item as any).key ?? ""
        const value = formatValue((item.item as any).value)
        sections.push(`- **${key}**: ${value}`)
      }
      sections.push("")
    }

    // Episodic section
    if (byLayer.has("episodic")) {
      const episodicItems = byLayer.get("episodic")!
      sections.push("## Recent Episodes")
      sections.push("")
      for (const item of episodicItems.slice(0, cfg.maxItemsPerLayer)) {
        const ep = item.item as any
        const desc = ep.task_description?.slice(0, 100) ?? "Unknown task"
        const outcome = ep.outcome ?? "unknown"

        let line = `- ${desc}`
        if (cfg.includeLayer) line += ` [${outcome}]`
        if (cfg.includeConfidence && item.factors?.confidence) {
          line += ` (${Math.round(item.factors.confidence * 100)}% confidence)`
        }
        sections.push(line)
      }
      sections.push("")
    }

    // Semantic section
    if (byLayer.has("semantic")) {
      const semanticItems = byLayer.get("semantic")!
      sections.push("## Knowledge & Facts")
      sections.push("")
      for (const item of semanticItems.slice(0, cfg.maxItemsPerLayer + 3)) {
        const fact = item.item as any
        const text = `${fact.subject ?? ""} ${fact.predicate ?? ""} ${formatValue(fact.object)}`.trim()
        let line = `- ${text}`
        if (cfg.includeConfidence && item.factors?.confidence) {
          line += ` (${Math.round(item.factors.confidence * 100)}% confidence)`
        }
        sections.push(line)
      }
      sections.push("")
    }

    // Procedural section
    if (byLayer.has("procedural")) {
      const procItems = byLayer.get("procedural")!
      sections.push("## Procedures & Patterns")
      sections.push("")
      for (const item of procItems.slice(0, cfg.maxItemsPerLayer)) {
        const proc = item.item as any
        const name = proc.name?.replace(/^proc:/, "") ?? "Unnamed procedure"
        const success = proc.success_rate ?? 0
        let line = `- ${name.slice(0, 80)}`
        if (cfg.includeConfidence) line += ` (${success}% success rate)`
        sections.push(line)
      }
      sections.push("")
    }

    return ["<memory>", ...sections, "</memory>"].join("\n")
  }

  function packageAsSimpleList(items: RankedItem<any>[], cfg: PackagingConfig): string {
    const lines: string[] = []
    for (const item of items.slice(0, cfg.maxItemsPerLayer * 4)) {
      const text = extractContent(item.item)
      if (!text) continue

      let line = `- ${text.slice(0, 120)}`
      if (cfg.includeConfidence && item.factors?.confidence) {
        line += ` (${Math.round(item.factors.confidence * 100)}%)`
      }
      lines.push(line)
    }
    return lines.join("\n")
  }

  function extractContent(item: any): string {
    if (item?.task_description) return String(item.task_description)
    if (item?.subject || item?.predicate || item?.object) {
      return `${item.subject ?? ""} ${item.predicate ?? ""} ${String(item.object ?? "")}`.trim()
    }
    if (item?.name || item?.description) return `${item.name ?? ""} ${item.description ?? ""}`.trim()
    if (item?.key || item?.value) return `${String(item.key ?? "")} ${String(item.value ?? "")}`.trim()
    return ""
  }

  function formatValue(value: unknown): string {
    if (typeof value === "string") return value.slice(0, 100)
    if (value && typeof value === "object") {
      const str = JSON.stringify(value)
      return str.length > 100 ? `${str.slice(0, 100)}…` : str
    }
    return String(value ?? "")
  }
}
