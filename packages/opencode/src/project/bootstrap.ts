import { Plugin } from "../plugin"
import { Format } from "../format"
import { LSP } from "../lsp"
import { FileWatcher } from "../file/watcher"
import { File } from "../file"
import { Project } from "./project"
import { Bus } from "../bus"
import { Command } from "../command"
import { Instance } from "./instance"
import { Vcs } from "./vcs"
import { Log } from "@/util/log"
import { KiloSessions } from "@/kilo-sessions/kilo-sessions" // kilocode_change
import { Snapshot } from "../snapshot"
import { Truncate } from "../tool/truncation"
import { MemoryDb } from "../kiloclaw/memory/memory.db" // kilocode_change - memory persistence
import { ServiceHealth } from "../kiloclaw/service-health" // kilocode_change - service health check

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })

  // kilocode_change start - run service health checks first
  const healthReport = await ServiceHealth.checkAll()
  if (!healthReport.allRequiredHealthy) {
    ServiceHealth.printWarnings(healthReport)

    const hardFail = process.env["KILO_MEMORY_HARD_FAIL_STARTUP"] !== "false"
    if (hardFail) {
      throw new Error("Required memory services unavailable at startup")
    }
  }
  // kilocode_change end

  await Plugin.init()
  KiloSessions.init() // kilocode_change
  Format.init()
  await LSP.init()
  FileWatcher.init()
  File.init()
  Vcs.init()
  Snapshot.init()
  Truncate.init()

  // kilocode_change start - initialize memory persistence if enabled
  if (MemoryDb.isEnabled()) {
    try {
      // Use Instance.directory if available, otherwise fallback to cwd
      let dbBasePath: string
      try {
        dbBasePath = Instance.directory
      } catch {
        // Instance.directory not available yet, use current working directory
        dbBasePath = process.cwd()
      }
      const dbPath = `${dbBasePath}/.kiloclaw/memory.db`
      await MemoryDb.init(dbPath)
      Log.Default.info("memory persistence initialized", { dbPath })
    } catch (err) {
      Log.Default.error("memory persistence init failed, continuing without persistence", { err })
    }
  }
  // kilocode_change end

  Bus.subscribe(Command.Event.Executed, async (payload) => {
    if (payload.properties.name === Command.Default.INIT) {
      await Project.setInitialized(Instance.project.id)
    }
  })
}
