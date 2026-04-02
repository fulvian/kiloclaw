import { Log } from "@/util/log"
import type { Action } from "../types"

// Irreversible action types
export const IRREVERSIBLE_ACTIONS = [
  "delete_data",
  "drop_table",
  "drop_database",
  "drop_collection",
  "delete_file",
  "delete_directory",
  "remove_file",
  "remove_directory",
  "destroy_data",
  "purge_data",
  "purge_cache",
  "clear_logs",
  "reset_config",
  "reset_state",
  "terminate_process",
  "kill_process",
  "cancel_subscription",
  "revoke_access",
  "revoke_permission",
  "revoke_certificate",
  "delete_certificate",
  "remove_certificate",
  "destroy_keys",
  "delete_keys",
  "wipe_data",
  "factory_reset",
  "force_logout",
  "invalidate_session",
  "revoke_token",
  "delete_account",
  "remove_account",
  "delete_user",
  "remove_user",
  "drop_index",
  "drop_view",
  "drop_function",
  "drop_procedure",
  "uninstall",
  "remove_package",
  "delete_package",
  "drop_schema",
  "drop_repository",
  "delete_repository",
  "remove_repository",
  "destroy_volume",
  "delete_volume",
  "remove_volume",
  "teardown_infrastructure",
  "destroy_infrastructure",
] as const

// Type for irreversible actions
export type IrreversibleAction = (typeof IRREVERSIBLE_ACTIONS)[number]

// Action classification
export interface ActionClassification {
  readonly isReversible: boolean
  readonly isDestructive: boolean
  readonly isPrivacySensitive: boolean
  readonly riskLevel: "low" | "medium" | "high" | "critical"
  readonly category: string
}

// Check if an action is irreversible
export function isIrreversible(action: Action | string): boolean {
  const actionType = typeof action === "string" ? action : action.type
  return IRREVERSIBLE_ACTIONS.some((irrev) => actionType.toLowerCase().includes(irrev.toLowerCase()))
}

// Classify an action
export function classifyAction(action: Action): ActionClassification {
  const actionType = action.type.toLowerCase()
  const irreversible = isIrreversible(action)

  // Check for destructive patterns
  const destructivePatterns = ["delete", "drop", "remove", "destroy", "purge", "wipe", "reset", "kill", "terminate"]
  const isDestructive = destructivePatterns.some((p) => actionType.includes(p))

  // Check for privacy-sensitive patterns
  const privacyPatterns = ["personal", "private", "secret", "credential", "password", "token", "key", "ssn", "credit"]
  const isPrivacySensitive = privacyPatterns.some((p) => actionType.includes(p))

  // Determine risk level
  let riskLevel: "low" | "medium" | "high" | "critical"
  if (irreversible) {
    riskLevel = "critical"
  } else if (isDestructive && isPrivacySensitive) {
    riskLevel = "high"
  } else if (isDestructive) {
    riskLevel = "medium"
  } else if (isPrivacySensitive) {
    riskLevel = "medium"
  } else {
    riskLevel = "low"
  }

  // Determine category
  let category = "other"
  if (actionType.includes("file") || actionType.includes("fs") || actionType.includes("directory")) {
    category = "filesystem"
  } else if (actionType.includes("database") || actionType.includes("db") || actionType.includes("table")) {
    category = "database"
  } else if (actionType.includes("network") || actionType.includes("http") || actionType.includes("api")) {
    category = "network"
  } else if (actionType.includes("user") || actionType.includes("account") || actionType.includes("permission")) {
    category = "identity"
  } else if (actionType.includes("process") || actionType.includes("service") || actionType.includes("container")) {
    category = "process"
  }

  return {
    isReversible: !irreversible,
    isDestructive,
    isPrivacySensitive,
    riskLevel,
    category,
  }
}

// Check if action requires explicit confirmation
export function requiresExplicitConfirmation(action: Action): boolean {
  return isIrreversible(action) || classifyAction(action).riskLevel === "critical"
}

// Check if action should be blocked by default
export function shouldBlockByDefault(action: Action): boolean {
  const classification = classifyAction(action)
  return classification.riskLevel === "critical" && !classification.isReversible
}

// Get safety recommendation for an action
export function getSafetyRecommendation(action: Action): {
  canProceed: boolean
  requiresApproval: boolean
  approvalType: "implicit" | "explicit" | "dual_gate"
  message: string
} {
  const classification = classifyAction(action)

  if (shouldBlockByDefault(action)) {
    return {
      canProceed: false,
      requiresApproval: true,
      approvalType: "dual_gate",
      message: `Action '${action.type}' is irreversible and high-risk. Requires dual-gate approval.`,
    }
  }

  if (requiresExplicitConfirmation(action)) {
    return {
      canProceed: true,
      requiresApproval: true,
      approvalType: "explicit",
      message: `Action '${action.type}' requires explicit approval before execution.`,
    }
  }

  if (classification.isDestructive) {
    return {
      canProceed: true,
      requiresApproval: true,
      approvalType: "implicit",
      message: `Action '${action.type}' is destructive. User confirmation required.`,
    }
  }

  return {
    canProceed: true,
    requiresApproval: false,
    approvalType: "implicit",
    message: `Action '${action.type}' is low risk and can proceed.`,
  }
}

// Namespace
export namespace IrreversibleActions {
  export function isKnown(action: string): boolean {
    return IRREVERSIBLE_ACTIONS.some((irrev) => action.toLowerCase().includes(irrev.toLowerCase()))
  }

  export function getAll(): readonly string[] {
    return IRREVERSIBLE_ACTIONS
  }

  export function getByCategory(category: string): string[] {
    const patterns: Record<string, string[]> = {
      filesystem: ["file", "directory", "folder"],
      database: ["table", "database", "collection", "index", "view"],
      identity: ["user", "account", "permission", "access", "certificate", "token"],
      process: ["process", "service", "container", "pod"],
      network: ["network", "firewall", "route", "gateway"],
    }

    const keywords = patterns[category] ?? []
    return IRREVERSIBLE_ACTIONS.filter((action) => keywords.some((k) => action.includes(k)))
  }
}

// Logger for the module
const log = Log.create({ service: "kiloclaw.hitl.irreversible" })

// Log classification on import (debug only in development)
if (process.env.NODE_ENV !== "production") {
  log.debug("irreversible actions module loaded", { count: IRREVERSIBLE_ACTIONS.length })
}
