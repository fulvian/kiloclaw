import { Log } from "@/util/log"
import { EpisodicMemoryRepo, ProceduralMemoryRepo } from "./memory.repository"
import { MemoryBrokerV2 } from "./memory.broker.v2"

const log = Log.create({ service: "kiloclaw.memory.consolidation" })

const TENANT = "default"

export namespace MemoryConsolidation {
  export async function run(options?: { since?: number; limit?: number; userId?: string }) {
    const since = options?.since ?? Date.now() - 24 * 60 * 60 * 1000
    const limit = options?.limit ?? 100
    const episodes = await EpisodicMemoryRepo.getRecentEpisodes(TENANT, limit, since)

    let facts = 0
    let procedures = 0

    for (const ep of episodes) {
      const desc = ep.task_description.trim()
      if (desc.length > 0) {
        await MemoryBrokerV2.semantic().assert(
          "task",
          "outcome",
          {
            description: desc,
            outcome: ep.outcome,
            agency: ep.agency_id,
            agent: ep.agent_id,
          },
          ep.confidence,
        )
        facts++
      }

      // BP-07: Enhanced procedural memory extraction
      const shouldPromoteProcedure = ep.outcome === "success" && desc.length > 0
      if (shouldPromoteProcedure) {
        const procName = `proc:${desc.slice(0, 64)}`

        // Check if similar procedure already exists
        const existing = await ProceduralMemoryRepo.list(TENANT, {
          scope: ep.agency_id ?? "global",
        })

        const similarProc = existing.find((p) => p.name === procName || p.description?.includes(desc.slice(0, 50)))

        if (similarProc) {
          // Update existing procedure stats
          await ProceduralMemoryRepo.updateStats(similarProc.id, true)
          log.debug("updated existing procedure", { id: similarProc.id, name: procName })
        } else {
          // Register new procedure with BP-07 enhanced fields
          await ProceduralMemoryRepo.register({
            id: `proc_${crypto.randomUUID()}`,
            tenant_id: TENANT,
            user_id: options?.userId ?? ep.user_id ?? null,
            scope: ep.agency_id ?? "global",
            name: procName,
            description: `Derived from successful episode ${ep.id}: ${desc.slice(0, 200)}`,
            status: "active",
            current_version: "1.0.0",
            success_rate: 100,
            usage_count: 1,
            // BP-07: Enhanced procedural memory fields
            pattern_tags: extractPatternTags(desc),
            steps: extractSteps(desc),
            prerequisites: extractPrerequisites(desc),
            created_at: Date.now(),
            updated_at: Date.now(),
          })
          procedures++
        }
      }
    }

    const out = { scanned: episodes.length, facts, procedures }
    log.info("consolidation run complete", out)
    return out
  }
}

// BP-07: Helper functions for procedural memory extraction

function extractPatternTags(description: string): string[] {
  const tags: string[] = []
  const patterns = [
    { regex: /debug|fix|repair/i, tag: "debugging" },
    { regex: /implement|build|create|develop/i, tag: "implementation" },
    { regex: /test|verify|check/i, tag: "testing" },
    { regex: /deploy|release|publish/i, tag: "deployment" },
    { regex: /analyze|investigate|examine/i, tag: "analysis" },
    { regex: /refactor|restructure|optimize/i, tag: "refactoring" },
    { regex: /configure|setup|install/i, tag: "configuration" },
    { regex: /review|audit/i, tag: "review" },
  ]
  for (const p of patterns) {
    if (p.regex.test(description)) tags.push(p.tag)
  }
  return tags
}

function extractSteps(description: string): string[] {
  // Split on common separators
  return description
    .split(/[,;]|\band\b|\bthen\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 5 && s.length < 100)
    .slice(0, 10)
}

function extractPrerequisites(description: string): string[] {
  const prereqs: string[] = []
  const match = description.match(/require[ds]?\s+([^.!?]+)/i)
  if (match) {
    prereqs.push(...match[1].split(/,\s*/).map((s) => s.trim()))
  }
  return prereqs
}
