export type TaskCommandIntent =
  | { kind: "list" }
  | { kind: "new" }
  | { kind: "help" }
  | { kind: "show"; taskId: string }
  | { kind: "edit"; taskId: string }
  | { kind: "runs"; taskId: string }
  | { kind: "dlq" }
  | { kind: "pause"; taskId: string }
  | { kind: "resume"; taskId: string }
  | { kind: "run"; taskId: string }
  | { kind: "delete"; taskId: string }

export type TaskCommandParseResult = { ok: true; intent: TaskCommandIntent } | { ok: false; error: string }

export type TaskCommandHandlers = {
  list: () => void
  new: () => void
  help: () => void
  show: (taskId: string) => void
  edit: (taskId: string) => void
  runs: (taskId: string) => void
  dlq: () => void
  pause: (taskId: string) => void
  resume: (taskId: string) => void
  run: (taskId: string) => void
  delete: (taskId: string) => void
}

let handlers: TaskCommandHandlers | null = null

export function setTaskCommandHandlers(input: TaskCommandHandlers): void {
  handlers = input
}

export function parseTasksCommand(input: string): TaskCommandParseResult {
  const text = input.trim()
  if (!/^\/tasks\b/i.test(text)) {
    return { ok: false, error: "command must start with /tasks" }
  }

  const match = /^\/tasks(?:\s+(\S+))?(?:\s+(.+))?$/i.exec(text)
  const sub = match?.[1]?.toLowerCase()
  const raw = match?.[2]?.trim()
  const selector =
    raw && ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
      ? raw.slice(1, -1).trim()
      : raw

  if (!sub || sub === "list") return { ok: true, intent: { kind: "list" } }
  if (sub === "new") return { ok: true, intent: { kind: "new" } }
  if (sub === "help") return { ok: true, intent: { kind: "help" } }
  if (sub === "dlq") return { ok: true, intent: { kind: "dlq" } }

  if (!selector) {
    return { ok: false, error: `missing task selector for /tasks ${sub}` }
  }

  if (sub === "show") return { ok: true, intent: { kind: "show", taskId: selector } }
  if (sub === "edit") return { ok: true, intent: { kind: "edit", taskId: selector } }
  if (sub === "runs") return { ok: true, intent: { kind: "runs", taskId: selector } }
  if (sub === "pause") return { ok: true, intent: { kind: "pause", taskId: selector } }
  if (sub === "resume") return { ok: true, intent: { kind: "resume", taskId: selector } }
  if (sub === "run") return { ok: true, intent: { kind: "run", taskId: selector } }
  if (sub === "delete") return { ok: true, intent: { kind: "delete", taskId: selector } }

  return { ok: false, error: `unsupported /tasks command: ${sub}` }
}

export function dispatchTaskCommand(intent: TaskCommandIntent, input?: TaskCommandHandlers): void {
  const cb = input ?? handlers
  if (!cb) {
    throw new Error("task command handlers not registered")
  }

  if (intent.kind === "list") return cb.list()
  if (intent.kind === "new") return cb.new()
  if (intent.kind === "help") return cb.help()
  if (intent.kind === "show") return cb.show(intent.taskId)
  if (intent.kind === "edit") return cb.edit(intent.taskId)
  if (intent.kind === "runs") return cb.runs(intent.taskId)
  if (intent.kind === "dlq") return cb.dlq()
  if (intent.kind === "pause") return cb.pause(intent.taskId)
  if (intent.kind === "resume") return cb.resume(intent.taskId)
  if (intent.kind === "run") return cb.run(intent.taskId)
  return cb.delete(intent.taskId)
}
