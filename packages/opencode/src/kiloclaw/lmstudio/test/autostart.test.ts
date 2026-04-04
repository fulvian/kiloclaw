import { describe, test, expect } from "bun:test"
import { AutoStart } from "../autostart"

describe("AutoStart", () => {
  describe("getStartupInstructions", () => {
    test("returns Linux instructions when platform is linux", () => {
      const instructions = AutoStart.getStartupInstructions("linux")

      expect(instructions).toContain("Linux")
      expect(instructions).toContain("lms daemon up")
      expect(instructions).toContain("systemctl")
      expect(instructions).toContain("lmstudio.ai")
    })

    test("returns macOS instructions when platform is darwin", () => {
      const instructions = AutoStart.getStartupInstructions("darwin")

      expect(instructions).toContain("macOS")
      expect(instructions).toContain("lms daemon up")
      expect(instructions).toContain("lmstudio.ai")
    })

    test("returns Windows instructions when platform is win32", () => {
      const instructions = AutoStart.getStartupInstructions("win32")

      expect(instructions).toContain("Windows")
      expect(instructions).toContain("lms daemon up")
      expect(instructions).toContain("lmstudio.ai")
    })

    test("returns default instructions for unknown platform", () => {
      // Use undefined to test default platform detection path
      const instructions = AutoStart.getStartupInstructions(undefined)

      expect(instructions).toContain("Start Server")
      expect(instructions).toContain("lms daemon up")
      expect(instructions).toContain("lmstudio.ai")
    })
  })

  describe("platform detection", () => {
    test("platform is correctly identified from process.platform", () => {
      const platform = process.platform
      expect(["linux", "darwin", "win32"]).toContain(platform)
    })
  })
})
