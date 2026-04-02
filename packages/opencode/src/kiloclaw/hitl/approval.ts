import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"

// Approval types
export const ApprovalType = z.enum(["implicit", "explicit", "dual_gate"])
export type ApprovalType = z.infer<typeof ApprovalType>

// Approval result structure
export interface ApprovalResult {
  readonly approved: boolean
  readonly approvedBy?: string
  readonly timestamp: Date
  readonly reason?: string
}

// Approval request structure
export interface ApprovalRequest {
  readonly id: string
  readonly action: string
  readonly description: string
  readonly approvalType: ApprovalType
  readonly requestedAt: Date
  readonly requestedBy: string
  readonly expiresAt?: Date
}

// Approval response structure
export interface ApprovalResponse {
  readonly requestId: string
  readonly decision: "approved" | "rejected" | "delegated"
  readonly approvedBy?: string
  readonly timestamp: Date
  readonly reason?: string
}

// Approval handler - manages the approval workflow
export class ApprovalHandler {
  private readonly log: ReturnType<typeof Log.create>
  private readonly requests: Map<string, ApprovalRequest>
  private readonly responses: Map<string, ApprovalResponse>

  constructor() {
    this.log = Log.create({ service: "kiloclaw.hitl.approval" })
    this.requests = new Map()
    this.responses = new Map()
  }

  // Create an approval request
  createRequest(input: {
    id: string
    action: string
    description: string
    approvalType: ApprovalType
    requestedBy: string
    expiresInMs?: number
  }): ApprovalRequest {
    const request: ApprovalRequest = {
      id: input.id,
      action: input.action,
      description: input.description,
      approvalType: input.approvalType,
      requestedAt: new Date(),
      requestedBy: input.requestedBy,
      expiresAt: input.expiresInMs ? new Date(Date.now() + input.expiresInMs) : undefined,
    }

    this.requests.set(request.id, request)
    this.log.info("approval request created", {
      requestId: request.id,
      action: request.action,
      approvalType: request.approvalType,
    })

    return request
  }

  // Submit approval response
  submitResponse(response: ApprovalResponse): void {
    this.responses.set(response.requestId, response)

    const request = this.requests.get(response.requestId)
    if (request) {
      this.log.info("approval response submitted", {
        requestId: response.requestId,
        decision: response.decision,
        approvedBy: response.approvedBy,
      })
    }
  }

  // Get approval request by ID
  getRequest(requestId: string): ApprovalRequest | undefined {
    return this.requests.get(requestId)
  }

  // Get approval response by request ID
  getResponse(requestId: string): ApprovalResponse | undefined {
    return this.responses.get(requestId)
  }

  // Check if request has been responded to
  isResolved(requestId: string): boolean {
    return this.responses.has(requestId)
  }

  // Check if request is expired
  isExpired(requestId: string): boolean {
    const request = this.requests.get(requestId)
    if (!request?.expiresAt) return false
    return new Date() > request.expiresAt
  }

  // Get pending requests
  getPendingRequests(): ApprovalRequest[] {
    return [...this.requests.values()].filter((r) => !this.responses.has(r.id))
  }

  // Approve request (convenience method)
  approve(requestId: string, approvedBy: string, reason?: string): void {
    this.submitResponse({
      requestId,
      decision: "approved",
      approvedBy,
      timestamp: new Date(),
      reason,
    })
  }

  // Reject request (convenience method)
  reject(requestId: string, rejectedBy: string, reason?: string): void {
    this.submitResponse({
      requestId,
      decision: "rejected",
      approvedBy: rejectedBy,
      timestamp: new Date(),
      reason,
    })
  }

  // Delegate request (convenience method)
  delegate(requestId: string, delegatedBy: string, reason?: string): void {
    this.submitResponse({
      requestId,
      decision: "delegated",
      approvedBy: delegatedBy,
      timestamp: new Date(),
      reason,
    })
  }

  // Get all requests for an action type
  getRequestsByAction(action: string): ApprovalRequest[] {
    return [...this.requests.values()].filter((r) => r.action === action)
  }

  // Clear all requests and responses
  clear(): void {
    this.requests.clear()
    this.responses.clear()
    this.log.info("approval handler cleared")
  }
}

// Factory function
export const ApprovalHandler$ = {
  create: fn(z.object({}), () => new ApprovalHandler()),
}

// Helper to determine approval type from action characteristics
export function determineApprovalType(input: {
  isIrreversible: boolean
  isHighRisk: boolean
  isCritical: boolean
}): ApprovalType {
  if (input.isCritical || input.isIrreversible) return "dual_gate"
  if (input.isHighRisk) return "explicit"
  return "implicit"
}

// Namespace with additional helpers
export namespace Approval {
  export const Type = ApprovalType

  export function createResult(input: { approved: boolean; approvedBy?: string; reason?: string }): ApprovalResult {
    return {
      approved: input.approved,
      approvedBy: input.approvedBy,
      timestamp: new Date(),
      reason: input.reason,
    }
  }

  export function isImplicit(type: ApprovalType): boolean {
    return type === "implicit"
  }

  export function isExplicit(type: ApprovalType): boolean {
    return type === "explicit"
  }

  export function isDualGate(type: ApprovalType): boolean {
    return type === "dual_gate"
  }
}
