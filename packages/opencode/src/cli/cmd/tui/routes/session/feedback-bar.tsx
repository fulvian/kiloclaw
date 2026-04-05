/**
 * FeedbackBar - Inline feedback UI for CLI
 *
 * Behavior:
 * - Pollice inline visible until user gives feedback OR sends follow-up
 * - Click registers feedback immediately (no confirmation needed)
 * - No timeout - stays visible until interaction
 * - Session feedback asked ONLY on exit commands (Ctrl+D, /exit, /new, /sessions)
 */

import { createSignal, createEffect, onCleanup, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { FeedbackProcessor } from "@/kiloclaw/feedback/processor"
import { FeedbackReasonCode } from "@/kiloclaw/feedback/contract"
import { MemoryDb } from "@/kiloclaw/memory/memory.db"
import { Log } from "@/util/log"

const log = Log.create({ service: "kiloclaw.feedback.ui" })

// kilocode_change - reason codes for categorical feedback
const NEGATIVE_REASONS = [
  { code: "wrong_fact", label: "Info sbagliata", icon: "❌" },
  { code: "irrelevant", label: "Non pertinente", icon: "↩️" },
  { code: "too_verbose", label: "Troppo lungo", icon: "📏" },
  { code: "task_partial", label: "Incompleto", icon: "⬜" },
  { code: "style_mismatch", label: "Stile non adatto", icon: "✏️" },
  { code: "task_failed", label: "Task fallito", icon: "❗" },
  { code: "expectation_mismatch", label: "Non come previsto", icon: "❓" },
] as const

// kilocode_change - session feedback reasons
const SESSION_NEGATIVE_REASONS = [
  { code: "wrong_fact", label: "Info sbagliata", icon: "❌" },
  { code: "irrelevant", label: "Non pertinente", icon: "↩️" },
  { code: "too_verbose", label: "Troppo lungo", icon: "📏" },
  { code: "style_mismatch", label: "Stile non adatto", icon: "✏️" },
  { code: "task_failed", label: "Task fallito", icon: "❗" },
  { code: "confusing", label: "Confusionante", icon: "🔀" },
  { code: "other", label: "Altro", icon: "📝" },
] as const

// kilocode_change - singleton MemoryDb init
let memoryInitPromise: Promise<boolean> | null = null

async function ensureMemoryInitialized(): Promise<boolean> {
  if (MemoryDb.isEnabled()) {
    try {
      MemoryDb.getDb()
      return true
    } catch {}
  }

  if (memoryInitPromise) return memoryInitPromise

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

// kilocode_change - track last feedbackable message
let lastFeedbackableMessageId: string | null = null
let pendingFeedbackMessageId: string | null = null

export function getLastFeedbackableMessageId() {
  return lastFeedbackableMessageId
}

export function setPendingFeedback(messageId: string) {
  pendingFeedbackMessageId = messageId
}

export function clearPendingFeedback() {
  pendingFeedbackMessageId = null
}

// kilocode_change - session feedback state
let sessionFeedbackPending = false
let pendingSessionId: string | null = null

export function requestSessionFeedback(sessionId: string) {
  sessionFeedbackPending = true
  pendingSessionId = sessionId
  log.info("session feedback requested", { sessionId })
}

export function clearSessionFeedback() {
  sessionFeedbackPending = false
  pendingSessionId = null
}

export function hasPendingSessionFeedback() {
  return sessionFeedbackPending && pendingSessionId !== null
}

export function getPendingSessionId(): string | null {
  return pendingSessionId
}

// kilocode_change - submit feedback for a response
async function submitResponseFeedback(
  messageId: string,
  sessionId: string,
  vote: "up" | "down",
  reason?: FeedbackReasonCode,
): Promise<boolean> {
  const memOk = await ensureMemoryInitialized()
  if (!memOk) {
    log.error("MemoryDb not available")
    return false
  }

  const tenantId = "local"
  const userId = "anonymous"
  const feedbackId = crypto.randomUUID()

  log.info("submitting feedback", { feedbackId, vote, reason, messageId })

  const result = await FeedbackProcessor.process({
    feedback: {
      id: feedbackId,
      tenantId,
      userId,
      sessionId,
      target: {
        type: "response",
        id: messageId,
      },
      vote,
      reason,
      ts: Date.now(),
    },
  })

  if (result.success) {
    log.info("feedback recorded successfully", { feedbackId })
    return true
  } else {
    log.error("feedback processing failed", { errors: result.errors })
    return false
  }
}

// kilocode_change - submit feedback for a session
export async function submitSessionFeedback(
  sessionId: string,
  vote: "up" | "down",
  reason?: FeedbackReasonCode,
): Promise<boolean> {
  const memOk = await ensureMemoryInitialized()
  if (!memOk) {
    log.error("MemoryDb not available")
    return false
  }

  const tenantId = "local"
  const userId = "anonymous"
  const feedbackId = crypto.randomUUID()

  log.info("submitting session feedback", { feedbackId, vote, reason, sessionId })

  const result = await FeedbackProcessor.process({
    feedback: {
      id: feedbackId,
      tenantId,
      userId,
      sessionId,
      target: {
        type: "session",
        id: sessionId,
      },
      vote,
      reason,
      ts: Date.now(),
    },
  })

  if (result.success) {
    log.info("session feedback recorded successfully", { feedbackId })
    return true
  } else {
    log.error("session feedback processing failed", { errors: result.errors })
    return false
  }
}

// =============================================================================
// Response Feedback Bar Component
// =============================================================================

interface FeedbackBarProps {
  messageId: string
  sessionId: string
}

export function FeedbackBar(props: FeedbackBarProps) {
  const { theme } = useTheme()

  // UI State
  const [showNegativeReasons, setShowNegativeReasons] = createSignal(false)
  const [submitted, setSubmitted] = createSignal(false)
  const [reason, setReason] = createSignal<FeedbackReasonCode | null>(null)

  // Track this message as feedbackable
  lastFeedbackableMessageId = props.messageId

  // Hide pollice if another message is now pending feedback
  createEffect(() => {
    if (pendingFeedbackMessageId && pendingFeedbackMessageId !== props.messageId) {
      setSubmitted(true)
    }
  })

  const handleThumbsUp = async (e: any) => {
    e.stopPropagation?.()
    e.preventDefault?.()

    if (submitted()) return
    setSubmitted(true)

    await submitResponseFeedback(props.messageId, props.sessionId, "up")
  }

  const handleThumbsDown = (e: any) => {
    e.stopPropagation?.()
    e.preventDefault?.()
    setShowNegativeReasons(true)
  }

  const handleSelectReason = async (r: FeedbackReasonCode) => {
    if (submitted()) return
    setSubmitted(true)

    await submitResponseFeedback(props.messageId, props.sessionId, "down", r)
  }

  const handleSkip = () => {
    setShowNegativeReasons(false)
  }

  return (
    <Show when={!submitted()}>
      <box marginTop={1} paddingLeft={3} flexDirection="column" gap={1}>
        <Show when={!showNegativeReasons()}>
          <box flexDirection="row" gap={2} alignItems="center">
            <text fg={theme.textMuted}>Utile?</text>

            <box onMouseUp={handleThumbsUp} paddingX={2} paddingY={1} backgroundColor={theme.backgroundElement}>
              <text fg={theme.success}>👍</text>
            </box>

            <box onMouseUp={handleThumbsDown} paddingX={2} paddingY={1} backgroundColor={theme.backgroundElement}>
              <text fg={theme.error}>👎</text>
            </box>
          </box>
        </Show>

        <Show when={showNegativeReasons()}>
          <box flexDirection="column" gap={1}>
            <text fg={theme.textMuted}>Perché?</text>

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
                  <text fg={theme.error}>{r.icon}</text>
                </box>
              ))}
            </box>

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
      </box>
    </Show>
  )
}

// =============================================================================
// Session Feedback Dialog Component
// =============================================================================

interface SessionFeedbackDialogProps {
  sessionId: string
  onSubmit: (vote: "up" | "down", reason?: FeedbackReasonCode) => void
  onSkip: () => void
}

export function SessionFeedbackDialog(props: SessionFeedbackDialogProps) {
  const { theme } = useTheme()

  const [showReasons, setShowReasons] = createSignal(false)
  const [selectedReason, setSelectedReason] = createSignal<FeedbackReasonCode | null>(null)

  const handleUp = async (e: any) => {
    e.stopPropagation?.()
    e.preventDefault?.()
    await props.onSubmit("up")
  }

  const handleDown = (e: any) => {
    e.stopPropagation?.()
    e.preventDefault?.()
    setShowReasons(true)
  }

  const handleSelectReason = async (r: FeedbackReasonCode) => {
    setSelectedReason(r)
    await props.onSubmit("down", r)
  }

  const handleSkip = () => {
    props.onSkip()
  }

  return (
    <box
      position="absolute"
      top={5}
      left={3}
      padding={2}
      backgroundColor={theme.backgroundPanel}
      borderStyle="rounded"
      borderColor={theme.primary}
      flexDirection="column"
      gap={1}
    >
      <text fg={theme.text}>Feedback sulla sessione</text>
      <text fg={theme.textMuted}>Com'è andata la sessione?</text>

      <Show when={!showReasons()}>
        <box flexDirection="row" gap={2} marginTop={1}>
          <box onMouseUp={handleUp} paddingX={2} paddingY={1} backgroundColor={theme.backgroundElement}>
            <text fg={theme.success}>👍</text>
          </box>
          <box onMouseUp={handleDown} paddingX={2} paddingY={1} backgroundColor={theme.backgroundElement}>
            <text fg={theme.error}>👎</text>
          </box>
        </box>
      </Show>

      <Show when={showReasons()}>
        <box flexDirection="row" gap={1} marginTop={1}>
          {SESSION_NEGATIVE_REASONS.map((r) => (
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
              <text fg={theme.error}>{r.icon}</text>
            </box>
          ))}
        </box>
      </Show>

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
          <text fg={theme.textMuted}>Salta</text>
        </box>
      </box>
    </box>
  )
}
