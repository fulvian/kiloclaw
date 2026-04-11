import { describe, expect, it } from "bun:test"
import { dispatchTaskCommand, parseTasksCommand } from "../../src/cli/cmd/tui/task-command-router"

describe("tui task command router", () => {
  it("parses list/new/help commands", () => {
    expect(parseTasksCommand("/tasks")).toEqual({ ok: true, intent: { kind: "list" } })
    expect(parseTasksCommand("/tasks list")).toEqual({ ok: true, intent: { kind: "list" } })
    expect(parseTasksCommand("/tasks new")).toEqual({ ok: true, intent: { kind: "new" } })
    expect(parseTasksCommand("/tasks help")).toEqual({ ok: true, intent: { kind: "help" } })
  })

  it("parses id-based actions", () => {
    expect(parseTasksCommand("/tasks show t1")).toEqual({ ok: true, intent: { kind: "show", taskId: "t1" } })
    expect(parseTasksCommand("/tasks edit t1")).toEqual({ ok: true, intent: { kind: "edit", taskId: "t1" } })
    expect(parseTasksCommand("/tasks runs t1")).toEqual({ ok: true, intent: { kind: "runs", taskId: "t1" } })
    expect(parseTasksCommand("/tasks pause t1")).toEqual({ ok: true, intent: { kind: "pause", taskId: "t1" } })
    expect(parseTasksCommand("/tasks resume t1")).toEqual({ ok: true, intent: { kind: "resume", taskId: "t1" } })
    expect(parseTasksCommand("/tasks run t1")).toEqual({ ok: true, intent: { kind: "run", taskId: "t1" } })
    expect(parseTasksCommand("/tasks delete t1")).toEqual({ ok: true, intent: { kind: "delete", taskId: "t1" } })
  })

  it("parses selectors with spaces and quotes", () => {
    expect(parseTasksCommand("/tasks show weekly report check")).toEqual({
      ok: true,
      intent: { kind: "show", taskId: "weekly report check" },
    })
    expect(parseTasksCommand('/tasks edit "weekly report check"')).toEqual({
      ok: true,
      intent: { kind: "edit", taskId: "weekly report check" },
    })
    expect(parseTasksCommand("/tasks run #1")).toEqual({ ok: true, intent: { kind: "run", taskId: "#1" } })
  })

  it("accepts mixed case command prefix", () => {
    expect(parseTasksCommand("/Tasks delete #1")).toEqual({ ok: true, intent: { kind: "delete", taskId: "#1" } })
    expect(parseTasksCommand("   /TASKS show tsk_abcd1234   ")).toEqual({
      ok: true,
      intent: { kind: "show", taskId: "tsk_abcd1234" },
    })
  })

  it("returns parse errors for unsupported input", () => {
    const noId = parseTasksCommand("/tasks show")
    expect(noId.ok).toBe(false)
    const unsupported = parseTasksCommand("/tasks unknown")
    expect(unsupported.ok).toBe(false)
  })

  it("dispatches parsed intents to matching handler", () => {
    const calls: string[] = []
    const handlers = {
      list: () => calls.push("list"),
      new: () => calls.push("new"),
      help: () => calls.push("help"),
      show: (id: string) => calls.push(`show:${id}`),
      edit: (id: string) => calls.push(`edit:${id}`),
      runs: (id: string) => calls.push(`runs:${id}`),
      dlq: () => calls.push("dlq"),
      pause: (id: string) => calls.push(`pause:${id}`),
      resume: (id: string) => calls.push(`resume:${id}`),
      run: (id: string) => calls.push(`run:${id}`),
      delete: (id: string) => calls.push(`delete:${id}`),
    }

    dispatchTaskCommand({ kind: "list" }, handlers)
    dispatchTaskCommand({ kind: "show", taskId: "abc" }, handlers)
    dispatchTaskCommand({ kind: "run", taskId: "abc" }, handlers)
    dispatchTaskCommand({ kind: "delete", taskId: "abc" }, handlers)

    expect(calls).toEqual(["list", "show:abc", "run:abc", "delete:abc"])
  })
})
