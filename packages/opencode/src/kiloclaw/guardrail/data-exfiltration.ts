import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import type { Action } from "../types"
import { DataClassification, RISK_THRESHOLDS } from "../policy/rules"
import type { Guardrail, GuardrailResult, ActionContext } from "../policy/rules"

// PII detection patterns
interface PIIPattern {
  name: string
  pattern: RegExp
  classification: DataClassification
}

// PII detection patterns for common sensitive data
const PII_PATTERNS: PIIPattern[] = [
  {
    name: "email",
    pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
    classification: "P1_High",
  },
  {
    name: "phone",
    pattern: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/,
    classification: "P1_High",
  },
  {
    name: "ssn",
    pattern: /\b\d{3}-\d{2}-\d{4}\b/,
    classification: "P0_Critical",
  },
  {
    name: "credit_card",
    pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
    classification: "P0_Critical",
  },
  {
    name: "ip_address",
    pattern: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
    classification: "P2_Medium",
  },
  {
    name: "password",
    pattern: /(password|pwd|pass)\s*[=:]\s*\S+/i,
    classification: "P0_Critical",
  },
  {
    name: "api_key",
    pattern: /(api[_-]?key|secret|token)\s*[=:]\s*['"]?[a-zA-Z0-9_-]{20,}['"]?/i,
    classification: "P0_Critical",
  },
]

// Detected data structure
interface DetectedData {
  name: string
  pattern: string
  classification: DataClassification
  source: string
}

// Exfiltration audit entry
interface ExfiltrationEntry {
  timestamp: Date
  correlationId: string
  actionType: string
  decision: "blocked" | "escalated" | "approved"
  detectedData: Array<{ name: string; classification: DataClassification }>
}

// Data exfiltration guardrail - prevents sensitive data from leaving the system
export class DataExfiltrationGuardrail implements Guardrail {
  readonly id: string
  readonly name: string
  readonly type: "static" | "dynamic" = "static"
  private readonly log: ReturnType<typeof Log.create>
  private readonly auditLog: ExfiltrationEntry[]
  private blockOnClassification: DataClassification[]
  private readonly maskData: boolean

  constructor(options: { blockOnClassification?: DataClassification[]; maskData?: boolean } = {}) {
    this.id = "data-exfiltration-guardrail"
    this.name = "Data Exfiltration Guardrail"
    this.log = Log.create({ service: "kiloclaw.guardrail.exfiltration" })
    this.auditLog = []
    this.blockOnClassification = options.blockOnClassification ?? ["P0_Critical", "P1_High"]
    this.maskData = options.maskData ?? true
  }

  // Evaluate action for potential data exfiltration
  evaluate(context: ActionContext, action: Action): GuardrailResult {
    this.log.info("evaluating data exfiltration risk", {
      actionType: action.type,
      correlationId: context.correlationId,
    })

    // Check if action involves external transmission
    if (!this.isExternalAction(action)) {
      return {
        allowed: true,
        reason: "action does not involve external transmission",
        escalationRequired: false,
      }
    }

    // Check data classifications in context
    const sensitiveData = this.detectSensitiveData(context)

    if (sensitiveData.length === 0) {
      return {
        allowed: true,
        reason: "no sensitive data detected",
        escalationRequired: false,
      }
    }

    // Check if any detected data should be blocked
    const shouldBlock = sensitiveData.some((d) => this.blockOnClassification.includes(d.classification))

    if (shouldBlock) {
      const criticalItems = sensitiveData.filter((d) => d.classification === "P0_Critical").map((d) => d.name)
      this.log.warn("data exfiltration blocked", { criticalItems })
      this.logExfiltration(context, action, "blocked", sensitiveData)

      return {
        allowed: false,
        reason: `critical data detected: ${criticalItems.join(", ")}`,
        riskScore: 0.95,
        escalationRequired: true,
      }
    }

    // Medium risk - log and allow with masking suggestion
    const mediumItems = sensitiveData.filter((d) => d.classification === "P1_High").map((d) => d.name)
    this.log.warn("high-risk data detected", { dataTypes: mediumItems })
    this.logExfiltration(context, action, "escalated", sensitiveData)

    return {
      allowed: true,
      reason: `sensitive data detected: ${mediumItems.join(", ")} - enhanced logging applied`,
      riskScore: 0.6,
      escalationRequired: true,
    }
  }

  // Check if action involves external transmission
  private isExternalAction(action: Action): boolean {
    const actionType = action.type.toLowerCase()
    const externalIndicators = [
      "http",
      "api",
      "external",
      "network",
      "send",
      "transmit",
      "upload",
      "post",
      "put",
      "fetch",
      "request",
    ]
    return externalIndicators.some((indicator) => actionType.includes(indicator))
  }

  // Detect sensitive data in action parameters and context
  private detectSensitiveData(context: ActionContext): DetectedData[] {
    const detected: DetectedData[] = []

    // Check action parameters for PII patterns
    if (context.toolIds) {
      for (const toolId of context.toolIds) {
        // Check tool ID for sensitive patterns
        for (const pii of PII_PATTERNS) {
          if (pii.pattern.test(toolId)) {
            detected.push({
              name: pii.name,
              pattern: pii.name,
              classification: pii.classification,
              source: "toolId",
            })
          }
        }
      }
    }

    // Check data classifications in context
    for (const classification of context.dataClassification) {
      detected.push({
        name: classification,
        pattern: classification,
        classification: classification as DataClassification,
        source: "context",
      })
    }

    return detected
  }

  // Log exfiltration attempt
  private logExfiltration(
    context: ActionContext,
    action: Action,
    decision: "blocked" | "escalated" | "approved",
    data: DetectedData[],
  ): void {
    this.auditLog.push({
      timestamp: new Date(),
      correlationId: context.correlationId,
      actionType: action.type,
      decision,
      detectedData: data.map((d) => ({ name: d.name, classification: d.classification })),
    })
  }

  // Get audit log
  getAuditLog(): ReadonlyArray<ExfiltrationEntry> {
    return [...this.auditLog]
  }

  // Update block list
  setBlockList(classifications: DataClassification[]): void {
    this.blockOnClassification = classifications
    this.log.info("block list updated", { classifications })
  }
}

// Factory function
export const DataExfiltrationGuardrail$ = {
  create: fn(
    z.object({
      blockOnClassification: z.array(DataClassification).optional(),
      maskData: z.boolean().optional(),
    }),
    (options) => new DataExfiltrationGuardrail(options),
  ),
}
