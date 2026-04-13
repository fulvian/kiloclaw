import z from "zod"
import { Log } from "@/util/log"

const log = Log.create({ service: "kiloclaw.error-taxonomy" })

export const RepairTrigger = z.enum([
  "runtime.exception",
  "build.fail",
  "test.fail",
  "policy.block",
  "tool.contract.fail",
])
export type RepairTrigger = z.infer<typeof RepairTrigger>

// FIX 8: New ErrorCategory and ErrorSeverity types
export type ErrorCategory = "exception" | "build_fail" | "test_fail" | "policy_block" | "tool_contract_fail"
export type ErrorSeverity = "low" | "medium" | "high" | "critical"

export interface ClassifiedError {
  category: ErrorCategory
  severity: ErrorSeverity
  message: string
  stackTrace?: string
  timestamp: Date
  correlationId: string
}

export const TaxonomyInput = z.object({
  trigger: z.string().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
})
export type TaxonomyInput = z.infer<typeof TaxonomyInput>

export namespace ErrorTaxonomy {
  export function classify(raw: TaxonomyInput): RepairTrigger {
    const input = TaxonomyInput.parse(raw)
    const explicit = input.trigger ?? ""
    if (RepairTrigger.options.includes(explicit as RepairTrigger)) return explicit as RepairTrigger

    const msg = `${input.message ?? ""} ${input.code ?? ""}`.toLowerCase()
    if (msg.includes("policy") && (msg.includes("deny") || msg.includes("denied") || msg.includes("block")))
      return "policy.block"
    if ((msg.includes("build") || msg.includes("compile") || msg.includes("typecheck")) && msg.includes("fail"))
      return "build.fail"
    if ((msg.includes("test") || msg.includes("spec")) && msg.includes("fail")) return "test.fail"
    if (msg.includes("contract") || msg.includes("schema") || msg.includes("validation")) return "tool.contract.fail"
    return "runtime.exception"
  }
}

// FIX 8: New function to classify errors with severity
export function classifyError(error: unknown, correlationId: string): ClassifiedError {
  if (!(error instanceof Error)) {
    return {
      category: "exception",
      severity: "medium",
      message: String(error),
      timestamp: new Date(),
      correlationId,
    }
  }

  const msg = error.message.toLowerCase()
  const stack = error.stack || ""

  // Build failures
  if (msg.includes("build") || msg.includes("compile") || msg.includes("enoent")) {
    return {
      category: "build_fail",
      severity: msg.includes("critical") ? "critical" : "high",
      message: error.message,
      stackTrace: stack,
      timestamp: new Date(),
      correlationId,
    }
  }

  // Test failures
  if (msg.includes("test") || msg.includes("spec") || msg.includes("assertion")) {
    return {
      category: "test_fail",
      severity: "medium",
      message: error.message,
      stackTrace: stack,
      timestamp: new Date(),
      correlationId,
    }
  }

  // Policy blocks
  if (msg.includes("policy") || msg.includes("deny") || msg.includes("permission")) {
    return {
      category: "policy_block",
      severity: "high",
      message: error.message,
      timestamp: new Date(),
      correlationId,
    }
  }

  // Tool contract failures
  if (msg.includes("contract") || msg.includes("schema") || msg.includes("validation")) {
    return {
      category: "tool_contract_fail",
      severity: "high",
      message: error.message,
      stackTrace: stack,
      timestamp: new Date(),
      correlationId,
    }
  }

  // Default to exception
  return {
    category: "exception",
    severity: msg.includes("critical") ? "critical" : "medium",
    message: error.message,
    stackTrace: stack,
    timestamp: new Date(),
    correlationId,
  }
}
