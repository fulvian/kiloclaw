import { Log } from "@/util/log"
import type { MemoryEvent, EventId, Episode, EpisodeId, EventType, Outcome, TimelineFilter } from "./types.js"
import { MemoryEventSchema, EventIdFactory, EpisodeSchema, EpisodeIdFactory, TimelineFilterSchema } from "./types.js"
import type { EpisodicMemory as IEpisodicMemory } from "./types.js"

const log = Log.create({ service: "kiloclaw.memory.episodic" })

// Module-level state
const episodes = new Map<EpisodeId, Episode>()
const events = new Map<EventId, MemoryEvent>()
const episodeEvents = new Map<EpisodeId, EventId[]>()
const eventsByType = new Map<EventType, EventId[]>()
const eventsByAgency = new Map<string, EventId[]>()
const eventsByAgent = new Map<string, EventId[]>()

export namespace EpisodicMemory {
  /**
   * Record a memory event
   */
  export async function record(event: MemoryEvent): Promise<EventId> {
    // Validate event
    const validated = MemoryEventSchema.parse(event)

    // Store event
    events.set(validated.id, validated)

    // Index by type
    const typeEvents = eventsByType.get(validated.type) || []
    typeEvents.push(validated.id)
    eventsByType.set(validated.type, typeEvents)

    // Index by agency
    if (validated.agencyId) {
      const agencyEvents = eventsByAgency.get(validated.agencyId) || []
      agencyEvents.push(validated.id)
      eventsByAgency.set(validated.agencyId, agencyEvents)
    }

    // Index by agent
    if (validated.agentId) {
      const agentEvents = eventsByAgent.get(validated.agentId) || []
      agentEvents.push(validated.id)
      eventsByAgent.set(validated.agentId, agentEvents)
    }

    log.debug("event recorded", { eventId: validated.id, type: validated.type })
    return validated.id
  }

  /**
   * Record a completed task as an episode
   */
  export async function recordTask(
    taskId: string,
    taskDescription: string,
    outcome: Outcome,
    startedAt: Date,
    correlationId: string,
    agencyId: string,
    agentId?: string,
    artifacts?: Record<string, unknown>,
  ): Promise<EpisodeId> {
    const id = EpisodeIdFactory.create()
    const now = new Date()

    const episode: Episode = EpisodeSchema.parse({
      id,
      taskId,
      taskDescription,
      outcome,
      startedAt: startedAt.toISOString(),
      completedAt: now.toISOString(),
      correlationId,
      agencyId,
      agentId,
      events: [],
      artifacts,
    })

    episodes.set(id, episode)
    log.debug("episode recorded", { episodeId: id, outcome })

    return id
  }

  /**
   * Get an episode by ID
   */
  export async function getEpisode(episodeId: EpisodeId): Promise<Episode | null> {
    return episodes.get(episodeId) || null
  }

  /**
   * Get recent episodes
   */
  export async function getRecentEpisodes(count: number, since?: Date): Promise<Episode[]> {
    const allEpisodes = Array.from(episodes.values())

    // Filter by date if provided
    const filtered = since ? allEpisodes.filter((ep) => new Date(ep.startedAt) >= since) : allEpisodes

    // Sort by completedAt descending
    filtered.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())

    return filtered.slice(0, count)
  }

  /**
   * Get events by type
   */
  export async function getEventsByType(type: EventType, since?: Date): Promise<MemoryEvent[]> {
    const eventIds = eventsByType.get(type) || []

    const result: MemoryEvent[] = []
    for (const id of eventIds) {
      const event = events.get(id)
      if (event) {
        if (since && new Date(event.timestamp) < since) continue
        result.push(event)
      }
    }

    // Sort by timestamp descending
    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return result
  }

  /**
   * Get timeline of episodes
   */
  export async function getTimeline(filter?: TimelineFilter): Promise<Episode[]> {
    let allEpisodes = Array.from(episodes.values())

    // Apply filters
    if (filter) {
      const validated = TimelineFilterSchema.parse(filter)

      if (validated.since) {
        allEpisodes = allEpisodes.filter((ep) => new Date(ep.startedAt) >= new Date(validated.since!))
      }
      if (validated.until) {
        allEpisodes = allEpisodes.filter((ep) => new Date(ep.completedAt) <= new Date(validated.until!))
      }
      if (validated.agencyId) {
        allEpisodes = allEpisodes.filter((ep) => ep.agencyId === validated.agencyId)
      }
      if (validated.agentId) {
        allEpisodes = allEpisodes.filter((ep) => ep.agentId === validated.agentId)
      }
      if (validated.outcome) {
        allEpisodes = allEpisodes.filter((ep) => ep.outcome === validated.outcome)
      }
    }

    // Sort by completedAt descending
    allEpisodes.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())

    // Apply limit
    const limit = filter?.limit || 50
    return allEpisodes.slice(0, limit)
  }

  /**
   * Get statistics
   */
  export async function getStats(): Promise<{
    totalEpisodes: number
    totalEvents: number
    byOutcome: Record<Outcome, number>
    byAgency: Record<string, number>
  }> {
    const byOutcome: Record<Outcome, number> = {
      success: 0,
      failure: 0,
      partial: 0,
      cancelled: 0,
    }

    const byAgency: Record<string, number> = {}

    for (const episode of episodes.values()) {
      byOutcome[episode.outcome]++
      byAgency[episode.agencyId] = (byAgency[episode.agencyId] || 0) + 1
    }

    return {
      totalEpisodes: episodes.size,
      totalEvents: events.size,
      byOutcome,
      byAgency,
    }
  }

  /**
   * Link an event to an episode
   */
  export function linkEventToEpisode(episodeId: EpisodeId, eventId: EventId): void {
    const episodeEventList = episodeEvents.get(episodeId) || []
    episodeEventList.push(eventId)
    episodeEvents.set(episodeId, episodeEventList)
  }

  /**
   * Get events for an episode
   */
  export function getEpisodeEvents(episodeId: EpisodeId): MemoryEvent[] {
    const eventIds = episodeEvents.get(episodeId) || []

    const result: MemoryEvent[] = []
    for (const id of eventIds) {
      const event = events.get(id)
      if (event) result.push(event)
    }

    return result
  }

  /**
   * Clear all episodic memory (for testing)
   */
  export function clear(): void {
    episodes.clear()
    events.clear()
    episodeEvents.clear()
    eventsByType.clear()
    eventsByAgency.clear()
    eventsByAgent.clear()
    log.debug("episodic memory cleared")
  }
}

// Export as interface implementation
export const episodicMemory: IEpisodicMemory = {
  record: EpisodicMemory.record,
  recordTask: EpisodicMemory.recordTask,
  getEpisode: EpisodicMemory.getEpisode,
  getRecentEpisodes: EpisodicMemory.getRecentEpisodes,
  getEventsByType: EpisodicMemory.getEventsByType,
  getTimeline: EpisodicMemory.getTimeline,
  getStats: EpisodicMemory.getStats,
  clear: EpisodicMemory.clear,
}
