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

export async function InstanceBootstrap() {
  Log.Default.info("bootstrapping", { directory: Instance.directory })
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
    const dbPath = `${Instance.directory}/.kilocode/memory.db`
    await MemoryDb.init(dbPath)
    Log.Default.info("memory persistence initialized", { dbPath })
  }
  // kilocode_change end

  Bus.subscribe(Command.Event.Executed, async (payload) => {
    if (payload.properties.name === Command.Default.INIT) {
      await Project.setInitialized(Instance.project.id)
    }
  })
}
