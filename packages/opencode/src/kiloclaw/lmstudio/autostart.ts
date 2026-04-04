import { Log } from "@/util/log"
import { Process } from "@/util/process"
import { Bus } from "@/bus"
import { HealthCheck } from "./health"
import { LMStudioTelemetry } from "./telemetry"
import type { AutoStartResult } from "./types"

const log = Log.create({ service: "lmstudio.autostart" })

type Platform = "linux" | "darwin" | "win32"

// Wrap Bus.publish to avoid failing when no instance context is available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function publishTelemetry(event: any, properties: any): Promise<void> {
  try {
    await Bus.publish(event, properties)
  } catch {
    // Telemetry is best-effort; ignore errors when no instance context
  }
}

export namespace AutoStart {
  /**
   * Check if the `lms` binary is available on the system.
   * Runs `lms --version` to verify the command exists.
   */
  export async function isLMSAvailable(): Promise<boolean> {
    try {
      const result = await Process.run(["lms", "--version"], {
        timeout: 5000,
        nothrow: true,
      })
      return result.code === 0
    } catch {
      return false
    }
  }

  /**
   * Wait for LM Studio server to become healthy after starting.
   */
  async function waitForHealth(baseURL: string, maxAttempts: number = 10, retryDelay: number = 1000): Promise<boolean> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      log.info("waiting for health", { attempt, maxAttempts })

      const status = await HealthCheck.check(baseURL, { timeout: 3000, retries: 1 })
      if (status.reachable) {
        log.info("server is healthy", { baseURL, attempt })
        return true
      }

      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay))
      }
    }

    log.warn("server did not become healthy in time", { baseURL, maxAttempts })
    return false
  }

  /**
   * Attempt to start LM Studio daemon using `lms daemon up`.
   */
  async function startDaemonCommand(): Promise<{ success: boolean; error?: string }> {
    try {
      const result = await Process.run(["lms", "daemon", "up"], {
        timeout: 30000,
        nothrow: true,
      })

      if (result.code === 0) {
        return { success: true }
      }

      const error = result.stderr.toString().trim() || `Command exited with code ${result.code}`
      return { success: false, error }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return { success: false, error }
    }
  }

  /**
   * Attempt to start LM Studio daemon via systemd (Linux only).
   */
  async function startDaemonSystemd(): Promise<{ success: boolean; error?: string }> {
    try {
      // First check if systemd is available
      const whichResult = await Process.run(["which", "systemctl"], {
        timeout: 5000,
        nothrow: true,
      })

      if (whichResult.code !== 0) {
        return { success: false, error: "systemd not available" }
      }

      // Try to start the service
      const result = await Process.run(["systemctl", "--user", "start", "lm-studio"], {
        timeout: 30000,
        nothrow: true,
      })

      if (result.code === 0) {
        return { success: true }
      }

      const error = result.stderr.toString().trim() || `systemctl failed with code ${result.code}`
      return { success: false, error }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      return { success: false, error }
    }
  }

  /**
   * Start the LM Studio daemon on the current platform.
   */
  export async function startDaemon(baseURL: string = "http://localhost:1234"): Promise<AutoStartResult> {
    const platform = process.platform as Platform
    const startTime = Date.now()

    await publishTelemetry(LMStudioTelemetry.StartAttempt, { method: "daemon" })

    // First check if LMS is available
    const available = await isLMSAvailable()
    if (!available) {
      const instructions = getStartupInstructions(platform)

      await publishTelemetry(LMStudioTelemetry.StartFailure, {
        error: "lms binary not found",
        method: "daemon",
      })

      return {
        success: false,
        started: false,
        method: "manual",
        error: "LM Studio CLI (lms) not found. Please install it from https://lmstudio.ai",
        instructions,
      }
    }

    // Check if already running by testing health
    const currentHealth = await HealthCheck.check(baseURL, { timeout: 3000, retries: 1 })
    if (currentHealth.reachable) {
      const latencyMs = Date.now() - startTime

      await publishTelemetry(LMStudioTelemetry.StartSuccess, { method: "daemon", latencyMs })

      return {
        success: true,
        started: false,
        method: "daemon",
      }
    }

    // Try to start the daemon
    let daemonResult = await startDaemonCommand()

    // On Linux, if daemon command fails, try systemd as fallback
    if (!daemonResult.success && platform === "linux") {
      log.info("daemon command failed, trying systemd", { error: daemonResult.error })

      await publishTelemetry(LMStudioTelemetry.StartAttempt, { method: "systemd" })

      daemonResult = await startDaemonSystemd()

      if (daemonResult.success) {
        const latencyMs = Date.now() - startTime

        await publishTelemetry(LMStudioTelemetry.StartSuccess, { method: "systemd", latencyMs })

        // Wait for health after systemd start
        const healthy = await waitForHealth(baseURL)
        if (healthy) {
          return {
            success: true,
            started: true,
            method: "systemd",
          }
        }
      }
    }

    if (!daemonResult.success) {
      const latencyMs = Date.now() - startTime
      const instructions = getStartupInstructions(platform)

      await publishTelemetry(LMStudioTelemetry.StartFailure, {
        error: daemonResult.error || "unknown error",
        method: platform === "linux" ? "systemd" : "daemon",
      })

      return {
        success: false,
        started: false,
        method: "manual",
        error: `Failed to start LM Studio daemon: ${daemonResult.error}`,
        instructions,
      }
    }

    // Wait for the server to become healthy
    const healthy = await waitForHealth(baseURL)
    if (!healthy) {
      const instructions = getStartupInstructions(platform)

      await publishTelemetry(LMStudioTelemetry.StartFailure, {
        error: "server did not become healthy after start",
        method: "daemon",
      })

      return {
        success: false,
        started: true,
        method: "daemon",
        error: "LM Studio daemon started but server did not become healthy",
        instructions,
      }
    }

    const latencyMs = Date.now() - startTime

    await publishTelemetry(LMStudioTelemetry.StartSuccess, { method: "daemon", latencyMs })

    return {
      success: true,
      started: true,
      method: "daemon",
    }
  }

  /**
   * Return platform-specific instructions for manually starting LM Studio.
   */
  export function getStartupInstructions(platform?: Platform): string {
    const p = platform ?? (process.platform as Platform)

    switch (p) {
      case "linux":
        return [
          "To start LM Studio on Linux:",
          "",
          "1. Using the LM Studio app:",
          "   - Open LM Studio and click 'Start Server'",
          "   - Or use the tray icon to start the local server",
          "",
          "2. Using the CLI:",
          "   - Run: lms daemon up",
          "",
          "3. Using systemd (if available):",
          "   - Run: systemctl --user start lm-studio",
          "",
          "Download LM Studio: https://lmstudio.ai",
        ].join("\n")

      case "darwin":
        return [
          "To start LM Studio on macOS:",
          "",
          "1. Using the LM Studio app:",
          "   - Open LM Studio and click 'Start Server'",
          "   - Or use the menu bar icon to start the local server",
          "",
          "2. Using the CLI:",
          "   - Run: lms daemon up",
          "",
          "Download LM Studio: https://lmstudio.ai",
        ].join("\n")

      case "win32":
        return [
          "To start LM Studio on Windows:",
          "",
          "1. Using the LM Studio app:",
          "   - Open LM Studio and click 'Start Server'",
          "   - Or use the system tray to start the local server",
          "",
          "2. Using the CLI (Command Prompt or PowerShell):",
          "   - Run: lms daemon up",
          "",
          "Download LM Studio: https://lmstudio.ai",
        ].join("\n")

      default:
        return [
          "To start LM Studio:",
          "",
          "1. Open the LM Studio application",
          "2. Click 'Start Server' or use the CLI: lms daemon up",
          "",
          "Download LM Studio: https://lmstudio.ai",
        ].join("\n")
    }
  }
}
