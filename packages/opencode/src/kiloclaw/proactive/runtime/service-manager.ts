/**
 * Service Manager - Health checks and auto-start for required services
 *
 * Checks and starts all required services:
 * - Memory database (SQLite)
 * - Memory graph store
 * - Vector store (embedding index)
 * - Embedding model
 * - Scheduled task daemon
 */

import { Log } from "@/util/log"
import { env } from "node:process"
import { existsSync, accessSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { ProactiveTaskStore } from "../scheduler.store"

const log = Log.create({ service: "kiloclaw.service.manager" })

// =============================================================================
// Service types
// =============================================================================

export interface ServiceHealth {
  name: string
  required: boolean
  isRunning: boolean
  canAutoStart: boolean
  error?: string
  details?: string
}

export interface ServiceCheckResult {
  allHealthy: boolean
  services: ServiceHealth[]
  started: string[]
  warnings: string[]
  errors: string[]
}

// =============================================================================
// Paths
// =============================================================================

function getDataPath(): string {
  return env["XDG_DATA_HOME"] ?? join(env["HOME"] ?? "/home/fulvio", ".local", "share", "kiloclaw")
}

function getMemoryDbPath(): string {
  return join(getDataPath(), ".kilocode", "memory.db")
}

function getGraphStorePath(): string {
  return join(getDataPath(), ".kilocode", "graph")
}

function getVectorStorePath(): string {
  return join(getDataPath(), ".kilocode", "vectors")
}

function getEmbeddingModelPath(): string {
  return join(getDataPath(), ".kilocode", "embedding-model")
}

function getDaemonSocketPath(): string {
  return join(getDataPath(), ".kilocode", "daemon.sock")
}

// =============================================================================
// Health checks
// =============================================================================

async function checkMemoryDb(): Promise<ServiceHealth> {
  const path = getMemoryDbPath()
  const required = true
  const canAutoStart = false // SQLite starts with process

  try {
    if (!existsSync(path)) {
      return {
        name: "memory_db",
        required,
        isRunning: false,
        canAutoStart,
        error: "database file not found",
        details: path,
      }
    }

    // Try to read the header to verify it's a valid SQLite database
    const header = Buffer.alloc(16)
    const fd = require("node:fs").openSync(path, "r")
    require("node:fs").readSync(fd, header, 0, 16, 0)
    require("node:fs").closeSync(fd)

    if (!header.toString("utf8", 0, 16).includes("SQLite")) {
      return {
        name: "memory_db",
        required,
        isRunning: false,
        canAutoStart,
        error: "invalid database header",
        details: path,
      }
    }

    return {
      name: "memory_db",
      required,
      isRunning: true,
      canAutoStart,
      details: path,
    }
  } catch (err) {
    return {
      name: "memory_db",
      required,
      isRunning: false,
      canAutoStart,
      error: err instanceof Error ? err.message : String(err),
      details: path,
    }
  }
}

async function checkGraphStore(): Promise<ServiceHealth> {
  const path = getGraphStorePath()
  const required = true
  const canAutoStart = false

  try {
    if (!existsSync(path)) {
      return {
        name: "graph_store",
        required,
        isRunning: false,
        canAutoStart,
        error: "graph store directory not found",
        details: path,
      }
    }

    // Check for presence of essential graph files
    const nodesPath = join(path, "nodes")
    const edgesPath = join(path, "edges")

    if (!existsSync(nodesPath) || !existsSync(edgesPath)) {
      return {
        name: "graph_store",
        required,
        isRunning: false,
        canAutoStart,
        error: "graph store incomplete (missing nodes or edges)",
        details: path,
      }
    }

    return {
      name: "graph_store",
      required,
      isRunning: true,
      canAutoStart,
      details: path,
    }
  } catch (err) {
    return {
      name: "graph_store",
      required,
      isRunning: false,
      canAutoStart,
      error: err instanceof Error ? err.message : String(err),
      details: path,
    }
  }
}

async function checkVectorStore(): Promise<ServiceHealth> {
  const path = getVectorStorePath()
  const required = true
  const canAutoStart = false

  try {
    if (!existsSync(path)) {
      return {
        name: "vector_store",
        required,
        isRunning: false,
        canAutoStart,
        error: "vector store directory not found",
        details: path,
      }
    }

    // Check for presence of essential vector index files
    const indexPath = join(path, "index")
    if (!existsSync(indexPath)) {
      return {
        name: "vector_store",
        required,
        isRunning: false,
        canAutoStart,
        error: "vector index not found",
        details: path,
      }
    }

    return {
      name: "vector_store",
      required,
      isRunning: true,
      canAutoStart,
      details: path,
    }
  } catch (err) {
    return {
      name: "vector_store",
      required,
      isRunning: false,
      canAutoStart,
      error: err instanceof Error ? err.message : String(err),
      details: path,
    }
  }
}

async function checkEmbeddingModel(): Promise<ServiceHealth> {
  const path = getEmbeddingModelPath()
  const required = true
  const canAutoStart = false

  try {
    if (!existsSync(path)) {
      return {
        name: "embedding_model",
        required,
        isRunning: false,
        canAutoStart,
        error: "embedding model not found",
        details: path,
      }
    }

    // Check for model files
    const modelFile = join(path, "model.bin")
    if (!existsSync(modelFile)) {
      return {
        name: "embedding_model",
        required,
        isRunning: false,
        canAutoStart,
        error: "model binary not found",
        details: path,
      }
    }

    return {
      name: "embedding_model",
      required,
      isRunning: true,
      canAutoStart,
      details: path,
    }
  } catch (err) {
    return {
      name: "embedding_model",
      required,
      isRunning: false,
      canAutoStart,
      error: err instanceof Error ? err.message : String(err),
      details: path,
    }
  }
}

async function checkDaemon(): Promise<ServiceHealth> {
  const required = true
  const canAutoStart = true

  try {
    // Check if daemon lease exists and is valid
    const lease = ProactiveTaskStore.getLease("scheduled_runtime")
    if (!lease) {
      return {
        name: "scheduled_daemon",
        required,
        isRunning: false,
        canAutoStart,
        error: "daemon lease not acquired",
        details: "run 'kiloclaw daemon run --project <path>' to start",
      }
    }

    if (lease.expiresAt < Date.now()) {
      return {
        name: "scheduled_daemon",
        required,
        isRunning: false,
        canAutoStart,
        error: "daemon lease expired",
        details: "run 'kiloclaw daemon run --project <path>' to restart",
      }
    }

    return {
      name: "scheduled_daemon",
      required,
      isRunning: true,
      canAutoStart,
      details: `lease holder: ${lease.ownerId}`,
    }
  } catch (err) {
    return {
      name: "scheduled_daemon",
      required,
      isRunning: false,
      canAutoStart,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// =============================================================================
// Auto-start logic
// =============================================================================

async function tryStartDaemon(projectPath: string): Promise<boolean> {
  try {
    // Import daemon runtime dynamically to avoid circular deps
    const { DaemonRuntime } = await import("./daemon")

    DaemonRuntime.init({
      ownerId: `cli-session-${process.pid}`,
      projectPath,
    })

    await DaemonRuntime.start()

    // Verify it started
    const health = DaemonRuntime.getHealth()
    return health.state === "running" || health.isLeader
  } catch (err) {
    log.error("failed to start daemon", { err })
    return false
  }
}

// =============================================================================
// Main check function
// =============================================================================

export async function checkAllServices(projectPath: string): Promise<ServiceCheckResult> {
  const result: ServiceCheckResult = {
    allHealthy: true,
    services: [],
    started: [],
    warnings: [],
    errors: [],
  }

  // Run all checks in parallel
  const checks = await Promise.all([
    checkMemoryDb(),
    checkGraphStore(),
    checkVectorStore(),
    checkEmbeddingModel(),
    checkDaemon(),
  ])

  result.services = checks

  // Analyze results
  for (const health of checks) {
    if (!health.isRunning) {
      if (health.required) {
        result.allHealthy = false

        // Try auto-start for services that support it
        if (health.canAutoStart && health.name === "scheduled_daemon") {
          log.info("attempting to auto-start daemon", { service: health.name })
          const started = await tryStartDaemon(projectPath)

          if (started) {
            result.started.push(health.name)
            log.info("daemon auto-started successfully")
          } else {
            result.errors.push(`[FATAL] ${health.name}: ${health.error ?? "unknown error"}`)
            if (health.details) {
              result.errors.push(`  Details: ${health.details}`)
            }
            result.errors.push(`  Action: ${health.details ?? "run 'kiloclaw daemon run --project <path>'"}`)
          }
        } else {
          result.errors.push(`[FATAL] ${health.name}: ${health.error ?? "not running"}`)
          if (health.details) {
            result.errors.push(`  Path: ${health.details}`)
          }
        }
      } else {
        result.warnings.push(`[WARN] ${health.name}: ${health.error ?? "not running"}`)
      }
    }
  }

  return result
}

// =============================================================================
// Formatted output
// =============================================================================

export function formatServiceWarnings(result: ServiceCheckResult): string[] {
  const lines: string[] = []

  if (result.started.length > 0) {
    lines.push("")
    lines.push("⚠️  Services auto-started:")
    for (const name of result.started) {
      lines.push(`  - ${name} (now running)`)
    }
  }

  if (result.warnings.length > 0) {
    lines.push("")
    lines.push("⚠️  Service warnings (non-critical):")
    for (const warning of result.warnings) {
      lines.push(`  ${warning}`)
    }
  }

  if (result.errors.length > 0) {
    lines.push("")
    lines.push("🚨  Service errors (critical):")
    for (const error of result.errors) {
      lines.push(`  ${error}`)
    }
  }

  return lines
}
