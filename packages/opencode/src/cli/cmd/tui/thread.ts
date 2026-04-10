import { cmd } from "@/cli/cmd/cmd"
import { tui } from "./app"
import { Rpc } from "@/util/rpc"
import { type rpc } from "./worker"
import path from "path"
import { text as streamText } from "node:stream/consumers"
import { fileURLToPath } from "url"
import { UI } from "@/cli/ui"
import { Log } from "@/util/log"
import { withTimeout } from "@/util/timeout"
import { withNetworkOptions, resolveNetworkOptions } from "@/cli/network"
import { Filesystem } from "@/util/filesystem"
import type { Event } from "@kilocode/sdk/v2"
import { createKiloClient } from "@kilocode/sdk/v2" // kilocode_change
import type { EventSource } from "./context/sdk"
import { win32DisableProcessedInput, win32InstallCtrlCGuard } from "./win32"
import { TuiConfig } from "@/config/tui"
import { Instance } from "@/project/instance"
import { importCloudSession, validateCloudFork } from "@/kilocaw-legacy/cloud-session" // kilocode_change
import { DaemonRuntime } from "@/kiloclaw/proactive/runtime/daemon"
import { Process } from "@/util/process"
import { Global } from "@/global"

declare global {
  const KILO_WORKER_PATH: string // kilocode_change
}

type RpcClient = ReturnType<typeof Rpc.client<typeof rpc>>

function createWorkerFetch(client: RpcClient): typeof fetch {
  const fn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const body = request.body ? await request.text() : undefined
    const result = await client.call("fetch", {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body,
    })
    return new Response(result.body, {
      status: result.status,
      headers: result.headers,
    })
  }
  return fn as typeof fetch
}

function createEventSource(client: RpcClient): EventSource {
  return {
    on: (handler) => client.on<Event>("event", handler),
    setWorkspace: (workspaceID) => {
      void client.call("setWorkspace", { workspaceID })
    },
  }
}

async function target() {
  if (typeof KILO_WORKER_PATH !== "undefined") return KILO_WORKER_PATH
  const dist = new URL("./cli/cmd/tui/worker.js", import.meta.url)
  if (await Filesystem.exists(fileURLToPath(dist))) return dist
  return new URL("./worker.ts", import.meta.url)
}

async function input(value?: string) {
  const piped = process.stdin.isTTY ? undefined : await streamText(process.stdin)
  if (!value) return piped
  if (!piped) return value
  return piped + "\n" + value
}

function setDefaultEnv(name: string, value: string) {
  if (process.env[name] !== undefined) return
  process.env[name] = value
}

function parseEnvLine(line: string): [string, string] | null {
  const text = line.trim()
  if (!text || text.startsWith("#")) return null
  const idx = text.indexOf("=")
  if (idx <= 0) return null
  const key = text.slice(0, idx).trim()
  if (!key) return null
  const raw = text.slice(idx + 1).trim()
  const value =
    (raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")) ? raw.slice(1, -1) : raw
  return [key, value]
}

async function loadDefaultSessionEnv(): Promise<void> {
  const home = process.env.HOME
  if (!home) return
  const envFile = path.join(home, ".kilocode", ".env")
  const text = await Filesystem.readText(envFile).catch(() => "")
  if (!text) return
  for (const line of text.split(/\r?\n/)) {
    const parsed = parseEnvLine(line)
    if (!parsed) continue
    setDefaultEnv(parsed[0], parsed[1])
  }
}

async function seedMcpAuthFromUserData(): Promise<void> {
  const home = process.env.HOME
  if (!home) return

  const source = path.join(home, ".local", "share", "kiloclaw", "mcp-auth.json")
  const target = path.join(Global.Path.data, "mcp-auth.json")
  if (source === target) return

  const src = await Filesystem.readJson<Record<string, Record<string, unknown>>>(source).catch(() => ({}))
  if (Object.keys(src).length === 0) return

  const dst = await Filesystem.readJson<Record<string, Record<string, unknown>>>(target).catch(() => ({}))
  const merged: Record<string, Record<string, unknown>> = { ...dst }

  for (const [name, entry] of Object.entries(src)) {
    const current = merged[name]
    if (!current) {
      merged[name] = entry
      continue
    }

    const hasTokens = typeof current["tokens"] === "object" && current["tokens"] !== null
    const srcHasTokens = typeof entry["tokens"] === "object" && entry["tokens"] !== null
    if (!hasTokens && srcHasTokens) {
      merged[name] = { ...current, tokens: entry["tokens"] }
    }

    const hasServerUrl = typeof current["serverUrl"] === "string"
    const srcServerUrl = entry["serverUrl"]
    if (!hasServerUrl && typeof srcServerUrl === "string") {
      merged[name] = { ...merged[name], serverUrl: srcServerUrl }
    }
  }

  await Filesystem.writeJson(target, merged, 0o600).catch(() => undefined)
}

async function startIntegratedRuntime(projectPath: string): Promise<boolean> {
  setDefaultEnv("KILOCLAW_DAEMON_RUNTIME_ENABLED", "true")
  setDefaultEnv("KILOCLAW_DAEMON_EXECUTION_ENABLED", "true")
  setDefaultEnv("KILOCLAW_TASK_ACTIONS_EXEC", "true")

  const ownerId = `tui-${process.pid}`
  try {
    DaemonRuntime.init({ ownerId, projectPath })
    await DaemonRuntime.start()
    if (!DaemonRuntime.isRunning()) {
      Log.Default.warn("integrated daemon runtime did not reach running state", { ownerId, projectPath })
      return false
    }
    Log.Default.info("integrated daemon runtime started", { ownerId, projectPath })
    return true
  } catch (err) {
    Log.Default.warn("integrated daemon runtime failed to start", {
      ownerId,
      projectPath,
      error: err instanceof Error ? err.message : String(err),
    })
    return false
  }
}

function readHealthUrl(mcpUrl: string): string {
  const url = new URL(mcpUrl)
  return `${url.protocol}//${url.host}/health`
}

async function canReach(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET" })
    return res.ok
  } catch {
    return false
  }
}

function shouldAutoStartGwsMcp(): boolean {
  const value = process.env.KILOCLAW_GWS_MCP_AUTOSTART
  if (!value) return true
  const normalized = value.toLowerCase()
  return normalized !== "0" && normalized !== "false" && normalized !== "off"
}

function hasGoogleOauthConfig(): boolean {
  return !!process.env.GOOGLE_OAUTH_CLIENT_ID && !!process.env.GOOGLE_OAUTH_CLIENT_SECRET
}

async function waitHealthy(healthUrl: string, timeoutMs = 30_000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await canReach(healthUrl)) return true
    await Bun.sleep(250)
  }
  return false
}

type IntegratedGwsMcpRuntime = {
  started: boolean
  spawned: boolean
  proc?: Process.Child
}

async function startIntegratedGoogleWorkspaceMcp(): Promise<IntegratedGwsMcpRuntime> {
  if (!shouldAutoStartGwsMcp()) {
    return { started: false, spawned: false }
  }

  const mcpUrl = process.env.KILOCLAW_GWS_MCP_URL ?? "http://localhost:8000/mcp"
  const healthUrl = readHealthUrl(mcpUrl)
  if (await canReach(healthUrl)) {
    Log.Default.info("google workspace MCP already reachable", { healthUrl })
    return { started: true, spawned: false }
  }

  if (!hasGoogleOauthConfig()) {
    Log.Default.warn("google workspace MCP autostart skipped: missing OAuth env", {
      required: ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET"],
    })
    return { started: false, spawned: false }
  }

  const port = new URL(mcpUrl).port || "8000"
  const hostBase = process.env.WORKSPACE_MCP_BASE_URI ?? "http://localhost"
  setDefaultEnv("WORKSPACE_MCP_PORT", port)
  setDefaultEnv("WORKSPACE_MCP_BASE_URI", hostBase)
  setDefaultEnv("GOOGLE_OAUTH_REDIRECT_URI", `${hostBase}:${port}/oauth2callback`)
  setDefaultEnv("MCP_ENABLE_OAUTH21", "true")
  setDefaultEnv("OAUTHLIB_INSECURE_TRANSPORT", "1")

  const cmd = [
    "uvx",
    "--from",
    "workspace-mcp",
    "workspace-mcp",
    "--transport",
    "streamable-http",
    "--tool-tier",
    "core",
  ]
  const proc = Process.spawn(cmd, {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  })

  proc.stderr?.on("data", (chunk: Buffer) => {
    Log.Default.debug("google workspace MCP stderr", { text: chunk.toString().trim() })
  })

  proc.stdout?.on("data", (chunk: Buffer) => {
    Log.Default.debug("google workspace MCP stdout", { text: chunk.toString().trim() })
  })

  const healthy = await waitHealthy(healthUrl)
  if (!healthy) {
    Log.Default.warn("google workspace MCP health check timed out; process left running", {
      healthUrl,
      cmd: cmd.join(" "),
      pid: proc.pid,
    })
    return { started: true, spawned: true, proc }
  }

  Log.Default.info("google workspace MCP autostarted", { healthUrl, pid: proc.pid })
  return { started: true, spawned: true, proc }
}

export const TuiThreadCommand = cmd({
  command: "$0 [project]",
  describe: "start kilo tui with integrated scheduler runtime", // kilocode_change
  builder: (yargs) =>
    withNetworkOptions(yargs)
      .positional("project", {
        type: "string",
        describe: "path to start kilo in", // kilocode_change
      })
      .option("model", {
        type: "string",
        alias: ["m"],
        describe: "model to use in the format of provider/model",
      })
      .option("continue", {
        alias: ["c"],
        describe: "continue the last session",
        type: "boolean",
      })
      .option("session", {
        alias: ["s"],
        type: "string",
        describe: "session id to continue",
      })
      .option("fork", {
        type: "boolean",
        describe: "fork the session when continuing (use with --continue or --session)",
      })
      .option("cloud-fork", {
        type: "boolean",
        describe: "fetch session from cloud and continue locally (use with --session)",
      })
      .option("prompt", {
        type: "string",
        describe: "prompt to use",
      })
      .option("agent", {
        type: "string",
        describe: "agent to use",
      }),
  handler: async (args) => {
    // Keep ENABLE_PROCESSED_INPUT cleared even if other code flips it.
    // (Important when running under `bun run` wrappers on Windows.)
    const unguard = win32InstallCtrlCGuard()
    const shutdown = {
      pending: undefined as Promise<void> | undefined,
      exiting: false,
    }
    const runtime = { started: false }
    const gwsMcp = { started: false, spawned: false, proc: undefined as Process.Child | undefined }
    try {
      // Must be the very first thing — disables CTRL_C_EVENT before any Worker
      // spawn or async work so the OS cannot kill the process group.
      win32DisableProcessedInput()
      await loadDefaultSessionEnv()

      // kilocode_change start - Initialize auth coordinator at startup
      // This ensures auth is checked/refreshed before chat renders
      const { MCP } = await import("@/mcp")
      MCP.ensureAtSessionStart().catch((err) => {
        Log.Default.warn("MCP ensureAtSessionStart failed", { error: err instanceof Error ? err.message : String(err) })
      })
      // kilocode_change end

      await seedMcpAuthFromUserData()

      if (args.fork && !args.continue && !args.session) {
        UI.error("--fork requires --continue or --session")
        process.exitCode = 1
        return
      }
      // kilocode_change start
      const cloudForkError = validateCloudFork(args)
      if (cloudForkError) {
        UI.error(cloudForkError)
        process.exitCode = 1
        return
      }
      // kilocode_change end

      // Resolve relative --project paths from PWD, then use the real cwd after
      // chdir so the thread and worker share the same directory key.
      const root = Filesystem.resolve(process.env.PWD ?? process.cwd())
      const next = args.project
        ? Filesystem.resolve(path.isAbsolute(args.project) ? args.project : path.join(root, args.project))
        : Filesystem.resolve(process.cwd())
      const file = await target()
      try {
        process.chdir(next)
      } catch {
        UI.error("Failed to change directory to " + next)
        return
      }
      const cwd = Filesystem.resolve(process.cwd())
      runtime.started = await startIntegratedRuntime(cwd)
      const integrated = await startIntegratedGoogleWorkspaceMcp()
      gwsMcp.started = integrated.started
      gwsMcp.spawned = integrated.spawned
      gwsMcp.proc = integrated.proc

      const worker = new Worker(file, {
        env: Object.fromEntries(
          Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
        ),
      })
      worker.onerror = (e) => {
        Log.Default.error(e)
      }

      const client = Rpc.client<typeof rpc>(worker)
      const error = (e: unknown) => {
        Log.Default.error(e)
      }
      const reload = () => {
        client.call("reload", undefined).catch((err) => {
          Log.Default.warn("worker reload failed", {
            error: err instanceof Error ? err.message : String(err),
          })
        })
      }
      process.on("uncaughtException", error)
      process.on("unhandledRejection", error)
      process.on("SIGUSR2", reload)

      let stopped = false
      const stop = async () => {
        if (stopped) return
        stopped = true
        process.off("uncaughtException", error)
        process.off("unhandledRejection", error)
        process.off("SIGUSR2", reload)
        await withTimeout(client.call("shutdown", undefined), 5000).catch((error) => {
          Log.Default.warn("worker shutdown failed", {
            error: error instanceof Error ? error.message : String(error),
          })
        })
        worker.terminate()
        if (!runtime.started) return
        await DaemonRuntime.stop().catch((err) => {
          Log.Default.warn("integrated daemon runtime stop failed", {
            error: err instanceof Error ? err.message : String(err),
          })
        })
        if (!gwsMcp.spawned || !gwsMcp.proc) return
        try {
          gwsMcp.proc.kill("SIGTERM")
        } catch {}
      }
      // kilocode_change start - graceful shutdown on external signals
      // The worker's postMessage for the RPC result may never be delivered
      // after shutdown because the worker's event loop drains. Send the
      // shutdown request without awaiting the response, wait for the worker
      // to exit naturally or force-terminate after a timeout.
      // Guard against multiple invocations (SIGHUP + SIGTERM + onExit).
      const shutdownAndExit = (input: { reason: string; code: number; signal?: NodeJS.Signals }) => {
        if (shutdown.exiting) return
        shutdown.exiting = true
        Log.Default.info("shutting down tui thread", {
          reason: input.reason,
          signal: input.signal,
          code: input.code,
          pid: process.pid,
          ppid: process.ppid,
        })
        stop()
          .catch((err) => {
            Log.Default.error("failed to terminate worker during shutdown", {
              reason: input.reason,
              signal: input.signal,
              error: err,
            })
          })
          .finally(() => {
            unguard?.()
            process.exit(input.code)
          })
      }
      process.once("SIGHUP", () => shutdownAndExit({ reason: "signal", signal: "SIGHUP", code: 129 }))
      process.once("SIGTERM", () => shutdownAndExit({ reason: "signal", signal: "SIGTERM", code: 143 }))
      // In some terminal/tab-close paths the parent shell is terminated without
      // forwarding a signal to this process, leaving the TUI orphaned. Detect
      // parent PID re-parenting and exit explicitly.
      const parent = process.ppid
      const orphanWatch = setInterval(() => {
        const orphaned = (() => {
          if (process.ppid !== parent) return true
          if (parent === 1) return false
          try {
            process.kill(parent, 0)
            return false
          } catch (err) {
            const code = (err as NodeJS.ErrnoException).code
            if (code !== "ESRCH") {
              Log.Default.debug("parent liveness check failed", {
                parent,
                code,
                error: err,
              })
              return false
            }
            Log.Default.debug("detected dead parent process", {
              parent,
              error: err,
            })
            return true
          }
        })()
        if (!orphaned) return
        shutdownAndExit({ reason: "parent-exit", code: 0 })
      }, 1000)
      orphanWatch.unref()
      // kilocode_change end

      const prompt = await input(args.prompt)
      const config = await Instance.provide({
        directory: cwd,
        fn: () => TuiConfig.get(),
      })

      const network = await resolveNetworkOptions(args)
      const external =
        process.argv.includes("--port") ||
        process.argv.includes("--hostname") ||
        process.argv.includes("--mdns") ||
        network.mdns ||
        network.port !== 0 ||
        network.hostname !== "127.0.0.1"

      const transport = external
        ? {
            url: (await client.call("server", network)).url,
            fetch: undefined,
            events: undefined,
          }
        : {
            url: "http://kilo.internal",
            fetch: createWorkerFetch(client),
            events: createEventSource(client),
          }

      setTimeout(() => {
        client.call("checkUpgrade", { directory: cwd }).catch(() => {})
      }, 1000).unref?.()

      try {
        // kilocode_change start - import cloud session before TUI renders
        if (args.cloudFork && args.session) {
          UI.println("Importing session from cloud...")
          const sdk = createKiloClient({
            baseUrl: transport.url,
            fetch: transport.fetch,
            directory: cwd,
          })
          const id = await importCloudSession(sdk, args.session).catch(() => undefined)
          if (!id) {
            UI.error("Failed to import session from cloud")
            shutdownAndExit({ reason: "cloud-fork-failed", code: 1 })
            return
          }
          args.session = id
          args.cloudFork = false
        }
        // kilocode_change end

        await tui({
          url: transport.url,
          config,
          directory: cwd,
          fetch: transport.fetch,
          events: transport.events,
          args: {
            continue: args.continue,
            sessionID: args.session,
            agent: args.agent,
            model: args.model,
            prompt,
            fork: args.fork,
          },
        })
      } finally {
        await stop()
      }
    } finally {
      unguard?.()
    }
    if (shutdown.exiting) return
    process.exit(0)
  },
})
