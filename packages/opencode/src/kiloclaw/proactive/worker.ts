import { type LedgerTask, TaskLedger } from "./task-ledger"

export interface WorkerResult {
  readonly taskId: string
  readonly state: "succeeded" | "failed" | "timed_out"
  readonly output?: unknown
  readonly error?: string
  readonly replayed: boolean
}

export class ProactiveWorker {
  private readonly ledger: TaskLedger
  private readonly cache = new Map<string, WorkerResult>()
  private readonly inflight = new Map<string, Promise<WorkerResult>>()

  constructor(ledger: TaskLedger) {
    this.ledger = ledger
  }

  async execute(
    task: Pick<LedgerTask, "id"> & { timeoutMs?: number },
    idempotencyKey: string,
    run: () => Promise<unknown>,
  ): Promise<WorkerResult> {
    const cached = this.cache.get(idempotencyKey)
    if (cached) {
      return {
        ...cached,
        replayed: true,
      }
    }

    const inflight = this.inflight.get(idempotencyKey)
    if (inflight) {
      return inflight
    }

    const pending = this.run(task, idempotencyKey, run)
    this.inflight.set(idempotencyKey, pending)
    try {
      return await pending
    } finally {
      this.inflight.delete(idempotencyKey)
    }
  }

  private async run(
    task: Pick<LedgerTask, "id"> & { timeoutMs?: number },
    idempotencyKey: string,
    run: () => Promise<unknown>,
  ): Promise<WorkerResult> {
    const claimed = this.ledger.claimTask(task.id, "proactive-worker")
    if (!claimed) {
      const current = this.ledger.get(task.id)
      const out: WorkerResult = {
        taskId: task.id,
        state: "failed",
        error: current ? `task_not_claimable:${current.state}` : "task_not_found",
        replayed: false,
      }
      this.cache.set(idempotencyKey, out)
      return out
    }

    try {
      const timeoutMs = task.timeoutMs ?? claimed.meta.timeoutMs ?? 30_000
      const output = await withTimeout(run(), timeoutMs)
      this.ledger.completeTask(task.id)
      const out: WorkerResult = {
        taskId: task.id,
        state: "succeeded",
        output,
        replayed: false,
      }
      this.cache.set(idempotencyKey, out)
      return out
    } catch (err) {
      const timedOut = err instanceof TimeoutError
      const msg = err instanceof Error ? err.message : String(err)
      this.ledger.failTask(task.id, {
        error: msg,
        timedOut,
        retry: false,
      })
      const out: WorkerResult = {
        taskId: task.id,
        state: timedOut ? "timed_out" : "failed",
        error: msg,
        replayed: false,
      }
      this.cache.set(idempotencyKey, out)
      return out
    }
  }
}

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`task timed out after ${ms}ms`)
    this.name = "TimeoutError"
  }
}

async function withTimeout<T>(input: Promise<T>, timeoutMs: number): Promise<T> {
  const timer = new Promise<T>((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(timeoutMs))
    }, timeoutMs)
  })
  return Promise.race([input, timer])
}
