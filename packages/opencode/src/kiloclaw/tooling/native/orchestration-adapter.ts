import { AdapterOutput, type NativeAdapter } from "./capability-registry"
import { SkillRegistry } from "@/kiloclaw/agency/registry/skill-registry"

export namespace NativeOrchestrationAdapter {
  export function create(input?: {
    id?: string
    probe?: NativeAdapter["probe"]
    run?: (data: Record<string, unknown>) => Promise<AdapterOutput>
  }): NativeAdapter {
    return {
      id: input?.id ?? "native.orchestration",
      capability: "orchestration_ops",
      probe: input?.probe ?? (async () => ({ healthy: true, latency_ms: 0, reason: "ok" })),
      invoke:
        input?.run ??
        (async (data: Record<string, unknown>) => {
          const skillId = data.skillId as string | undefined
          if (skillId) {
            const skill = SkillRegistry.getSkill(skillId)
            if (skill) {
              return {
                ok: true,
                data: {
                  skillId: skill.id,
                  version: skill.version,
                  capabilities: skill.capabilities,
                  loaded: true,
                },
              }
            }
            return {
              ok: false,
              error: `skill not found: ${skillId}`,
              transient: false,
            }
          }
          return {
            ok: false,
            error: "native.orchestration adapter requires skillId in payload",
            transient: false,
          }
        }),
    }
  }
}
