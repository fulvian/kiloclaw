import z from "zod"

export const ParityContract = z.enum(["C1", "C2", "C3", "C4", "C5", "C6", "C7"])
export type ParityContract = z.infer<typeof ParityContract>

export const ParityEvent = z.object({
  event: z.literal("parity_check"),
  scenario_id: z.string(),
  contract_id: ParityContract,
  baseline_version: z.string(),
  score: z.number().min(0).max(1),
  passed: z.boolean(),
  details: z.record(z.string(), z.unknown()).default({}),
  ts: z.number().int().nonnegative(),
})
export type ParityEvent = z.infer<typeof ParityEvent>

export namespace ParityMetrics {
  export function build(input: Omit<ParityEvent, "event" | "ts">): ParityEvent {
    return ParityEvent.parse({
      event: "parity_check",
      ...input,
      ts: Date.now(),
    })
  }
}
