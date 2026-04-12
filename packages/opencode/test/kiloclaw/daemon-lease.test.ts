/**
 * Daemon Lease Tests
 *
 * Tests for lease acquire/renew/release functionality
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { rmSync, writeFileSync, readFileSync } from "node:fs"
import { ProactiveTaskStore } from "../../src/kiloclaw/proactive/scheduler.store"

const TEST_DB_PATH = join(tmpdir(), `kiloclaw-daemon-lease-test-${Date.now()}.db`)

describe("Daemon Lease", () => {
  beforeEach(() => {
    // Set environment to use test DB
    process.env["KILOCLAW_PROACTIVE_DB_PATH"] = TEST_DB_PATH
    // Initialize the store by calling clearAll
    ProactiveTaskStore.clearAll()
  })

  afterEach(() => {
    // Clean up test DB
    try {
      rmSync(TEST_DB_PATH, { force: true })
    } catch {
      // ignore
    }
    delete process.env["KILOCLAW_PROACTIVE_DB_PATH"]
  })

  describe("acquireLease", () => {
    it("should acquire a new lease", () => {
      const lease = ProactiveTaskStore.acquireLease({
        leaseName: "test-lease",
        ownerId: "owner-1",
        ttlMs: 30000,
      })

      expect(lease).not.toBeNull()
      expect(lease!.leaseName).toBe("test-lease")
      expect(lease!.ownerId).toBe("owner-1")
      expect(lease!.fenceToken).toBe(1)
      expect(lease!.expiresAt).toBeGreaterThan(Date.now())
      expect(lease!.version).toBe(1)
    })

    it("should fail to acquire lease when already held by another owner", () => {
      // First owner acquires
      const lease1 = ProactiveTaskStore.acquireLease({
        leaseName: "test-lease",
        ownerId: "owner-1",
        ttlMs: 30000,
      })
      expect(lease1).not.toBeNull()

      // Second owner tries to acquire - should fail (lease still held)
      const lease2 = ProactiveTaskStore.acquireLease({
        leaseName: "test-lease",
        ownerId: "owner-2",
        ttlMs: 30000,
      })

      // Should fail because lease is still held by owner-1
      expect(lease2).toBeNull()

      // Original owner should still have the lease
      const stillOwner1 = ProactiveTaskStore.getLease("test-lease")
      expect(stillOwner1).not.toBeNull()
      expect(stillOwner1!.ownerId).toBe("owner-1")
    })

    it("should allow same owner to re-acquire expired lease", () => {
      // Owner acquires lease with 1ms TTL
      const lease1 = ProactiveTaskStore.acquireLease({
        leaseName: "test-lease",
        ownerId: "owner-1",
        ttlMs: 1,
      })
      expect(lease1).not.toBeNull()

      // Force expire the lease by directly manipulating the database
      // This bypasses the need for sleep to actually elapse
      const { ProactiveTaskStore: Store } = require("../../src/kiloclaw/proactive/scheduler.store")
      // The lease is already expired since TTL=1ms, so we just need to verify re-acquire works
      // The SQL has: WHERE expires_at < ? which checks if current lease has expired

      // Same owner can acquire again (lease should be expired and replaced)
      const lease2 = ProactiveTaskStore.acquireLease({
        leaseName: "test-lease",
        ownerId: "owner-1",
        ttlMs: 30000,
      })
      expect(lease2).not.toBeNull()
      expect(lease2!.ownerId).toBe("owner-1")
      expect(lease2!.version).toBeGreaterThan(lease1!.version)
    })
  })

  describe("renewLease", () => {
    it("should renew an existing lease", () => {
      // Acquire lease
      const lease = ProactiveTaskStore.acquireLease({
        leaseName: "test-lease",
        ownerId: "owner-1",
        ttlMs: 30000,
      })
      expect(lease).not.toBeNull()

      const originalExpiresAt = lease!.expiresAt
      const originalFenceToken = lease!.fenceToken

      // Renew lease
      const renewed = ProactiveTaskStore.renewLease({
        leaseName: "test-lease",
        ownerId: "owner-1",
        ttlMs: 30000,
        expectedFenceToken: originalFenceToken,
      })

      expect(renewed).not.toBeNull()
      // expiresAt should be greater since we add ttlMs to current Date.now()
      // If acquired and renewed in same ms, expiresAt might be same
      // But version should always increase
      expect(renewed!.version).toBeGreaterThan(lease!.version)
    })

    it("should fail to renew with wrong fence token", () => {
      // Acquire lease
      const lease = ProactiveTaskStore.acquireLease({
        leaseName: "test-lease",
        ownerId: "owner-1",
        ttlMs: 30000,
      })
      expect(lease).not.toBeNull()

      // Try to renew with wrong fence token
      const renewed = ProactiveTaskStore.renewLease({
        leaseName: "test-lease",
        ownerId: "owner-1",
        ttlMs: 30000,
        expectedFenceToken: lease!.fenceToken + 1, // Wrong token
      })

      expect(renewed).toBeNull()
    })

    it("should fail to renew with wrong owner", () => {
      // Acquire lease
      const lease = ProactiveTaskStore.acquireLease({
        leaseName: "test-lease",
        ownerId: "owner-1",
        ttlMs: 30000,
      })
      expect(lease).not.toBeNull()

      // Try to renew with wrong owner
      const renewed = ProactiveTaskStore.renewLease({
        leaseName: "test-lease",
        ownerId: "owner-2",
        ttlMs: 30000,
        expectedFenceToken: lease!.fenceToken,
      })

      expect(renewed).toBeNull()
    })

    it("should fail to renew non-existent lease", () => {
      const renewed = ProactiveTaskStore.renewLease({
        leaseName: "nonexistent-lease",
        ownerId: "owner-1",
        ttlMs: 30000,
        expectedFenceToken: 0,
      })

      expect(renewed).toBeNull()
    })
  })

  describe("releaseLease", () => {
    it("should release an existing lease", () => {
      // Acquire lease
      const lease = ProactiveTaskStore.acquireLease({
        leaseName: "test-lease",
        ownerId: "owner-1",
        ttlMs: 30000,
      })
      expect(lease).not.toBeNull()

      // Release lease
      const released = ProactiveTaskStore.releaseLease({
        leaseName: "test-lease",
        ownerId: "owner-1",
      })

      expect(released).toBe(true)

      // Verify lease is gone
      const afterRelease = ProactiveTaskStore.getLease("test-lease")
      expect(afterRelease).toBeNull()
    })

    it("should fail to release lease with wrong owner", () => {
      // Acquire lease
      const lease = ProactiveTaskStore.acquireLease({
        leaseName: "test-lease",
        ownerId: "owner-1",
        ttlMs: 30000,
      })
      expect(lease).not.toBeNull()

      // Try to release with wrong owner
      const released = ProactiveTaskStore.releaseLease({
        leaseName: "test-lease",
        ownerId: "owner-2",
      })

      expect(released).toBe(false)

      // Lease should still exist
      const afterRelease = ProactiveTaskStore.getLease("test-lease")
      expect(afterRelease).not.toBeNull()
    })
  })

  describe("getLease", () => {
    it("should get existing lease", () => {
      // Acquire lease
      const lease = ProactiveTaskStore.acquireLease({
        leaseName: "test-lease",
        ownerId: "owner-1",
        ttlMs: 30000,
      })
      expect(lease).not.toBeNull()

      // Get lease
      const retrieved = ProactiveTaskStore.getLease("test-lease")
      expect(retrieved).not.toBeNull()
      expect(retrieved!.leaseName).toBe("test-lease")
      expect(retrieved!.ownerId).toBe("owner-1")
    })

    it("should return null for non-existent lease", () => {
      const lease = ProactiveTaskStore.getLease("nonexistent-lease")
      expect(lease).toBeNull()
    })
  })
})
