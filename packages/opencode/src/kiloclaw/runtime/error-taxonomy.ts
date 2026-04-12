import z from "zod"

export const RepairTrigger = z.enum([
  "runtime.exception",
  "build.fail",
  "test.fail",
  "policy.block",
  "tool.contract.fail",
])
export type RepairTrigger = z.infer<typeof RepairTrigger>

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
