import z from "zod"
import { RepairStep, RepairStatus } from "../runtime/auto-repair"
import { RepairTrigger } from "../runtime/error-taxonomy"

export const RuntimeRepairEvent = z.object({
  event: z.literal("runtime_repair"),
  correlation_id: z.string(),
  trigger: RepairTrigger,
  strike: z.number().int().nonnegative(),
  step: RepairStep,
  status: RepairStatus,
  write_locked: z.boolean(),
  policy_decision: z.enum(["allow", "deny", "notify", "confirm"]),
  ts: z.number().int().nonnegative(),
})
export type RuntimeRepairEvent = z.infer<typeof RuntimeRepairEvent>

export namespace RuntimeRepairMetrics {
  export function build(input: Omit<RuntimeRepairEvent, "event" | "ts">): RuntimeRepairEvent {
    return RuntimeRepairEvent.parse({
      event: "runtime_repair",
      ...input,
      ts: Date.now(),
    })
  }
}
