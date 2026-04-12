import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import z from "zod"

export const TuiEvent = {
  PromptAppend: BusEvent.define("tui.prompt.append", z.object({ text: z.string() })),
  CommandExecute: BusEvent.define(
    "tui.command.execute",
    z.object({
      command: z.union([
        z.enum([
          "session.list",
          "session.new",
          "session.share",
          "session.interrupt",
          "session.compact",
          "session.page.up",
          "session.page.down",
          "session.line.up",
          "session.line.down",
          "session.half.page.up",
          "session.half.page.down",
          "session.first",
          "session.last",
          "prompt.clear",
          "prompt.submit",
          "agent.cycle",
          "task.list",
          "task.new",
          "task.show",
          "task.edit",
          "task.pause",
          "task.resume",
          "task.run",
          "task.delete",
          "task.runs",
          "task.dlq",
          "task.replay",
          "task.help",
        ]),
        z.string(),
      ]),
    }),
  ),
  ToastShow: BusEvent.define(
    "tui.toast.show",
    z.object({
      title: z.string().optional(),
      message: z.string(),
      variant: z.enum(["info", "success", "warning", "error"]),
      duration: z.number().default(5000).optional().describe("Duration in milliseconds"),
    }),
  ),
  SessionSelect: BusEvent.define(
    "tui.session.select",
    z.object({
      sessionID: z.string().regex(/^ses/).describe("Session ID to navigate to"),
    }),
  ),
  TaskNavigate: BusEvent.define(
    "tui.task.navigate",
    z.object({
      action: z.enum(["list", "new", "show", "edit", "runs", "dlq"]),
      taskId: z.string().optional(),
      dlqId: z.string().optional(),
      advanced: z.boolean().optional(),
    }),
  ),
  TaskDraftSave: BusEvent.define(
    "tui.task.draft.save",
    z.object({
      draftId: z.string(),
      data: z.record(z.string(), z.unknown()),
    }),
  ),
  TaskDraftLoad: BusEvent.define(
    "tui.task.draft.load",
    z.object({
      draftId: z.string(),
    }),
  ),
  TaskDraftDelete: BusEvent.define(
    "tui.task.draft.delete",
    z.object({
      draftId: z.string(),
    }),
  ),
}
