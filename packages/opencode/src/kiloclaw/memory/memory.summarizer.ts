/**
 * Memory Summarizer - Progressive Summarization for Episodic Memory
 * Based on BP-05 of KILOCLAW_MEMORY_ENHANCEMENT_PLAN
 * Condenses long conversations preserving key information
 */

import { Log } from "@/util/log"
import { EpisodicMemoryRepo, SemanticMemoryRepo } from "./memory.repository"
import { MemoryBrokerV2 } from "./memory.broker.v2"

const log = Log.create({ service: "kiloclaw.memory.summarizer" })

const TENANT = "default"

export namespace MemorySummarizer {
  interface SummarizationCandidate {
    sessionId: string
    episodeIds: string[]
    totalTokens: number
  }

  /**
   * Check if session needs summarization.
   * Trigger: session has > 20 episodes OR oldest episode > 24h old.
   */
  export async function needsSummarization(sessionId: string): Promise<boolean> {
    // Get episodes that match this session
    const episodes = await EpisodicMemoryRepo.getRecentEpisodes(TENANT, 100)

    // Filter by session_id in the artifacts or correlation
    // Note: getRecentEpisodes doesn't filter by sessionId directly
    // We need to check each episode's correlation or artifacts
    const sessionEpisodes = episodes.filter((ep) => {
      const artifacts = ep.artifacts as Record<string, unknown> | null
      return artifacts?.sessionId === sessionId
    })

    if (sessionEpisodes.length > 20) return true

    if (sessionEpisodes.length === 0) return false

    const oldestTs = Math.min(...sessionEpisodes.map((e) => e.completed_at))
    const ageHours = (Date.now() - oldestTs) / (1000 * 60 * 60)
    return ageHours > 24
  }

  /**
   * Generate extractive summary from episode text.
   * Uses sentence scoring to pick most important sentences.
   */
  export async function summarizeEpisodes(episodeIds: string[]): Promise<{ summary: string; keyFacts: string[] }> {
    // Fetch all episode descriptions
    const episodes: Array<{ task_description?: string } | null> = []
    for (const id of episodeIds) {
      const ep = await EpisodicMemoryRepo.getEpisode(id)
      episodes.push(ep)
    }

    const texts = episodes
      .filter((ep): ep is NonNullable<typeof ep> => ep !== null && ep !== undefined)
      .map((ep) => ep.task_description ?? "")
      .filter((t) => t.length > 0)

    if (texts.length === 0) {
      return { summary: "", keyFacts: [] }
    }

    // Simple extractive summarization: score sentences by term frequency
    const allText = texts.join(" ")
    const sentences = allText.split(/[.!?]+/).filter((s) => s.trim().length > 20)

    if (sentences.length === 0) {
      return { summary: allText.slice(0, 500), keyFacts: extractKeyFacts(texts.slice(0, 10)) }
    }

    const wordFreq = new Map<string, number>()
    const words = allText.toLowerCase().split(/\s+/)
    for (const word of words) {
      if (word.length < 4) continue // skip stopwords approx
      wordFreq.set(word, (wordFreq.get(word) ?? 0) + 1)
    }

    // Score each sentence
    const scored = sentences.map((sentence) => {
      const sentenceWords = sentence.toLowerCase().split(/\s+/)
      const score = sentenceWords.reduce((sum, word) => sum + (wordFreq.get(word) ?? 0), 0)
      return { sentence: sentence.trim(), score }
    })

    // Pick top 5 sentences for summary
    scored.sort((a, b) => b.score - a.score)
    const topSentences = scored.slice(0, 5)

    // Sort back to original order for coherence
    const summary =
      topSentences
        .sort((a, b) => sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence))
        .map((s) => s.sentence)
        .join(". ") + "."

    // Extract key facts as distinct noun-verb-object triplets
    const keyFacts = extractKeyFacts(texts.slice(0, 10))

    return { summary, keyFacts }
  }

  /**
   * Extract key facts from texts.
   */
  function extractKeyFacts(texts: string[]): string[] {
    const facts: string[] = []
    const seen = new Set<string>()

    for (const text of texts) {
      // Simple patterns: "X is/are Y", "X did Y", "X uses Y"
      const patterns = [
        /(\w+(?:\s+\w+)?)\s+(?:is|are|was|were)\s+([^.!?]+)/gi,
        /(\w+(?:\s+\w+)?)\s+(?:did|does|completed?|finished)\s+([^.!?]+)/gi,
        /(\w+(?:\s+\w+)?)\s+(?:uses?|employs?|depends on)\s+([^.!?]+)/gi,
      ]

      for (const pattern of patterns) {
        let match
        while ((match = pattern.exec(text)) !== null) {
          // Extract the verb from the pattern
          const verbMatch = pattern.source.match(/\/(is|are|was|were|did|does|uses?)\//)
          const verb = verbMatch ? verbMatch[1] : "is"
          const fact = `${match[1].trim()} ${verb} ${match[2].trim()}`.slice(0, 100)
          if (!seen.has(fact)) {
            seen.add(fact)
            facts.push(fact)
          }
        }
      }
    }

    return facts.slice(0, 10)
  }

  /**
   * Store summary as episodic milestone.
   */
  export async function storeSummary(sessionId: string, summary: string, keyFacts: string[]): Promise<void> {
    const now = Date.now()

    await MemoryBrokerV2.write({
      layer: "episodic",
      key: `session:${sessionId}:summary:${now}`,
      value: {
        taskDescription: `[SUMMARY] ${summary}`,
        outcome: "summarized",
        startedAt: now,
        completedAt: now,
        artifacts: { keyFacts, type: "progressive_summary" },
      },
    })

    // Promote key facts to semantic layer
    for (const fact of keyFacts) {
      await MemoryBrokerV2.semantic().assert("session_summary", fact, { sessionId, summarizedAt: now }, 0.7)
    }

    log.debug("summary stored", { sessionId, factCount: keyFacts.length })
  }

  /**
   * Get session summary if exists.
   */
  export async function getSessionSummary(sessionId: string): Promise<{ summary: string; keyFacts: string[] } | null> {
    const episodes = await EpisodicMemoryRepo.getRecentEpisodes(TENANT, 100)

    // Find summary episode - they contain "[SUMMARY]" in task_description
    const summaryEp = episodes.find((ep) => ep.task_description?.includes("[SUMMARY]"))

    if (!summaryEp) return null

    const summary = summaryEp.task_description?.replace("[SUMMARY] ", "") ?? ""
    const keyFacts = ((summaryEp.artifacts as Record<string, unknown> | null)?.keyFacts as string[]) ?? []

    return { summary, keyFacts }
  }
}
