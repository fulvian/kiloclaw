/**
 * FeedbackBar - Inline feedback UI for CLI
 * Shows thumbs up/down after assistant response
 */

import { createSignal, Show } from "solid-js"
import { useTheme } from "../../context/theme"
import { useSync } from "../../context/sync"
import { FeedbackProcessor } from "@/kiloclaw/feedback/processor"
import { FeedbackReasonCode } from "@/kiloclaw/feedback/contract"

// kilocode_change - track last message that can receive feedback for keyboard shortcuts
let lastFeedbackMessageId: string | null = null
export function getLastFeedbackMessageId() {
  return lastFeedbackMessageId
}
export function clearLastFeedbackMessageId() {
  lastFeedbackMessageId = null
}
// kilocode_change end

interface FeedbackBarProps {
  messageId: string
  sessionId: string
  onFeedbackSent?: () => void
}

export function FeedbackBar(props: FeedbackBarProps) {
  const { theme } = useTheme()
  const sync = useSync()
  const [showReason, setShowReason] = createSignal(false)
  const [reason, setReason] = createSignal("")
  const [submitted, setSubmitted] = createSignal(false)
  const [loading, setLoading] = createSignal(false)

  // kilocode_change start - track this feedback bar for keyboard shortcuts
  lastFeedbackMessageId = props.messageId
  // kilocode_change end

  const submitFeedback = async (vote: "up" | "down", reasonText?: string) => {
    if (loading()) return
    setLoading(true)

    try {
      const tenantId = "local"
      const userId = (sync.data as any).user?.id ?? "anonymous"
      const feedbackId = crypto.randomUUID()

      console.log("[FeedbackBar] Submitting feedback:", {
        feedbackId,
        vote,
        reasonText,
        messageId: props.messageId,
        sessionId: props.sessionId,
      })

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
          reason: reasonText ? mapToReasonCode(reasonText) : undefined,
          correction: reasonText,
          ts: Date.now(),
        },
      })

      console.log("[FeedbackBar] Process result:", JSON.stringify(result))

      if (result.success) {
        setSubmitted(true)
        props.onFeedbackSent?.()
      } else {
        console.error("[FeedbackBar] Feedback processing failed:", result.errors)
      }
    } catch (err) {
      console.error("Feedback submission failed:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleThumbsUp = () => {
    submitFeedback("up")
  }

  const handleThumbsDown = () => {
    setShowReason(true)
  }

  const handleSubmitReason = () => {
    submitFeedback("down", reason())
  }

  const handleSkip = () => {
    setShowReason(false)
    setReason("")
  }

  // Map free-text reason to structured reason code
  function mapToReasonCode(text: string): FeedbackReasonCode {
    const lower = text.toLowerCase()
    if (lower.includes("sbagliato") || lower.includes("errore") || lower.includes("wrong")) {
      return "wrong_fact"
    }
    if (lower.includes("irrilevante") || lower.includes("not related") || lower.includes("off topic")) {
      return "irrelevant"
    }
    if (lower.includes("lungo") || lower.includes("troppo") || lower.includes("verbose")) {
      return "too_verbose"
    }
    if (lower.includes("stile") || lower.includes("style") || lower.includes("tono")) {
      return "style_mismatch"
    }
    if (lower.includes("unsafe") || lower.includes("pericoloso")) {
      return "unsafe"
    }
    if (lower.includes("incompleto") || lower.includes("partial")) {
      return "task_partial"
    }
    if (lower.includes("fallito") || lower.includes("failed") || lower.includes("not done")) {
      return "task_failed"
    }
    return "other"
  }

  return (
    <Show when={!submitted()}>
      <box marginTop={1} paddingLeft={3} flexDirection="column" gap={1}>
        <Show when={!showReason()}>
          {/* Initial feedback prompt */}
          <box flexDirection="row" gap={2} alignItems="center">
            <text fg={theme.textMuted}>Questa risposta è stata utile?</text>
            <box onMouseUp={handleThumbsUp} paddingX={2} paddingY={1} backgroundColor={theme.backgroundElement}>
              <text fg={theme.success}>👍</text>
            </box>
            <box onMouseUp={handleThumbsDown} paddingX={2} paddingY={1} backgroundColor={theme.backgroundElement}>
              <text fg={theme.error}>👎</text>
            </box>
          </box>
        </Show>

        <Show when={showReason()}>
          {/* Reason input for negative feedback */}
          <box flexDirection="column" gap={1}>
            <text fg={theme.textMuted}>Perché non è stata utile? (opzionale)</text>
            <input
              value={reason()}
              onInput={(val) => setReason(val)}
              placeholder="Es: era sbagliato, troppo lungo, non pertinente..."
              width={50}
              focusedBackgroundColor={theme.backgroundPanel}
              cursorColor={theme.primary}
              focusedTextColor={theme.text}
              paddingX={1}
              paddingY={1}
            />
            <box flexDirection="row" gap={1} marginTop={1}>
              <box onMouseUp={handleSubmitReason} paddingX={2} paddingY={1} backgroundColor={theme.primary}>
                <text fg={theme.text}>Invia</text>
              </box>
              <box onMouseUp={handleSkip} paddingX={2} paddingY={1} backgroundColor={theme.backgroundElement}>
                <text fg={theme.textMuted}>Salta</text>
              </box>
            </box>
          </box>
        </Show>
      </box>
    </Show>
  )
}

/**
 * Simple inline feedback - just thumbs up/down
 * Use this for a more minimal version
 */
export function InlineFeedback(props: { onUp: () => void; onDown: () => void; disabled?: boolean }) {
  const { theme } = useTheme()

  return (
    <box flexDirection="row" gap={2} alignItems="center">
      <box onMouseUp={props.onUp} paddingX={2} paddingY={1} backgroundColor={theme.backgroundElement}>
        <text fg={theme.success}>👍</text>
      </box>
      <box onMouseUp={props.onDown} paddingX={2} paddingY={1} backgroundColor={theme.backgroundElement}>
        <text fg={theme.error}>👎</text>
      </box>
    </box>
  )
}
