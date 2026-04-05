import { Flag } from "@/flag/flag"

export type InjectionMode = "minimal" | "standard" | "proactive"

export type InjectionPlan = {
  mode: InjectionMode
  maxItemsPerLayer: number
  maxHits: number
}

export namespace MemoryInjectionPolicy {
  export function decide(input: { confidence: number; text: string }): InjectionPlan {
    if (!Flag.KILO_MEMORY_PROACTIVE_INJECTION_V1) {
      return {
        mode: "standard",
        maxItemsPerLayer: 4,
        maxHits: 6,
      }
    }

    const short = input.text.length < 90
    if (input.confidence < 0.62) {
      return {
        mode: "minimal",
        maxItemsPerLayer: 2,
        maxHits: 4,
      }
    }

    if (input.confidence > 0.78 && !short) {
      return {
        mode: "proactive",
        maxItemsPerLayer: 6,
        maxHits: 8,
      }
    }

    return {
      mode: "standard",
      maxItemsPerLayer: 4,
      maxHits: 6,
    }
  }
}
