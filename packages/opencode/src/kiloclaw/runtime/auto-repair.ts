import z from "zod"
import { RepairTrigger } from "./error-taxonomy"

export const RepairStatus = z.enum(["active", "closed", "halted"])
export type RepairStatus = z.infer<typeof RepairStatus>

export const RepairStep = z.enum(["detect", "classify", "plan", "patch", "verify", "decide", "close", "halt"])
export type RepairStep = z.infer<typeof RepairStep>

export const RepairAttempt = z.object({
  strike: z.number().int().nonnegative(),
  trigger: RepairTrigger,
  success: z.boolean(),
  step: RepairStep,
  note: z.string().optional(),
  ts: z.number().int().nonnegative(),
})
export type RepairAttempt = z.infer<typeof RepairAttempt>

export const RepairState = z.object({
  correlation_id: z.string(),
  strike: z.number().int().nonnegative(),
  max_strike: z.number().int().positive().default(3),
  status: RepairStatus.default("active"),
  write_locked: z.boolean().default(false),
  history: z.array(RepairAttempt).default([]),
})
export type RepairState = z.infer<typeof RepairState>

export namespace AutoRepair {
  export function start(input: { correlation_id: string; max_strike?: number }): RepairState {
    return RepairState.parse({
      correlation_id: input.correlation_id,
      strike: 0,
      max_strike: input.max_strike ?? 3,
      status: "active",
      write_locked: false,
      history: [],
    })
  }

  export function next(
    stateRaw: RepairState,
    input: { trigger: z.infer<typeof RepairTrigger>; success: boolean; note?: string },
  ): RepairState {
    const state = RepairState.parse(stateRaw)
    if (state.status !== "active") return state

    const nextStrike = input.success ? state.strike : state.strike + 1
    const reachedCap = !input.success && nextStrike >= state.max_strike
    const status: RepairStatus = input.success ? "closed" : reachedCap ? "halted" : "active"
    const step: RepairStep = input.success ? "close" : reachedCap ? "halt" : "decide"
    const attempt = RepairAttempt.parse({
      strike: nextStrike,
      trigger: input.trigger,
      success: input.success,
      step,
      note: input.note,
      ts: Date.now(),
    })

    return RepairState.parse({
      ...state,
      strike: nextStrike,
      status,
      write_locked: reachedCap,
      history: [...state.history, attempt],
    })
  }

  export function canWrite(stateRaw: RepairState): boolean {
    const state = RepairState.parse(stateRaw)
    return !state.write_locked
  }
}
