import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

export type TaskState = "queued" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled" | "lost"

export interface TaskMeta {
  readonly maxRetries?: number
  readonly retryDelayMs?: number
  readonly timeoutMs?: number
  readonly graceMs?: number
  readonly nextAttemptAt?: number
}

export interface LedgerTask {
  readonly id: string
  readonly name: string
  readonly payload?: Record<string, unknown>
  readonly createdAt: number
  readonly updatedAt: number
  readonly startedAt?: number
  readonly finishedAt?: number
  readonly workerId?: string
  readonly attempt: number
  readonly state: TaskState
  readonly error?: string
  readonly meta: TaskMeta
}

export interface LedgerHistory {
  readonly id: string
  readonly taskId: string
  readonly from: TaskState | "none"
  readonly to: TaskState
  readonly at: number
  readonly reason?: string
}

interface Snapshot {
  readonly version: 1
  readonly tasks: Record<string, LedgerTask>
  readonly history: LedgerHistory[]
}

export interface ReconcileResult {
  readonly scanned: number
  readonly lost: string[]
}

const EMPTY_SNAPSHOT: Snapshot = {
  version: 1,
  tasks: {},
  history: [],
}

export class TaskLedger {
  private readonly file: string
  private state: Snapshot

  constructor(file: string) {
    this.file = file
    this.state = this.load()
  }

  createTask(input: { id?: string; name: string; payload?: Record<string, unknown>; meta?: TaskMeta }): LedgerTask {
    const now = Date.now()
    const id = input.id ?? `task_${crypto.randomUUID()}`
    const task: LedgerTask = {
      id,
      name: input.name,
      payload: input.payload,
      createdAt: now,
      updatedAt: now,
      attempt: 0,
      state: "queued",
      meta: {
        maxRetries: input.meta?.maxRetries ?? 0,
        retryDelayMs: input.meta?.retryDelayMs ?? 0,
        timeoutMs: input.meta?.timeoutMs,
        graceMs: input.meta?.graceMs,
        nextAttemptAt: input.meta?.nextAttemptAt,
      },
    }

    this.state = {
      ...this.state,
      tasks: { ...this.state.tasks, [task.id]: task },
    }
    this.pushHistory(task.id, "none", "queued")
    this.save()
    return task
  }

  claimTask(taskId: string, workerId: string, now: number = Date.now()): LedgerTask | null {
    const task = this.state.tasks[taskId]
    if (!task) return null
    if (task.state !== "queued") return null
    if (typeof task.meta.nextAttemptAt === "number" && task.meta.nextAttemptAt > now) return null

    const next: LedgerTask = {
      ...task,
      state: "running",
      workerId,
      startedAt: task.startedAt ?? now,
      updatedAt: now,
      attempt: task.attempt + 1,
      meta: {
        ...task.meta,
        nextAttemptAt: undefined,
      },
    }

    this.state = {
      ...this.state,
      tasks: { ...this.state.tasks, [taskId]: next },
    }
    this.pushHistory(taskId, task.state, next.state)
    this.save()
    return next
  }

  completeTask(taskId: string, now: number = Date.now()): LedgerTask | null {
    return this.transition(taskId, ["running"], "succeeded", now)
  }

  failTask(
    taskId: string,
    input?: { error?: string; retry?: boolean; retryDelayMs?: number; timedOut?: boolean; now?: number },
  ): LedgerTask | null {
    const task = this.state.tasks[taskId]
    if (!task) return null
    if (task.state !== "running") return null

    const now = input?.now ?? Date.now()
    const delay = input?.retryDelayMs ?? task.meta.retryDelayMs ?? 0
    const max = task.meta.maxRetries ?? 0
    const retry = input?.retry === true && task.attempt <= max
    const timedOut = input?.timedOut === true

    if (retry) {
      const next: LedgerTask = {
        ...task,
        state: "queued",
        updatedAt: now,
        workerId: undefined,
        startedAt: undefined,
        error: input?.error,
        meta: {
          ...task.meta,
          nextAttemptAt: now + delay,
        },
      }
      this.state = {
        ...this.state,
        tasks: { ...this.state.tasks, [taskId]: next },
      }
      this.pushHistory(taskId, task.state, next.state, input?.error)
      this.save()
      return next
    }

    const nextState: TaskState = timedOut ? "timed_out" : "failed"
    const next = this.transition(taskId, ["running"], nextState, now, input?.error)
    return next
  }

  cancelTask(taskId: string, reason?: string, now: number = Date.now()): LedgerTask | null {
    return this.transition(taskId, ["queued", "running"], "cancelled", now, reason)
  }

  markLost(taskId: string, reason?: string, now: number = Date.now()): LedgerTask | null {
    return this.transition(taskId, ["running"], "lost", now, reason)
  }

  list(input?: { state?: TaskState; limit?: number }): LedgerTask[] {
    const tasks = Object.values(this.state.tasks)
    const filtered = input?.state ? tasks.filter((x) => x.state === input.state) : tasks
    const sorted = filtered.sort((a, b) => a.createdAt - b.createdAt)
    const limit = input?.limit ?? sorted.length
    return sorted.slice(0, limit)
  }

  get(taskId: string): LedgerTask | null {
    return this.state.tasks[taskId] ?? null
  }

  reconcile(input?: { now?: number; graceMs?: number }): ReconcileResult {
    const now = input?.now ?? Date.now()
    const grace = input?.graceMs ?? 30_000
    const running = this.list({ state: "running" })
    const lost = running
      .filter((task) => {
        const started = task.startedAt ?? task.updatedAt
        const taskGrace = task.meta.graceMs ?? grace
        return now - started > taskGrace
      })
      .flatMap((task) => {
        const marked = this.markLost(task.id, "stale_running", now)
        if (!marked) return []
        return [task.id]
      })

    return {
      scanned: running.length,
      lost,
    }
  }

  history(): LedgerHistory[] {
    return [...this.state.history]
  }

  private transition(
    taskId: string,
    from: TaskState[],
    to: TaskState,
    now: number,
    reason?: string,
  ): LedgerTask | null {
    const task = this.state.tasks[taskId]
    if (!task) return null
    if (!from.includes(task.state)) return null

    const done = to !== "queued" && to !== "running"
    const next: LedgerTask = {
      ...task,
      state: to,
      updatedAt: now,
      finishedAt: done ? now : task.finishedAt,
      workerId: to === "running" ? task.workerId : undefined,
      error: reason ?? task.error,
    }

    this.state = {
      ...this.state,
      tasks: { ...this.state.tasks, [taskId]: next },
    }
    this.pushHistory(taskId, task.state, to, reason)
    this.save()
    return next
  }

  private pushHistory(taskId: string, from: TaskState | "none", to: TaskState, reason?: string): void {
    const entry: LedgerHistory = {
      id: `hist_${crypto.randomUUID()}`,
      taskId,
      from,
      to,
      at: Date.now(),
      reason,
    }

    this.state = {
      ...this.state,
      history: [...this.state.history, entry],
    }
  }

  private load(): Snapshot {
    if (!existsSync(this.file)) {
      mkdirSync(dirname(this.file), { recursive: true })
      writeFileSync(this.file, JSON.stringify(EMPTY_SNAPSHOT, null, 2), "utf8")
      return EMPTY_SNAPSHOT
    }

    const raw = readFileSync(this.file, "utf8")
    if (raw.trim().length === 0) return EMPTY_SNAPSHOT

    try {
      const parsed = JSON.parse(raw) as Snapshot
      const tasks = parsed.tasks ?? {}
      const history = Array.isArray(parsed.history) ? parsed.history : []
      return {
        version: 1,
        tasks,
        history,
      }
    } catch {
      return EMPTY_SNAPSHOT
    }
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(this.state, null, 2), "utf8")
  }
}
