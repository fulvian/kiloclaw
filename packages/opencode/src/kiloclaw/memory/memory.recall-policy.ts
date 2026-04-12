import { Flag } from "@/flag/flag"
import { Log } from "@/util/log"
import { MemoryIntent, type RecallIntent } from "./memory.intent"
import { SemanticTriggerPolicy } from "./semantic-trigger.policy"

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
    triggerType: "semantic" | "bm25_fallback" | "keyword_legacy"
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
  /**
   * Main entry point for recall decision.
   *
   * NEW FLOW (when KILOCLAW_SEMANTIC_TRIGGER_V1=true):
   * 1. Call SemanticTriggerPolicy.evaluate() - pure embedding-based
   * 2. If LM Studio unavailable, falls back to BM25 automatically
   * 3. Return decision with confidence and metadata
   *
   * OLD FLOW (legacy, when flag=false):
   * 1. Use keyword-based MemoryIntent.classify()
   * 2. Apply threshold logic
   * 3. Deprecated but kept for backward compatibility during migration
   */
  export async function evaluate(text: string): Promise<RecallEval> {
    // NEW: Semantic trigger (primary path)
    if (Flag.KILOCLAW_SEMANTIC_TRIGGER_V1) {
      return evaluateWithSemanticTrigger(text)
    }

    // OLD: Keyword-based legacy path (deprecated)
    return evaluateLegacy(text)
  }

  /**
   * NEW: Semantic-based evaluation using embedding similarity
   */
  async function evaluateWithSemanticTrigger(text: string): Promise<RecallEval> {
    const start = performance.now()

    const semanticResult = await SemanticTriggerPolicy.evaluate(text)

    const elapsed = performance.now() - start

    log.debug("recall policy evaluated (semantic)", {
      decision: semanticResult.decision,
      confidence: semanticResult.confidence,
      topSimilarity: semanticResult.topSimilarity,
      fallbackUsed: semanticResult.fallbackUsed,
      elapsedMs: elapsed.toFixed(1),
    })

    return {
      decision: semanticResult.decision,
      confidence: semanticResult.confidence,
      reasons: [
        `semantic_trigger`,
        semanticResult.fallbackUsed ? "bm25_fallback" : "lm_studio_vector",
        `episodes_compared:${semanticResult.episodesCompared}`,
        `top_similarity:${semanticResult.topSimilarity.toFixed(3)}`,
      ],
      intent: {
        kind: "explicit_recall" as any, // Backward compat - kind no longer meaningful
        lang: "unknown" as any, // Language detection no longer needed for trigger
        score: semanticResult.confidence,
        reasons: [],
        feats: {
          lexical: 0,
          temporal: 0,
          referential: 0,
          semantic: semanticResult.topSimilarity,
          question: 0,
        },
      },
      thresholds: {
        recall: Flag.KILOCLAW_SEMANTIC_THRESHOLD_RECALL,
        shadow: Flag.KILOCLAW_SEMANTIC_THRESHOLD_SHADOW,
        triggerType: semanticResult.fallbackUsed ? "bm25_fallback" : "semantic",
      },
    }
  }

  /**
   * LEGACY: Keyword-based evaluation (deprecated)
   * Kept for backward compatibility during migration.
   */
  async function evaluateLegacy(text: string): Promise<RecallEval> {
    const intent = await MemoryIntent.classify(text)
    const conversationalRef = /(conversaz|sessioni?|discusso|discussed)/i.test(text)
    const contextBoost =
      conversationalRef && intent.feats.temporal > 0 && intent.feats.referential > 0
        ? 0.16
        : conversationalRef && (intent.feats.temporal > 0 || intent.feats.referential > 0)
          ? 0.1
          : 0
    const boost =
      intent.kind === "explicit_recall"
        ? 0.18
        : intent.kind === "preference_reuse"
          ? 0.16
          : intent.kind === "continuation"
            ? 0.1
            : 0
    const score = clamp(intent.score + boost + contextBoost)

    if (intent.kind === "preference_reuse" && PREF_HARD_RECALL.some((re) => re.test(text))) {
      const out = {
        decision: "recall",
        confidence: Math.max(score, 0.72),
        reasons: [...intent.reasons, "hard_preference_recall_pattern"],
        intent,
        thresholds: { ...DEFAULT, triggerType: "keyword_legacy" as const },
      } satisfies RecallEval
      log.debug("recall policy evaluated (legacy)", out)
      return out
    }

    if (!Flag.KILO_MEMORY_RECALL_POLICY_V1) {
      const decision = score >= DEFAULT.recall ? "recall" : "skip"
      const out = {
        decision,
        confidence: score,
        reasons: [...intent.reasons, decision === "recall" ? "legacy_threshold_recall" : "legacy_threshold_skip"],
        intent,
        thresholds: { ...DEFAULT, triggerType: "keyword_legacy" as const },
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
        thresholds: { ...DEFAULT, triggerType: "keyword_legacy" as const },
      } satisfies RecallEval
      log.debug("recall policy evaluated (legacy)", out)
      return out
    }

    const tri = Flag.KILO_MEMORY_RECALL_TRI_STATE || Flag.KILO_MEMORY_SHADOW_MODE
    if (tri && score >= DEFAULT.shadow) {
      const out = {
        decision: "shadow",
        confidence: score,
        reasons: [...intent.reasons, "score_in_shadow_band"],
        intent,
        thresholds: { ...DEFAULT, triggerType: "keyword_legacy" as const },
      } satisfies RecallEval
      log.debug("recall policy evaluated (legacy)", out)
      return out
    }

    const out = {
      decision: "skip",
      confidence: score,
      reasons: [...intent.reasons, "score_below_shadow_threshold"],
      intent,
      thresholds: { ...DEFAULT, triggerType: "keyword_legacy" as const },
    } satisfies RecallEval
    log.debug("recall policy evaluated (legacy)", out)
    return out
  }
}

function clamp(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}
