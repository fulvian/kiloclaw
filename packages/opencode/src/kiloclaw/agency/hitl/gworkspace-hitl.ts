// Google Workspace HITL (Human-In-The-Loop) Protocol
// Handles high-risk operations that require user confirmation

import { Log } from "@/util/log"
import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import z from "zod"

// ============================================================================
// Types
// ============================================================================

export const HitlSeverity = z.enum(["high", "critical"])
export type HitlSeverity = z.infer<typeof HitlSeverity>

export const HitlStatus = z.enum(["pending", "approved", "denied", "expired", "cancelled"])
export type HitlStatus = z.infer<typeof HitlStatus>

const HitlRequestSchemaInternal = z.object({
  id: z.string(),
  agencyDomain: z.string(),
  service: z.string(),
  operation: z.string(),
  severity: HitlSeverity,
  description: z.string(),
  details: z.record(z.string(), z.unknown()),
  requestedAt: z.string(),
  expiresAt: z.string(),
  status: HitlStatus,
  userId: z.string().optional(),
  userEmail: z.string().optional(),
})
export type HitlRequest = z.infer<typeof HitlRequestSchemaInternal>

export const HitlResponseSchema = z.object({
  requestId: z.string(),
  approved: z.boolean(),
  reason: z.string().optional(),
  respondedAt: z.string(),
})
export type HitlResponse = z.infer<typeof HitlResponseSchema>

// ============================================================================
// Events
// ============================================================================

export const HitlRequestCreated = BusEvent.define("gworkspace.hitl.request.created", HitlRequestSchemaInternal)

export const HitlRequestApproved = BusEvent.define(
  "gworkspace.hitl.request.approved",
  z.object({
    requestId: z.string(),
    respondedAt: z.string(),
    reason: z.string().optional(),
  }),
)

export const HitlRequestDenied = BusEvent.define(
  "gworkspace.hitl.request.denied",
  z.object({
    requestId: z.string(),
    respondedAt: z.string(),
    reason: z.string(),
  }),
)

export const HitlRequestExpired = BusEvent.define(
  "gworkspace.hitl.request.expired",
  z.object({
    requestId: z.string(),
  }),
)

export const HitlRequested = BusEvent.define(
  "hitl.requested",
  z.object({
    agencyDomain: z.literal("gworkspace"),
    requestId: z.string(),
    service: z.string(),
    operation: z.string(),
    severity: HitlSeverity,
  }),
)

export const HitlCompleted = BusEvent.define(
  "hitl.completed",
  z.object({
    agencyDomain: z.literal("gworkspace"),
    requestId: z.string(),
    service: z.string(),
    operation: z.string(),
    outcome: z.enum(["approved", "denied", "expired", "cancelled"]),
  }),
)

// ============================================================================
// HITL Manager
// ============================================================================

export namespace GWorkspaceHITL {
  const log = Log.create({ service: "gworkspace.hitl" })

  // In-memory store for pending requests (in production, use persistent storage)
  const pendingRequests = new Map<string, HitlRequest>()
  const DEFAULT_TTL_MS = 15 * 60 * 1000 // 15 minutes
  const TERMINAL_RETENTION_MS = 60 * 1000

  function scheduleCleanup(requestId: string, ttlMs: number = TERMINAL_RETENTION_MS): void {
    setTimeout(() => {
      pendingRequests.delete(requestId)
    }, ttlMs)
  }

  /**
   * Generate a unique request ID
   */
  function generateId(): string {
    return `hitl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Check if an operation requires HITL
   */
  export function requiresHitl(service: string, operation: string, details: Record<string, unknown> = {}): boolean {
    // External email - requires confirmation
    if (service === "gmail" && operation === "messages.send") {
      const to = details.to as string[] | undefined
      if (to && to.length > 0) {
        // Check if any recipient is external (non-@google.com or non-configured domain)
        // For now, flag any send operation as needing confirmation
        return true
      }
    }

    // Bulk operations
    if (service === "gmail" && operation === "bulk_send") return true

    // External file sharing
    if (service === "drive" && operation === "files.share") {
      const email = details.email as string | undefined
      if (email) {
        // Check if email is external
        return true
      }
    }

    // Large calendar events with external attendees
    if (service === "calendar" && operation === "events.insert") {
      const attendees = details.attendees as string[] | undefined
      if (attendees && attendees.length > 20) return true
    }

    // Document write operations
    if (service === "docs" && operation === "documents.update") return true
    if (service === "sheets" && operation === "spreadsheets.values.update") return true

    return false
  }

  /**
   * Create a new HITL request
   */
  export async function createRequest(
    service: string,
    operation: string,
    severity: HitlSeverity,
    description: string,
    details: Record<string, unknown> = {},
    ttlMs: number = DEFAULT_TTL_MS,
  ): Promise<HitlRequest> {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + ttlMs)

    const request: HitlRequest = {
      id: generateId(),
      agencyDomain: "gworkspace",
      service,
      operation,
      severity,
      description,
      details,
      requestedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      status: "pending",
    }

    pendingRequests.set(request.id, request)

    log.info("HITL request created", {
      requestId: request.id,
      service,
      operation,
      severity,
    })

    // Publish event
    Bus.publish(HitlRequestCreated, request)
    Bus.publish(HitlRequested, {
      agencyDomain: "gworkspace",
      requestId: request.id,
      service,
      operation,
      severity,
    })

    // Set up expiration
    setTimeout(() => {
      const req = pendingRequests.get(request.id)
      if (req && req.status === "pending") {
        req.status = "expired"
        Bus.publish(HitlRequestExpired, { requestId: request.id })
        Bus.publish(HitlCompleted, {
          agencyDomain: "gworkspace",
          requestId: request.id,
          service: req.service,
          operation: req.operation,
          outcome: "expired",
        })
        log.info("HITL request expired", { requestId: request.id })
        scheduleCleanup(request.id)
      }
    }, ttlMs)

    return request
  }

  /**
   * Approve a HITL request
   */
  export async function approve(requestId: string, reason?: string): Promise<boolean> {
    const request = pendingRequests.get(requestId)
    if (!request) {
      log.warn("HITL request not found", { requestId })
      return false
    }

    if (request.status !== "pending") {
      log.warn("HITL request not pending", { requestId, status: request.status })
      return false
    }

    request.status = "approved"

    log.info("HITL request approved", { requestId, reason })

    Bus.publish(HitlRequestApproved, {
      requestId,
      respondedAt: new Date().toISOString(),
      reason,
    })
    Bus.publish(HitlCompleted, {
      agencyDomain: "gworkspace",
      requestId,
      service: request.service,
      operation: request.operation,
      outcome: "approved",
    })

    scheduleCleanup(requestId)

    return true
  }

  /**
   * Deny a HITL request
   */
  export async function deny(requestId: string, reason: string): Promise<boolean> {
    const request = pendingRequests.get(requestId)
    if (!request) {
      log.warn("HITL request not found", { requestId })
      return false
    }

    if (request.status !== "pending") {
      log.warn("HITL request not pending", { requestId, status: request.status })
      return false
    }

    request.status = "denied"

    log.info("HITL request denied", { requestId, reason })

    Bus.publish(HitlRequestDenied, {
      requestId,
      respondedAt: new Date().toISOString(),
      reason,
    })
    Bus.publish(HitlCompleted, {
      agencyDomain: "gworkspace",
      requestId,
      service: request.service,
      operation: request.operation,
      outcome: "denied",
    })

    scheduleCleanup(requestId)

    return true
  }

  /**
   * Cancel a HITL request
   */
  export async function cancel(requestId: string): Promise<boolean> {
    const request = pendingRequests.get(requestId)
    if (!request) {
      return false
    }

    request.status = "cancelled"

    log.info("HITL request cancelled", { requestId })
    Bus.publish(HitlCompleted, {
      agencyDomain: "gworkspace",
      requestId,
      service: request.service,
      operation: request.operation,
      outcome: "cancelled",
    })
    scheduleCleanup(requestId)
    return true
  }

  /**
   * Get pending requests
   */
  export function getPending(): HitlRequest[] {
    return Array.from(pendingRequests.values()).filter((r) => r.status === "pending")
  }

  /**
   * Get request by ID
   */
  export function getRequest(requestId: string): HitlRequest | undefined {
    return pendingRequests.get(requestId)
  }

  /**
   * Check if a request is approved
   */
  export function isApproved(requestId: string): boolean {
    const request = pendingRequests.get(requestId)
    return request?.status === "approved"
  }

  /**
   * Wait for HITL approval with timeout
   */
  export async function waitForApproval(requestId: string, timeoutMs: number = DEFAULT_TTL_MS): Promise<boolean> {
    return new Promise((resolve) => {
      const startTime = Date.now()

      const checkInterval = setInterval(() => {
        const request = pendingRequests.get(requestId)

        if (!request) {
          clearInterval(checkInterval)
          resolve(false)
          return
        }

        if (request.status === "approved") {
          clearInterval(checkInterval)
          resolve(true)
          return
        }

        if (request.status !== "pending") {
          clearInterval(checkInterval)
          resolve(false)
          return
        }

        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval)
          resolve(false)
        }
      }, 500)
    })
  }
}
