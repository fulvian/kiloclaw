import { Flag } from "@/flag/flag"
import { Log } from "@/util/log"
import { MemoryIntent, type RecallIntent } from "./memory.intent"

const log = Log.create({ service: "kiloclaw.memory.recall-policy" })

export type RecallDecision = "recall" | "shadow" | "skip"

export type RecallEval = {
  decision: RecallDecision
  confidence: number
  reasons: string[]
  intent: RecallIntent
  thresholds: {
    recall: number
    shadow: number
  }
}

const DEFAULT = {
  recall: 0.55,
  shadow: 0.4,
} as const

const PREF_HARD_RECALL = [
  /in\s+base\s+ai\s+miei\s+gusti/i,
  /sulla\s+base\s+dei\s+miei\s+gusti/i,
  /in\s+base\s+alle\s+mie\s+preferenze/i,
  /based\s+on\s+my\s+tastes?/i,
  /based\s+on\s+my\s+preferences/i,
  /what\s+i\s+like/i,
]

export namespace MemoryRecallPolicy {
  export async function evaluate(text: string): Promise<RecallEval> {
    const intent = await MemoryIntent.classify(text)
    const boost =
      intent.kind === "explicit_recall"
        ? 0.18
        : intent.kind === "preference_reuse"
          ? 0.16
          : intent.kind === "continuation"
            ? 0.1
            : 0
    const score = clamp(intent.score + boost)

    if (intent.kind === "preference_reuse" && PREF_HARD_RECALL.some((re) => re.test(text))) {
      const out = {
        decision: "recall",
        confidence: Math.max(score, 0.72),
        reasons: [...intent.reasons, "hard_preference_recall_pattern"],
        intent,
        thresholds: { ...DEFAULT },
      } satisfies RecallEval
      log.debug("recall policy evaluated", out)
      return out
    }

    if (!Flag.KILO_MEMORY_RECALL_POLICY_V1) {
      const decision = score >= DEFAULT.recall ? "recall" : "skip"
      const out = {
        decision,
        confidence: score,
        reasons: [...intent.reasons, decision === "recall" ? "legacy_threshold_recall" : "legacy_threshold_skip"],
        intent,
        thresholds: { ...DEFAULT },
      } satisfies RecallEval
      log.debug("recall policy evaluated (legacy)", out)
      return out
    }

    if (score >= DEFAULT.recall) {
      const out = {
        decision: "recall",
        confidence: score,
        reasons: [...intent.reasons, "score_above_recall_threshold"],
        intent,
        thresholds: { ...DEFAULT },
      } satisfies RecallEval
      log.debug("recall policy evaluated", out)
      return out
    }

    const tri = Flag.KILO_MEMORY_RECALL_TRI_STATE || Flag.KILO_MEMORY_SHADOW_MODE
    if (tri && score >= DEFAULT.shadow) {
      const out = {
        decision: "shadow",
        confidence: score,
        reasons: [...intent.reasons, "score_in_shadow_band"],
        intent,
        thresholds: { ...DEFAULT },
      } satisfies RecallEval
      log.debug("recall policy evaluated", out)
      return out
    }

    const out = {
      decision: "skip",
      confidence: score,
      reasons: [...intent.reasons, "score_below_shadow_threshold"],
      intent,
      thresholds: { ...DEFAULT },
    } satisfies RecallEval
    log.debug("recall policy evaluated", out)
    return out
  }
}

function clamp(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}
