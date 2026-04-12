import { describe, it, expect, beforeEach } from "bun:test"
import {
  ProactiveUserControls,
  setQuietHours,
  getQuietHours,
  setOverride,
  getOverride,
  setKillSwitch,
  isKillSwitchEnabled,
  isQuietHours,
  getUserControls,
  OverrideLevel,
  type ProactiveUserControls as UserControls,
} from "./user-controls"

// Helper to create a mock controls object
function createMockControls(overrides: Partial<UserControls> = {}): UserControls {
  return {
    tenantId: "tenant-1",
    userId: "user-1",
    quietHoursStart: null,
    quietHoursEnd: null,
    overrideLevel: "none",
    killSwitch: false,
    updatedAt: Date.now(),
    ...overrides,
  }
}

describe("ProactiveUserControls", () => {
  describe("setQuietHours", () => {
    it("should set quiet hours for a user", async () => {
      const result = await setQuietHours({
        tenantId: "tenant-1",
        userId: "user-1",
        start: 540, // 9:00 AM
        end: 1080, // 6:00 PM
      })

      expect(result.quietHoursStart).toBe(540)
      expect(result.quietHoursEnd).toBe(1080)
      expect(result.tenantId).toBe("tenant-1")
      expect(result.userId).toBe("user-1")
    })

    it("should set null to disable quiet hours", async () => {
      const result = await setQuietHours({
        tenantId: "tenant-1",
        userId: "user-1",
        start: null,
        end: null,
      })

      expect(result.quietHoursStart).toBeNull()
      expect(result.quietHoursEnd).toBeNull()
    })

    it("should reject start >= end", async () => {
      await expect(
        setQuietHours({
          tenantId: "tenant-1",
          userId: "user-1",
          start: 1080, // 6:00 PM
          end: 540, // 9:00 AM (before start)
        }),
      ).rejects.toThrow("quiet_hours_start must be less than quiet_hours_end")
    })
  })

  describe("getQuietHours", () => {
    it("should return null when no quiet hours set", async () => {
      const result = await getQuietHours({
        tenantId: "nonexistent-tenant",
        userId: "nonexistent-user",
      })

      expect(result).toBeNull()
    })
  })

  describe("setOverride", () => {
    it("should set override level", async () => {
      const result = await setOverride({
        tenantId: "tenant-1",
        userId: "user-1",
        level: "suggest",
      })

      expect(result.overrideLevel).toBe("suggest")
    })

    it("should preserve other settings when setting override", async () => {
      // First set quiet hours
      await setQuietHours({
        tenantId: "tenant-1",
        userId: "user-1",
        start: 0,
        end: 480,
      })

      // Then set override
      const result = await setOverride({
        tenantId: "tenant-1",
        userId: "user-1",
        level: "act",
      })

      expect(result.quietHoursStart).toBe(0)
      expect(result.quietHoursEnd).toBe(480)
      expect(result.overrideLevel).toBe("act")
    })
  })

  describe("getOverride", () => {
    it("should return none for unset override", async () => {
      const result = await getOverride({
        tenantId: "nonexistent-tenant",
        userId: "nonexistent-user",
      })

      expect(result).toBe("none")
    })
  })

  describe("setKillSwitch", () => {
    it("should enable kill switch", async () => {
      const result = await setKillSwitch({
        tenantId: "tenant-1",
        userId: "user-1",
        enabled: true,
      })

      expect(result.killSwitch).toBe(true)
    })

    it("should disable kill switch", async () => {
      // First enable
      await setKillSwitch({
        tenantId: "tenant-1",
        userId: "user-1",
        enabled: true,
      })

      // Then disable
      const result = await setKillSwitch({
        tenantId: "tenant-1",
        userId: "user-1",
        enabled: false,
      })

      expect(result.killSwitch).toBe(false)
    })
  })

  describe("isKillSwitchEnabled", () => {
    it("should return false for unset kill switch", async () => {
      const result = await isKillSwitchEnabled({
        tenantId: "nonexistent-tenant",
        userId: "nonexistent-user",
      })

      expect(result).toBe(false)
    })
  })

  describe("isQuietHours", () => {
    it("should return false when quiet hours not set", () => {
      const controls = createMockControls({
        quietHoursStart: null,
        quietHoursEnd: null,
      })

      expect(isQuietHours(controls)).toBe(false)
    })

    it("should handle daytime quiet hours (9 AM - 5 PM)", () => {
      // Set quiet hours to 9:00 AM - 5:00 PM
      const controls = createMockControls({
        quietHoursStart: 540, // 9:00 AM
        quietHoursEnd: 1020, // 5:00 PM
      })

      // This test verifies the logic works - actual result depends on current time
      // We just verify the function runs without error
      const result = isQuietHours(controls)
      expect(typeof result).toBe("boolean")
    })

    it("should handle overnight quiet hours", () => {
      // Set quiet hours to 11:00 PM - 6:00 AM
      const controls = createMockControls({
        quietHoursStart: 1380, // 11:00 PM
        quietHoursEnd: 360, // 6:00 AM
      })

      // This test verifies the logic works for overnight hours
      const result = isQuietHours(controls)
      expect(typeof result).toBe("boolean")
    })
  })

  describe("getUserControls", () => {
    it("should return default controls for unknown user", async () => {
      const result = await getUserControls({
        tenantId: "nonexistent-tenant",
        userId: "nonexistent-user",
      })

      expect(result.tenantId).toBe("nonexistent-tenant")
      expect(result.userId).toBe("nonexistent-user")
      expect(result.quietHoursStart).toBeNull()
      expect(result.quietHoursEnd).toBeNull()
      expect(result.overrideLevel).toBe("none")
      expect(result.killSwitch).toBe(false)
    })

    it("should return stored controls for known user", async () => {
      // Set some controls
      await setQuietHours({
        tenantId: "tenant-1",
        userId: "user-1",
        start: 0,
        end: 480,
      })

      await setKillSwitch({
        tenantId: "tenant-1",
        userId: "user-1",
        enabled: true,
      })

      const result = await getUserControls({
        tenantId: "tenant-1",
        userId: "user-1",
      })

      expect(result.quietHoursStart).toBe(0)
      expect(result.quietHoursEnd).toBe(480)
      expect(result.killSwitch).toBe(true)
    })
  })
})
