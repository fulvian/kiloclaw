import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

type SqliteDb = {
  prepare(sql: string): {
    run: (...args: unknown[]) => void
    get: (...args: unknown[]) => { value?: string } | undefined
    all: (...args: unknown[]) => Array<{ key: string; value: string }>
  }
}

export interface StoreRecord {
  readonly key: string
  readonly value: unknown
}

export interface ProactiveStore {
  readonly mode: "sqlite" | "file"
  put(key: string, value: unknown): Promise<void>
  get<T>(key: string): Promise<T | null>
  delete(key: string): Promise<void>
  list(): Promise<StoreRecord[]>
}

export class SqliteProactiveStore implements ProactiveStore {
  readonly mode: "sqlite" | "file"
  private readonly file: string
  private readonly db?: SqliteDb

  private constructor(file: string, mode: "sqlite" | "file", db?: SqliteDb) {
    this.file = file
    this.mode = mode
    this.db = db
  }

  static async create(path: string): Promise<SqliteProactiveStore> {
    const sqlite = await tryOpenSqlite(path)
    if (sqlite) {
      return new SqliteProactiveStore(path, "sqlite", sqlite)
    }
    return new SqliteProactiveStore(path, "file")
  }

  async put(key: string, value: unknown): Promise<void> {
    if (this.db) {
      this.db.prepare("insert or replace into proactive_kv(key, value) values (?, ?)").run(key, JSON.stringify(value))
      return
    }

    const map = this.readFileMap()
    map[key] = value
    this.writeFileMap(map)
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.db) {
      const row = this.db.prepare("select value from proactive_kv where key = ?").get(key)
      if (!row?.value) return null
      return JSON.parse(row.value) as T
    }

    const map = this.readFileMap()
    if (!(key in map)) return null
    return map[key] as T
  }

  async delete(key: string): Promise<void> {
    if (this.db) {
      this.db.prepare("delete from proactive_kv where key = ?").run(key)
      return
    }

    const map = this.readFileMap()
    delete map[key]
    this.writeFileMap(map)
  }

  async list(): Promise<StoreRecord[]> {
    if (this.db) {
      return this.db
        .prepare("select key, value from proactive_kv order by key asc")
        .all()
        .map((row) => ({
          key: row.key,
          value: JSON.parse(row.value),
        }))
    }

    const map = this.readFileMap()
    const keys = Object.keys(map).sort((a, b) => a.localeCompare(b))
    return keys.map((key) => ({ key, value: map[key] }))
  }

  private readFileMap(): Record<string, unknown> {
    const file = this.fallbackPath()
    if (!existsSync(file)) return {}

    const raw = readFileSync(file, "utf8")
    if (raw.trim().length === 0) return {}
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return {}
    }
  }

  private writeFileMap(map: Record<string, unknown>): void {
    const file = this.fallbackPath()
    mkdirSync(dirname(file), { recursive: true })
    const ordered = Object.keys(map)
      .sort((a, b) => a.localeCompare(b))
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = map[key]
        return acc
      }, {})
    writeFileSync(file, JSON.stringify(ordered, null, 2), "utf8")
  }

  private fallbackPath(): string {
    return this.file.endsWith(".json") ? this.file : `${this.file}.json`
  }
}

async function tryOpenSqlite(path: string): Promise<SqliteDb | null> {
  try {
    const mod = await import("bun:sqlite")
    const db = new mod.Database(path, { create: true }) as unknown as SqliteDb
    db.prepare("create table if not exists proactive_kv (key text primary key not null, value text not null)").run()
    return db
  } catch {
    return null
  }
}
