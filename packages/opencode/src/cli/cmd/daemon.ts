/**
 * Daemon CLI Command
 *
 * Provides commands for managing the scheduled task daemon:
 * - daemon run: Start the daemon
 * - daemon status: Show daemon health status
 * - daemon drain: Gracefully drain and stop the daemon
 */

import type { Argv } from "yargs"
import { bootstrap } from "../bootstrap"
import { cmd } from "./cmd"
import { DaemonRuntime } from "../../kiloclaw/proactive/runtime/daemon"
import { ProactiveTaskStore } from "../../kiloclaw/proactive/scheduler.store"
import { isSystemd, notifyStopping } from "../../kiloclaw/proactive/runtime/notify"
import { existsSync } from "node:fs"
import { join } from "node:path"

const DAEMON_LEASE_NAME = "scheduled_runtime"

interface DaemonStatusOutput {
  state: string
  ownerId: string
  isLeader: boolean
  lease: {
    name: string
    expiresAt: number | null
    updatedAt: number | null
  } | null
  scheduler: {
    isRunning: boolean
    lastTickAt: number | null
    pendingTasks: number
    dlqSize: number
  }
  uptime: {
    seconds: number
    startedAt: number | null
  }
  flags: {
    runtimeEnabled: boolean
    executionEnabled: boolean
    leaseRequired: boolean
    misfireMode: string
  }
  telemetry: {
    runSuccessRate: number
    runFailRate: number
    runBlockedRate: number
    totalRuns24h: number
    dlqGrowthRate: number
    dlqBaseline: number
    avgTickLagMs: number
    lastRuns: Array<{
      outcome: string
      durationMs: number
      timestamp: number
    }>
  }
  version: string
}

interface RunStats {
  success: number
  failed: number
  blocked: number
  total: number
  recentRuns: Array<{
    outcome: string
    durationMs: number
    timestamp: number
  }>
}

function calculateRunStats(
  runs: Array<{ outcome: string; durationMs: number; finishedAt: number | null | undefined }>,
): RunStats {
  const now = Date.now()
  const window24h = now - 24 * 60 * 60 * 1000

  const recentRuns = runs
    .filter((r) => r.finishedAt && r.finishedAt > window24h)
    .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
    .slice(0, 10)
    .map((r) => ({
      outcome: r.outcome,
      durationMs: r.durationMs,
      timestamp: r.finishedAt ?? 0,
    }))

  const runs24h = recentRuns.length

  let success = 0
  let failed = 0
  let blocked = 0

  for (const r of recentRuns) {
    if (r.outcome === "success") success++
    else if (r.outcome === "failed") failed++
    else if (r.outcome === "blocked") blocked++
  }

  return {
    success,
    failed,
    blocked,
    total: runs24h,
    recentRuns,
  }
}

function formatTimestamp(ts: number | null): string {
  if (ts === null) return "never"
  const d = new Date(ts)
  return d.toISOString()
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`
}

export const DaemonStatusCommand = cmd({
  command: "status",
  describe: "show daemon health and status",
  builder: (yargs: Argv) => yargs.option("json", { type: "boolean", default: false, describe: "Output as JSON" }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const health = DaemonRuntime.getHealth()
      const flags = DaemonRuntime.getFeatureFlags()
      const lease = ProactiveTaskStore.getLease(DAEMON_LEASE_NAME)
      const pendingTasks = ProactiveTaskStore.getPending()
      const dlqEntries = ProactiveTaskStore.getDLQ()

      // Collect telemetry data from recent runs
      const allRecentRuns: Array<{ outcome: string; durationMs: number; finishedAt: number | null | undefined }> = []

      // Sample runs from a subset of pending tasks (limit to avoid performance issues)
      const sampleTasks = pendingTasks.slice(0, 50)
      for (const task of sampleTasks) {
        const runs = ProactiveTaskStore.getRuns(task.id, 20)
        for (const run of runs) {
          allRecentRuns.push({
            outcome: run.outcome,
            durationMs: run.durationMs,
            finishedAt: run.finishedAt ?? null,
          })
        }
      }

      const stats = calculateRunStats(allRecentRuns)

      // Calculate DLQ growth rate (current vs baseline)
      const dlqBaseline = Math.max(dlqEntries.length, 1) // Use current as baseline if no history
      const dlqGrowthRate = dlqEntries.length / dlqBaseline

      // Estimate tick lag from lastTickAt
      let avgTickLagMs = 0
      if (health.lastTickAt && health.uptimeSeconds > 0) {
        const expectedTickInterval = 1000 // config tick default
        avgTickLagMs = Math.max(0, Date.now() - health.lastTickAt - expectedTickInterval)
      }

      const output: DaemonStatusOutput = {
        state: health.state,
        ownerId: health.ownerId,
        isLeader: health.isLeader,
        lease: lease
          ? {
              name: lease.leaseName,
              expiresAt: lease.expiresAt,
              updatedAt: lease.updatedAt,
            }
          : null,
        scheduler: {
          isRunning: health.isLeader,
          lastTickAt: health.lastTickAt,
          pendingTasks: pendingTasks.length,
          dlqSize: dlqEntries.length,
        },
        uptime: {
          seconds: health.uptimeSeconds,
          startedAt: health.uptimeSeconds > 0 ? Date.now() - health.uptimeSeconds * 1000 : null,
        },
        flags,
        telemetry: {
          runSuccessRate: stats.total > 0 ? stats.success / stats.total : 0,
          runFailRate: stats.total > 0 ? stats.failed / stats.total : 0,
          runBlockedRate: stats.total > 0 ? stats.blocked / stats.total : 0,
          totalRuns24h: stats.total,
          dlqGrowthRate,
          dlqBaseline,
          avgTickLagMs,
          lastRuns: stats.recentRuns,
        },
        version: health.version,
      }

      if (args.json) {
        console.log(JSON.stringify(output, null, 2))
        return
      }

      // Human-readable output
      console.log("=== Daemon Status ===")
      console.log(`State:       ${output.state}`)
      console.log(`Owner ID:    ${output.ownerId}`)
      console.log(`Is Leader:   ${output.isLeader ? "yes" : "no"}`)
      console.log("")
      console.log("=== Lease ===")
      if (output.lease) {
        console.log(`Name:        ${output.lease.name}`)
        console.log(`Expires:     ${formatTimestamp(output.lease.expiresAt)}`)
        console.log(`Updated:     ${formatTimestamp(output.lease.updatedAt)}`)
      } else {
        console.log("(no active lease)")
      }
      console.log("")
      console.log("=== Scheduler ===")
      console.log(`Running:     ${output.scheduler.isRunning ? "yes" : "no"}`)
      console.log(`Last Tick:  ${formatTimestamp(output.scheduler.lastTickAt)}`)
      console.log(`Pending:     ${output.scheduler.pendingTasks}`)
      console.log(`DLQ Size:    ${output.scheduler.dlqSize}`)
      console.log("")
      console.log("=== Uptime ===")
      console.log(`Duration:    ${formatUptime(output.uptime.seconds)}`)
      console.log(`Started:     ${formatTimestamp(output.uptime.startedAt)}`)
      console.log("")
      console.log("=== Feature Flags ===")
      console.log(`Runtime Enabled:  ${flags.runtimeEnabled}`)
      console.log(`Execution Enabled: ${flags.executionEnabled}`)
      console.log(`Lease Required:    ${flags.leaseRequired}`)
      console.log(`Misfire Mode:     ${flags.misfireMode}`)
      console.log("")
      console.log("=== Telemetry ===")
      const t = output.telemetry
      console.log(`Success Rate: ${(t.runSuccessRate * 100).toFixed(1)}% (${stats.success}/${stats.total} runs)`)
      console.log(`Fail Rate:    ${(t.runFailRate * 100).toFixed(1)}% (${stats.failed}/${stats.total} runs)`)
      console.log(`Blocked Rate: ${(t.runBlockedRate * 100).toFixed(1)}% (${stats.blocked}/${stats.total} runs)`)
      console.log(`Total Runs:   ${t.totalRuns24h} in last 24h`)
      console.log(`DLQ Growth:  ${t.dlqGrowthRate.toFixed(2)}x (baseline: ${t.dlqBaseline})`)
      console.log(`Tick Lag:    ${t.avgTickLagMs}ms`)
      console.log("")
      console.log(`Version:     ${output.version}`)
      console.log(`Systemd:     ${isSystemd() ? "yes" : "no"}`)
    })
  },
})

export const DaemonRunCommand = cmd({
  command: "run",
  describe: "start the daemon",
  builder: (yargs: Argv) =>
    yargs
      .option("project", {
        type: "string",
        describe: "Project path",
        demandOption: true,
      })
      .option("owner-id", {
        type: "string",
        describe: "Unique owner ID for this daemon instance",
        default: `daemon-${process.pid}-${Date.now()}`,
      })
      .check((args) => {
        if (!existsSync(args.project as string)) {
          throw new Error(`Project path does not exist: ${args.project}`)
        }
        return true
      }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const ownerId = args["ownerId"] as string
      const projectPath = args.project as string

      console.log(`Starting daemon...`)
      console.log(`Owner ID:    ${ownerId}`)
      console.log(`Project:     ${projectPath}`)

      DaemonRuntime.init({ ownerId, projectPath })

      // Handle shutdown signals
      const shutdown = async () => {
        console.log("\nReceived shutdown signal, stopping daemon...")
        notifyStopping()
        await DaemonRuntime.stop()
        process.exit(0)
      }

      process.on("SIGINT", shutdown)
      process.on("SIGTERM", shutdown)

      try {
        await DaemonRuntime.start()

        const health = DaemonRuntime.getHealth()
        console.log(`Daemon started successfully`)
        console.log(`State:       ${health.state}`)
        console.log(`Is Leader:   ${health.isLeader ? "yes" : "no"}`)
        console.log("")
        console.log("Press Ctrl+C to stop")

        // Keep process alive
        await new Promise(() => {})
      } catch (err) {
        console.error("Failed to start daemon:", err)
        process.exit(1)
      }
    })
  },
})

export const DaemonDrainCommand = cmd({
  command: "drain",
  describe: "gracefully drain and stop the daemon",
  handler: async () => {
    await bootstrap(process.cwd(), async () => {
      console.log("Draining daemon...")
      notifyStopping()
      await DaemonRuntime.stop()
      console.log("Daemon drained and stopped")
    })
  },
})

export const DaemonInstallCommand = cmd({
  command: "install",
  describe: "install daemon as a system service (systemd on Linux)",
  builder: (yargs: Argv) =>
    yargs
      .option("user", { type: "boolean", default: false, describe: "Install for current user only (systemd --user)" })
      .option("project", {
        type: "string",
        describe: "Project path",
        default: process.cwd(),
      })
      .option("force", { type: "boolean", default: false, describe: "Overwrite existing service" }),
  handler: async (args) => {
    const { execSync } = await import("node:child_process")
    const { join } = await import("node:path")
    const { existsSync, writeFileSync, chmodSync, mkdirSync } = await import("node:fs")
    const projectPath = args.project as string

    if (!existsSync(projectPath)) {
      console.error(`Error: Project path does not exist: ${projectPath}`)
      process.exit(1)
    }

    // Detect OS
    const isLinux = process.platform === "linux"
    const isMacos = process.platform === "darwin"

    if (!isLinux && !isMacos) {
      console.error("Error: Service installation is only supported on Linux and macOS")
      process.exit(1)
    }

    const dataHome =
      process.env["XDG_DATA_HOME"] ?? join(process.env["HOME"] ?? "/home/fulvio", ".local", "share", "kiloclaw")

    if (isLinux) {
      // Linux: Install systemd unit
      const unitContent = `[Unit]
Description=KiloClaw Scheduled Task Service
After=network.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=notify
NotifyAccess=main
ExecStart=${process.argv[0] ?? "kiloclaw"} daemon run --project ${projectPath}
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5s
TimeoutStartSec=30s
TimeoutStopSec=45s
Environment=KILOCLAW_PROACTIVE_DB_PATH=${dataHome}/.kilocode/proactive.db
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=${dataHome} ${projectPath}/.kilocode

[Install]
WantedBy=multi-user.target
`

      const userMode = args.user as boolean
      let unitPath: string
      let daemonReloadCmd: string

      if (userMode) {
        unitPath = join(
          process.env["HOME"] ?? "/home/fulvio",
          ".config",
          "systemd",
          "user",
          "kiloclaw-scheduler.service",
        )
        mkdirSync(join(process.env["HOME"] ?? "/home/fulvio", ".config", "systemd", "user"), { recursive: true })
        daemonReloadCmd = "systemctl --user daemon-reload"
      } else {
        unitPath = "/etc/systemd/system/kiloclaw-scheduler.service"
        daemonReloadCmd = "sudo systemctl daemon-reload"
      }

      // Check if already installed
      if (existsSync(unitPath) && !args.force) {
        console.error(`Error: Service already installed at ${unitPath}. Use --force to overwrite.`)
        process.exit(1)
      }

      // Write unit file
      writeFileSync(unitPath, unitContent, "utf8")
      chmodSync(unitPath, 0o644)
      console.log(`✓ Service installed to ${unitPath}`)

      // Reload systemd
      console.log(`Running: ${daemonReloadCmd}`)
      try {
        execSync(daemonReloadCmd, { stdio: "inherit" })
      } catch {
        console.warn("Warning: Failed to reload systemd. Run the following command manually:")
        console.warn(`  ${daemonReloadCmd}`)
      }

      // Enable and start
      const enableCmd = userMode
        ? "systemctl --user enable --now kiloclaw-scheduler"
        : "sudo systemctl enable --now kiloclaw-scheduler"
      console.log(`Running: ${enableCmd}`)
      try {
        execSync(enableCmd, { stdio: "inherit" })
        console.log("✓ Service enabled and started")
      } catch {
        console.warn("Warning: Failed to enable/start service. Run the following command manually:")
        console.warn(`  ${enableCmd}`)
      }

      console.log("")
      console.log("Installation complete!")
      console.log(`  Service: kiloclaw-scheduler`)
      console.log(`  Status:  systemctl ${userMode ? "--user" : ""} status kiloclaw-scheduler`)
      console.log(`  Logs:    journalctl ${userMode ? "--user" : "-u kiloclaw-scheduler"} -f`)
    } else if (isMacos) {
      // macOS: Install launchd plist
      const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>dev.kiloclaw.scheduler</string>
    <key>ProgramArguments</key>
    <array>
        <string>${process.argv[0] ?? "kiloclaw"}</string>
        <string>daemon</string>
        <string>run</string>
        <string>--project</string>
        <string>${projectPath}</string>
    </array>
    <key>WorkingDirectory</key><string>${projectPath}</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>10</integer>
    <key>EnvironmentVariables</key>
    <dict>
        <key>KILOCLAW_PROACTIVE_DB_PATH</key><string>${dataHome}/.kilocode/proactive.db</string>
    </dict>
    <key>StandardOutPath</key><string>/tmp/kiloclaw-scheduler.out.log</string>
    <key>StandardErrorPath</key><string>/tmp/kiloclaw-scheduler.err.log</string>
</dict>
</plist>
`

      const plistPath = join(
        process.env["HOME"] ?? "/home/fulvio",
        "Library",
        "LaunchAgents",
        "dev.kiloclaw.scheduler.plist",
      )
      mkdirSync(join(process.env["HOME"] ?? "/home/fulvio", "Library", "LaunchAgents"), { recursive: true })

      if (existsSync(plistPath) && !args.force) {
        console.error(`Error: Service already installed at ${plistPath}. Use --force to overwrite.`)
        process.exit(1)
      }

      writeFileSync(plistPath, plistContent, "utf8")
      console.log(`✓ Service installed to ${plistPath}`)

      // Load and start
      const loadCmd = `launchctl load ${plistPath}`
      console.log(`Running: ${loadCmd}`)
      try {
        execSync(loadCmd, { stdio: "inherit" })
        console.log("✓ Service loaded and started")
      } catch {
        console.warn("Warning: Failed to load service. Run the following command manually:")
        console.warn(`  ${loadCmd}`)
      }

      console.log("")
      console.log("Installation complete!")
      console.log(`  Service: dev.kiloclaw.scheduler`)
      console.log(`  Status:  launchctl bslist | grep kiloclaw`)
      console.log(`  Logs:    tail -f /tmp/kiloclaw-scheduler.out.log`)
    }
  },
})

export const DaemonCommand = cmd({
  command: "daemon",
  describe: "manage the scheduled task daemon",
  builder: (yargs: Argv) =>
    yargs
      .command(DaemonRunCommand)
      .command(DaemonStatusCommand)
      .command(DaemonDrainCommand)
      .command(DaemonInstallCommand)
      .demandCommand(),
  handler: () => {
    // Default handler - will show help due to demandCommand()
  },
})
