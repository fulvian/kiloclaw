/**
 * sd_notify integration for systemd service watchdog and status updates
 */

import { Log } from "@/util/log"
import { accessSync, existsSync, openSync, writeSync, closeSync } from "node:fs"
import { env } from "node:process"

const log = Log.create({ service: "kilocclaw.daemon.notify" })

// Socket path for systemd notification (set by systemd)
const NOTIFY_SOCKET = env["NOTIFY_SOCKET"] as string | undefined

/**
 * Check if running under systemd (NOTIFY_SOCKET is set)
 */
export function isSystemd(): boolean {
  return NOTIFY_SOCKET !== undefined && NOTIFY_SOCKET.length > 0
}

/**
 * Send a notification to systemd via sd_notify protocol
 *
 * @param state - One of: READY, RELOADING, STOPPING, WATCHDOG
 * @param extra - Extra key=value pairs to send
 */
export function sdNotify(state: string, extra?: Record<string, string>): void {
  if (!isSystemd()) {
    return
  }

  try {
    const socket = openSync(NOTIFY_SOCKET!, "w")
    try {
      const parts = [`STATUS=${state}`]
      if (extra) {
        for (const [key, value] of Object.entries(extra)) {
          parts.push(`${key}=${value}`)
        }
      }
      // Add newline and send
      writeSync(socket, parts.join("\n") + "\n")
    } finally {
      closeSync(socket)
    }
  } catch (err) {
    log.warn("failed to send sd_notify", { state, err })
  }
}

/**
 * Signal that the daemon is ready (READY=1)
 */
export function notifyReady(): void {
  log.info("notifying systemd: ready")
  sdNotify("READY=1")
}

/**
 * Signal that the daemon is reloading (RELOADING=1)
 */
export function notifyReloading(): void {
  log.info("notifying systemd: reloading")
  sdNotify("RELOADING=1")
}

/**
 * Signal that the daemon is stopping (STOPPING=1)
 */
export function notifyStopping(): void {
  log.info("notifying systemd: stopping")
  sdNotify("STOPPING=1")
}

/**
 * Send watchdog keepalive (WATCHDOG=1)
 * Should be called at intervals <= WATCHDOG_SEC interval
 */
export function notifyWatchdog(): void {
  sdNotify("WATCHDOG=1")
}

/**
 * Update status message visible via systemctl status
 */
export function notifyStatus(status: string): void {
  sdNotify(`STATUS=${status}`)
}

/**
 * Send extended status with multiple fields
 */
export function notifyExtendedStatus(status: string, extra: Record<string, string>): void {
  sdNotify(`STATUS=${status}`, extra)
}

/**
 * Check if watchdog should be triggered
 * Returns true if WATCHDOG_USEC is set and enough time has passed since last check
 */
let lastWatchdogAt = 0

export function shouldWatchdog(watchdogUsec: number): boolean {
  const now = Date.now()
  const watchdogMs = watchdogUsec / 1000
  if (now - lastWatchdogAt >= watchdogMs) {
    lastWatchdogAt = now
    return true
  }
  return false
}
