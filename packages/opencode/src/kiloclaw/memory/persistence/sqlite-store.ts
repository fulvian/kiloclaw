import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import type { Layer, MemoryEntry, MemoryId } from "../types.js"

type SqliteDb = {
  prepare(sql: string): {
    run: (...args: unknown[]) => void
    get: (...args: unknown[]) => { value?: string } | undefined
    all: (...args: unknown[]) => Array<{ id: string; value: string }>
  }
}

export class MemorySqliteStore {
  readonly mode: "sqlite" | "file"
  private readonly file: string
  private readonly db?: SqliteDb

  private constructor(file: string, mode: "sqlite" | "file", db?: SqliteDb) {
    this.file = file
    this.mode = mode
    this.db = db
  }

  static async create(path: string): Promise<MemorySqliteStore> {
    const sqlite = await tryOpen(path)
    if (sqlite) {
      return new MemorySqliteStore(path, "sqlite", sqlite)
    }
    return new MemorySqliteStore(path, "file")
  }

  async put(entry: MemoryEntry): Promise<void> {
    if (this.db) {
      this.db
        .prepare("insert or replace into memory_entries(id, layer, value) values (?, ?, ?)")
        .run(entry.id, entry.layer, JSON.stringify(entry))
      return
    }

    const rows = this.readFileRows()
    rows[entry.id] = entry
    this.writeFileRows(rows)
  }

  async get(id: MemoryId): Promise<MemoryEntry | null> {
    if (this.db) {
      const row = this.db.prepare("select value from memory_entries where id = ?").get(id)
      if (!row?.value) return null
      return JSON.parse(row.value) as MemoryEntry
    }

    const rows = this.readFileRows()
    return (rows[id] as MemoryEntry | undefined) ?? null
  }

  async delete(id: MemoryId): Promise<void> {
    if (this.db) {
      this.db.prepare("delete from memory_entries where id = ?").run(id)
      return
    }

    const rows = this.readFileRows()
    delete rows[id]
    this.writeFileRows(rows)
  }

  async queryByLayer(layer: Layer): Promise<MemoryEntry[]> {
    if (this.db) {
      return this.db
        .prepare("select id, value from memory_entries where layer = ? order by id asc")
        .all(layer)
        .map((row) => JSON.parse(row.value) as MemoryEntry)
    }

    const rows = this.readFileRows()
    return Object.values(rows)
      .filter((entry) => entry.layer === layer)
      .sort((a, b) => a.id.localeCompare(b.id))
  }

  private readFileRows(): Record<string, MemoryEntry> {
    const file = this.fallbackPath()
    if (!existsSync(file)) return {}
    const raw = readFileSync(file, "utf8")
    if (raw.trim().length === 0) return {}
    try {
      return JSON.parse(raw) as Record<string, MemoryEntry>
    } catch {
      return {}
    }
  }

  private writeFileRows(rows: Record<string, MemoryEntry>): void {
    const file = this.fallbackPath()
    mkdirSync(dirname(file), { recursive: true })
    const ordered = Object.keys(rows)
      .sort((a, b) => a.localeCompare(b))
      .reduce<Record<string, MemoryEntry>>((acc, id) => {
        const row = rows[id]
        if (!row) return acc
        acc[id] = row
        return acc
      }, {})
    writeFileSync(file, JSON.stringify(ordered, null, 2), "utf8")
  }

  private fallbackPath(): string {
    return this.file.endsWith(".json") ? this.file : `${this.file}.json`
  }
}

async function tryOpen(path: string): Promise<SqliteDb | null> {
  try {
    const mod = await import("bun:sqlite")
    const db = new mod.Database(path, { create: true }) as unknown as SqliteDb
    db.prepare(
      "create table if not exists memory_entries (id text primary key not null, layer text not null, value text not null)",
    ).run()
    db.prepare("create index if not exists idx_memory_layer on memory_entries(layer)").run()
    return db
  } catch {
    return null
  }
}
