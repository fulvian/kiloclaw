/**
 * FeedbackBar - Inline feedback UI for CLI
 *
 * Features:
 * - Thumbs up/down for quick feedback
 * - Categorical negative feedback (no free text)
 * - Feedback confirmation UI
 * - Session-level feedback option
 * - Proper event handling to prevent bubbling
 */

import { createSignal, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { FeedbackProcessor } from "@/kiloclaw/feedback/processor"
import { FeedbackReasonCode } from "@/kiloclaw/feedback/contract"
import { MemoryDb } from "@/kiloclaw/memory/memory.db"
import { Log } from "@/util/log"

const log = Log.create({ service: "kiloclaw.feedback.ui" })

// kilocode_change - feedback tracking for keyboard shortcuts
let lastFeedbackMessageId: string | null = null
export function getLastFeedbackMessageId() {
  return lastFeedbackMessageId
}
export function clearLastFeedbackMessageId() {
  lastFeedbackMessageId = null
}

// kilocode_change - singleton MemoryDb init flag
let memoryInitPromise: Promise<boolean> | null = null

async function ensureMemoryInitialized(): Promise<boolean> {
  // If already initialized, return immediately
  if (MemoryDb.isEnabled()) {
    try {
      MemoryDb.getDb() // Will throw if not initialized
      return true
    } catch {
      // Not initialized, continue
    }
  }

  // If init is in progress, wait for it
  if (memoryInitPromise) {
    return memoryInitPromise
  }

  memoryInitPromise = (async () => {
    try {
      const dbPath = `${process.cwd()}/.kilocode/memory.db`
      log.info("initializing MemoryDb for feedback", { dbPath })
      await MemoryDb.init(dbPath)
      log.info("MemoryDb initialized successfully")
      return true
    } catch (err) {
      log.error("MemoryDb init failed", { err })
      return false
    } finally {
      memoryInitPromise = null
    }
  })()

  return memoryInitPromise
}

// kilocode_change - reason codes for categorical feedback
const NEGATIVE_REASONS = [
  { code: "wrong_fact", label: "Informazione sbagliata", icon: "❌" },
  { code: "irrelevant", label: "Non pertinente", icon: "↩️" },
  { code: "too_verbose", label: "Troppo lungo", icon: "📏" },
  { code: "incomplete", label: "Incompleto", icon: "⬜" },
  { code: "style_mismatch", label: "Stile non adatto", icon: "✏️" },
  { code: "task_failed", label: "Task non completato", icon: "❗" },
] as const

interface FeedbackBarProps {
  messageId: string
  sessionId: string
  onFeedbackSent?: () => void
}

export function FeedbackBar(props: FeedbackBarProps) {
  const { theme } = useTheme()
  const sync = useSync()

  // UI State
  const [showNegativeReasons, setShowNegativeReasons] = createSignal(false)
  const [submitted, setSubmitted] = createSignal(false)
  const [loading, setLoading] = createSignal(false)
  const [confirmed, setConfirmed] = createSignal(false)
  const [lastVote, setLastVote] = createSignal<"up" | "down" | null>(null)

  // Track this feedback bar
  lastFeedbackMessageId = props.messageId

  const submitFeedback = async (vote: "up" | "down", reason?: FeedbackReasonCode) => {
    if (loading()) return
    setLoading(true)

    try {
      const memOk = await ensureMemoryInitialized()
      if (!memOk) {
        log.error("MemoryDb not available, cannot submit feedback")
        return
      }

      const tenantId = "local"
      const userId = (sync.data as any).user?.id ?? "anonymous"
      const feedbackId = crypto.randomUUID()

      log.info("submitting feedback", { feedbackId, vote, reason, messageId: props.messageId })

      const result = await FeedbackProcessor.process({
        feedback: {
          id: feedbackId,
          tenantId,
          userId,
          sessionId: props.sessionId,
          target: {
            type: "response",
            id: props.messageId,
          },
          vote,
          reason,
          ts: Date.now(),
        },
      })

      if (result.success) {
        log.info("feedback recorded successfully", { feedbackId })
        setLastVote(vote)
        setSubmitted(true)

        // Show confirmation
        setConfirmed(true)
        props.onFeedbackSent?.()

        // Auto-hide confirmation after 3 seconds
        setTimeout(() => {
          setConfirmed(false)
        }, 3000)
      } else {
        log.error("feedback processing failed", { errors: result.errors })
      }
    } catch (err) {
      log.error("feedback submission failed", { err })
    } finally {
      setLoading(false)
    }
  }

  const handleThumbsUp = (e: any) => {
    e.stopPropagation?.()
    e.preventDefault?.()
    submitFeedback("up")
  }

  const handleThumbsDown = (e: any) => {
    e.stopPropagation?.()
    e.preventDefault?.()
    setShowNegativeReasons(true)
  }

  const handleSelectReason = (reason: FeedbackReasonCode) => {
    submitFeedback("down", reason)
  }

  const handleSkip = () => {
    setShowNegativeReasons(false)
  }

  const handleSessionFeedback = () => {
    // For session-level feedback, use the sessionId as target
    // This is a simplified version - could be enhanced
    submitFeedback("down", "other")
  }

  return (
    <box marginTop={1} paddingLeft={3} flexDirection="column" gap={1}>
      {/* Confirmation message */}
      <Show when={confirmed() && lastVote()}>
        <box flexDirection="row" gap={1} alignItems="center">
          <text fg={theme.success}>✓ Feedback registrato</text>
          <text fg={theme.textMuted}> - Grazie!</text>
        </box>
      </Show>

      {/* Main feedback UI */}
      <Show when={!submitted() || confirmed()}>
        <box flexDirection="row" gap={2} alignItems="center">
          <text fg={theme.textMuted}>Questa risposta è stata utile?</text>

          {/* Thumbs up */}
          <box onMouseUp={handleThumbsUp} paddingX={2} paddingY={1} backgroundColor={theme.backgroundElement}>
            <text fg={theme.success}>👍 Sì</text>
          </box>

          {/* Thumbs down */}
          <Show when={!showNegativeReasons()}>
            <box onMouseUp={handleThumbsDown} paddingX={2} paddingY={1} backgroundColor={theme.backgroundElement}>
              <text fg={theme.error}>👎 No</text>
            </box>
          </Show>
        </box>
      </Show>

      {/* Negative feedback - categorical reasons */}
      <Show when={showNegativeReasons() && !submitted()}>
        <box flexDirection="column" gap={1} marginTop={1}>
          <text fg={theme.textMuted}>Perché non è stata utile?</text>

          {/* Reason buttons in a row */}
          <box flexDirection="row" gap={1}>
            {NEGATIVE_REASONS.map((r) => (
              <box
                onMouseUp={(e: any) => {
                  e.stopPropagation?.()
                  e.preventDefault?.()
                  handleSelectReason(r.code as FeedbackReasonCode)
                }}
                paddingX={2}
                paddingY={1}
                backgroundColor={theme.backgroundElement}
              >
                <text fg={theme.error}>
                  {r.icon} {r.label}
                </text>
              </box>
            ))}
          </box>

          {/* Skip button */}
          <box marginTop={1}>
            <box
              onMouseUp={(e: any) => {
                e.stopPropagation?.()
                e.preventDefault?.()
                handleSkip()
              }}
              paddingX={2}
              paddingY={1}
              backgroundColor={theme.backgroundPanel}
            >
              <text fg={theme.textMuted}>Annulla</text>
            </box>
          </box>
        </box>
      </Show>

      {/* Session feedback option - shown after submission */}
      <Show when={submitted() && !confirmed()}>
        <text fg={theme.textMuted} marginTop={1}>
          Vuoi lasciare un feedback sulla sessione?
        </text>
        <box flexDirection="row" gap={1}>
          <box
            onMouseUp={(e: any) => {
              e.stopPropagation?.()
              e.preventDefault?.()
              handleSessionFeedback()
            }}
            paddingX={2}
            paddingY={1}
            backgroundColor={theme.primary}
          >
            <text fg={theme.text}>Sessione</text>
          </box>
        </box>
      </Show>
    </box>
  )
}
