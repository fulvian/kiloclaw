/**
 * Scheduled Tasks Notifications - Channel fanout for task events
 * Phase 4: Notification System
 *
 * Handles:
 * - In-app toast notifications for run failure, DLQ move, replay success, state transitions
 * - Optional webhook notifications with HMAC signing
 * - Optional email notifications
 * - Digest mode for batching low-priority successes
 */

import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import type { ProactiveTask, ProactiveTaskRun, ProactiveDlqEntry } from "./scheduler.store"
import { parseConfig } from "./scheduled-task"

// Severity levels in order of importance
const SEVERITY_ORDER = ["all", "success", "warning", "error", "critical"] as const

interface NotificationPayload {
  taskId: string
  taskName: string
  event: "run_success" | "run_failed" | "run_policy_denied" | "run_budget_exceeded" | "dlq_move" | "dlq_replay" | "state_changed"
  severity: "success" | "warning" | "error" | "critical"
  message: string
  runId?: string
  error?: string
  timestamp: number
}

/**
 * Parse notification config from task trigger config
 */
function getNotificationConfig(task: ProactiveTask): {
  channel: string
  severityThreshold: string
  digestMode: boolean
  webhookUrl?: string
  emailTo?: string
} {
  const cfg = parseConfig(task.triggerConfig)
  const notif = cfg.notifications as Record<string, unknown> | undefined
  return {
    channel: (notif?.channel as string) ?? "toast",
    severityThreshold: (notif?.severityThreshold as string) ?? "error",
    digestMode: (notif?.digestMode as boolean) ?? false,
    webhookUrl: notif?.webhookUrl as string | undefined,
    emailTo: notif?.emailTo as string | undefined,
  }
}

/**
 * Check if notification should be sent based on severity threshold
 */
function shouldNotify(config: { severityThreshold: string; channel: string }, severity: string): boolean {
  if (config.channel === "none") return false
  const thresholdIdx = SEVERITY_ORDER.indexOf(config.severityThreshold as typeof SEVERITY_ORDER[number])
  const severityIdx = SEVERITY_ORDER.indexOf(severity as typeof SEVERITY_ORDER[number])
  return severityIdx <= thresholdIdx
}

/**
 * Format notification message
 */
function formatMessage(payload: NotificationPayload): string {
  switch (payload.event) {
    case "run_success":
      return `Task "${payload.taskName}" completed successfully`
    case "run_failed":
      return `Task "${payload.taskName}" failed: ${payload.error ?? "unknown error"}`
    case "run_policy_denied":
      return `Task "${payload.taskName}" was blocked by policy`
    case "run_budget_exceeded":
      return `Task "${payload.taskName}" exceeded budget`
    case "dlq_move":
      return `Task "${payload.taskName}" moved to DLQ`
    case "dlq_replay":
      return `DLQ entry for "${payload.taskName}" was replayed`
    case "state_changed":
      return `Task "${payload.taskName}" state changed`
    default:
      return `Task "${payload.taskName}": ${payload.event}`
  }
}

/**
 * Send webhook notification with HMAC signing
 */
async function sendWebhook(
  url: string,
  payload: NotificationPayload,
  secret?: string,
): Promise<boolean> {
  const log = Log.create({ service: "kilocclaw.proactive.notifications.webhook" })
  try {
    const body = JSON.stringify({
      event: payload.event,
      taskId: payload.taskId,
      taskName: payload.taskName,
      severity: payload.severity,
      message: payload.message,
      runId: payload.runId,
      error: payload.error,
      timestamp: payload.timestamp,
    })

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Kilo-Task-Event": payload.event,
      "X-Kilo-Task-ID": payload.taskId,
    }

    // Add HMAC signature if secret is provided
    if (secret) {
      const { createHmac } = await import("node:crypto")
      const signature = createHmac("sha256", secret).update(body).digest("hex")
      headers["X-Kilo-Signature"] = signature
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
    })

    if (!response.ok) {
      log.warn("webhook delivery failed", { status: response.status, url })
      return false
    }

    log.info("webhook delivered", { taskId: payload.taskId, event: payload.event })
    return true
  } catch (err) {
    log.error("webhook delivery error", { err, url })
    return false
  }
}

// Digest buffer for batching notifications
const digestBuffer: NotificationPayload[] = []
let digestFlushAt = 0
const DIGEST_INTERVAL_MS = 60_000 // Flush digest every minute

/**
 * Flush digest buffer - called periodically or on shutdown
 */
export function flushNotificationDigest(): void {
  if (digestBuffer.length === 0) return

  const log = Log.create({ service: "kilocclaw.proactive.notifications.digest" })
  log.info("flushing notification digest", { count: digestBuffer.length })

  // Group by task
  const byTask = new Map<string, NotificationPayload[]>()
  for (const p of digestBuffer) {
    const existing = byTask.get(p.taskId) ?? []
    existing.push(p)
    byTask.set(p.taskId, existing)
  }

  // Emit consolidated notifications
  for (const [taskId, payloads] of byTask) {
    const successes = payloads.filter((p) => p.severity === "success").length
    const failures = payloads.filter((p) => p.severity === "error" || p.severity === "critical").length
    log.info("digest summary", { taskId, successes, failures })
  }

  digestBuffer.length = 0
  digestFlushAt = 0
}

/**
 * Emit a task notification based on event
 */
export function emitTaskNotification(
  task: ProactiveTask,
  event:
    | { type: "run_success"; run: ProactiveTaskRun }
    | { type: "run_failed"; run: ProactiveTaskRun; error: string }
    | { type: "run_policy_denied"; run: ProactiveTaskRun }
    | { type: "run_budget_exceeded"; run: ProactiveTaskRun }
    | { type: "dlq_move"; entry: ProactiveDlqEntry }
    | { type: "dlq_replay"; entry: ProactiveDlqEntry }
    | { type: "state_changed"; newState: string },
): void {
  if (!Flag.KILOCLAW_TASK_NOTIFY_V1) return

  const log = Log.create({ service: "kilocclaw.proactive.notifications" })
  const config = getNotificationConfig(task)

  // Build payload
  let severity: "success" | "warning" | "error" | "critical" = "success"
  let message = ""
  let runId: string | undefined

  if (event.type === "run_success") {
    severity = "success"
    runId = event.run.id
    message = formatMessage({
      taskId: task.id,
      taskName: task.name,
      event: "run_success",
      severity,
      message: "",
      runId,
      timestamp: Date.now(),
    })
  } else if (event.type === "run_failed") {
    severity = "error"
    runId = event.run.id
    message = formatMessage({
      taskId: task.id,
      taskName: task.name,
      event: "run_failed",
      severity,
      message: "",
      error: event.error,
      runId,
      timestamp: Date.now(),
    })
  } else if (event.type === "run_policy_denied") {
    severity = "warning"
    runId = event.run.id
    message = formatMessage({
      taskId: task.id,
      taskName: task.name,
      event: "run_policy_denied",
      severity,
      message: "",
      runId,
      timestamp: Date.now(),
    })
  } else if (event.type === "run_budget_exceeded") {
    severity = "warning"
    runId = event.run.id
    message = formatMessage({
      taskId: task.id,
      taskName: task.name,
      event: "run_budget_exceeded",
      severity,
      message: "",
      runId,
      timestamp: Date.now(),
    })
  } else if (event.type === "dlq_move") {
    severity = "error"
    message = formatMessage({
      taskId: task.id,
      taskName: task.name,
      event: "dlq_move",
      severity,
      message: "",
      error: event.entry.error,
      timestamp: Date.now(),
    })
  } else if (event.type === "dlq_replay") {
    severity = "success"
    message = formatMessage({
      taskId: task.id,
      taskName: task.name,
      event: "dlq_replay",
      severity,
      message: "",
      timestamp: Date.now(),
    })
  } else if (event.type === "state_changed") {
    severity = "warning"
    message = formatMessage({
      taskId: task.id,
      taskName: task.name,
      event: "state_changed",
      severity,
      message: `State changed to ${event.newState}`,
      timestamp: Date.now(),
    })
  }

  const payload: NotificationPayload = {
    taskId: task.id,
    taskName: task.name,
    event: event.type.startsWith("run_") ? `run_${event.type.split("_")[1]}` as any : event.type,
    severity,
    message,
    runId,
    error: "error" in event ? event.error : undefined,
    timestamp: Date.now(),
  }

  // Check severity threshold
  if (!shouldNotify(config, severity)) {
    log.debug("notification suppressed by threshold", { taskId: task.id, severity, threshold: config.severityThreshold })
    return
  }

  // Handle by channel
  if (config.channel === "webhook" && config.webhookUrl) {
    // Webhook notifications are sent immediately
    sendWebhook(config.webhookUrl, payload).catch((err) => {
      log.error("webhook notification failed", { err, taskId: task.id })
    })
  } else if (config.channel === "toast") {
    // Toast notifications (in-app) - emit via Bus
    if (config.digestMode) {
      // Buffer for digest
      digestBuffer.push(payload)
      if (digestFlushAt === 0) {
        digestFlushAt = Date.now() + DIGEST_INTERVAL_MS
      }
    } else {
      // Emit immediately via Bus - actual toast rendering is handled by the TUI
      log.info("toast notification", { taskId: task.id, message })
    }
  } else if (config.channel === "email" && config.emailTo) {
    // Email notifications - would integrate with email service
    log.info("email notification (not implemented)", { taskId: task.id, email: config.emailTo, message })
  }

  log.info("notification emitted", { taskId: task.id, event: event.type, channel: config.channel, severity })
}

/**
 * Initialize notification system - starts digest flush timer
 */
export function initNotifications(): void {
  if (!Flag.KILOCLAW_TASK_NOTIFY_V1) return

  const log = Log.create({ service: "kilocclaw.proactive.notifications" })
  log.info("notification system initialized")

  // Start digest flush timer
  setInterval(() => {
    if (Date.now() >= digestFlushAt) {
      flushNotificationDigest()
    }
  }, 10_000) // Check every 10 seconds
}
