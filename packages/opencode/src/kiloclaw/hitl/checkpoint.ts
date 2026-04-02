import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import type { Action } from "../types"
import { ApprovalType } from "./approval"

// Checkpoint identifier
export type CheckpointId = string & { __brand: "CheckpointId" }

// HitL checkpoint interface
export interface HitlCheckpoint {
  readonly id: CheckpointId
  readonly action: Action
  readonly riskLevel: "low" | "medium" | "high" | "critical"
  readonly requiredApproval: ApprovalType
  block(): Promise<ApprovalResult>
  isBlocked(): boolean
}

// Approval result
export interface ApprovalResult {
  readonly approved: boolean
  readonly approvedBy?: string
  readonly timestamp: Date
  readonly reason?: string
}

// Checkpoint registry entry
interface CheckpointEntry {
  checkpoint: HitlCheckpoint
  blockedAt: Date
  action: Action
  context: ActionContext
}

// Action context for evaluation
interface ActionContext {
  readonly userId?: string
  readonly sessionId: string
  readonly agencyId?: string
  readonly agentId?: string
  readonly toolIds: string[]
  readonly dataClassification: string[]
  readonly correlationId: string
}

// Checkpoint registry - manages all active checkpoints
export class CheckpointRegistry {
  private readonly log: ReturnType<typeof Log.create>
  private readonly checkpoints: Map<CheckpointId, CheckpointEntry>
  private readonly pendingApprovals: Map<CheckpointId, Promise<ApprovalResult>>

  constructor() {
    this.log = Log.create({ service: "kiloclaw.hitl.checkpoint" })
    this.checkpoints = new Map()
    this.pendingApprovals = new Map()
  }

  // Create and register a new checkpoint
  createCheckpoint(input: {
    id: string
    action: Action
    context: ActionContext
    riskLevel: "low" | "medium" | "high" | "critical"
    requiredApproval: ApprovalType
    blockFn: (checkpoint: HitlCheckpoint) => Promise<ApprovalResult>
  }): HitlCheckpoint {
    const checkpoint: HitlCheckpoint = {
      id: input.id as CheckpointId,
      action: input.action,
      riskLevel: input.riskLevel,
      requiredApproval: input.requiredApproval,
      isBlocked: () => this.isBlocked(input.id as CheckpointId),
      block: async () => {
        this.markBlocked(input.id as CheckpointId, input.action, input.context)
        const result = await input.blockFn(checkpoint)
        this.markResolved(input.id as CheckpointId)
        return result
      },
    }

    this.checkpoints.set(checkpoint.id, {
      checkpoint,
      blockedAt: new Date(),
      action: input.action,
      context: input.context,
    })

    this.log.info("checkpoint created", {
      checkpointId: checkpoint.id,
      actionType: input.action.type,
      riskLevel: input.riskLevel,
    })

    return checkpoint
  }

  // Check if a checkpoint is blocked
  isBlocked(checkpointId: CheckpointId): boolean {
    const entry = this.checkpoints.get(checkpointId)
    return entry !== undefined && this.pendingApprovals.has(checkpointId)
  }

  // Mark a checkpoint as blocked
  private markBlocked(checkpointId: CheckpointId, action: Action, context: ActionContext): void {
    this.log.debug("checkpoint marked as blocked", { checkpointId })
  }

  // Mark a checkpoint as resolved
  private markResolved(checkpointId: CheckpointId): void {
    this.pendingApprovals.delete(checkpointId)
    this.log.debug("checkpoint resolved", { checkpointId })
  }

  // Get a checkpoint by ID
  getCheckpoint(checkpointId: CheckpointId): HitlCheckpoint | undefined {
    return this.checkpoints.get(checkpointId)?.checkpoint
  }

  // Get all blocked checkpoints
  getBlockedCheckpoints(): HitlCheckpoint[] {
    return [...this.checkpoints.entries()]
      .filter(([id]) => this.pendingApprovals.has(id))
      .map(([, entry]) => entry.checkpoint)
  }

  // Get all checkpoints
  getAllCheckpoints(): HitlCheckpoint[] {
    return [...this.checkpoints.values()].map((entry) => entry.checkpoint)
  }

  // Remove a checkpoint
  remove(checkpointId: CheckpointId): void {
    this.checkpoints.delete(checkpointId)
    this.pendingApprovals.delete(checkpointId)
    this.log.info("checkpoint removed", { checkpointId })
  }

  // Clear all checkpoints
  clear(): void {
    this.checkpoints.clear()
    this.pendingApprovals.clear()
    this.log.info("checkpoint registry cleared")
  }
}

// Factory function
export const CheckpointRegistry$ = {
  create: fn(z.object({}), () => new CheckpointRegistry()),
}

// Default checkpoint factory
export namespace Checkpoint {
  export function create(input: {
    id: string
    action: Action
    riskLevel: "low" | "medium" | "high" | "critical"
    requiredApproval: ApprovalType
  }): Omit<HitlCheckpoint, "block"> {
    return {
      id: input.id as CheckpointId,
      action: input.action,
      riskLevel: input.riskLevel,
      requiredApproval: input.requiredApproval,
      isBlocked: () => false,
    }
  }
}

// Helper to determine if action requires checkpoint
export function requiresCheckpoint(action: Action, riskLevel: string): boolean {
  const highRiskLevels = ["high", "critical"]
  return highRiskLevels.includes(riskLevel)
}

// Helper to determine required approval type based on risk
export function getRequiredApprovalType(riskLevel: "low" | "medium" | "high" | "critical"): ApprovalType {
  switch (riskLevel) {
    case "critical":
      return "dual_gate"
    case "high":
      return "explicit"
    case "medium":
      return "implicit"
    default:
      return "implicit"
  }
}
