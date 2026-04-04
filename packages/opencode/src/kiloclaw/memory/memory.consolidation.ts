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
        await MemoryBrokerV2.semantic().assert("task", "outcome", {
          description: desc,
          outcome: ep.outcome,
          agency: ep.agency_id,
          agent: ep.agent_id,
        }, ep.confidence)
        facts++
      }

      // procedure extraction hook (Qwen integration point)
      const shouldPromoteProcedure = ep.outcome === "success" && desc.length > 0
      if (shouldPromoteProcedure) {
        await ProceduralMemoryRepo.register({
          id: `proc_${crypto.randomUUID()}`,
          tenant_id: TENANT,
          user_id: options?.userId ?? ep.user_id ?? null,
          scope: "agency",
          name: `proc:${desc.slice(0, 64)}`,
          description: `Derived from successful episode ${ep.id}`,
          status: "active",
          current_version: "1.0.0",
          success_rate: 100,
          usage_count: 1,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
        procedures++
      }
    }

    const out = { scanned: episodes.length, facts, procedures }
    log.info("consolidation run complete", out)
    return out
  }
}
