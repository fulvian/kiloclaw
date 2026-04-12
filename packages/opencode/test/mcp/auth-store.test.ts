import { describe, it, expect } from "bun:test"
import { AUTH_STORE_PATHS, isSameStore, McpAuthStore } from "@/mcp/auth-store"

describe("McpAuthStore", () => {
  describe("AUTH_STORE_PATHS", () => {
    it("should have canonical and runtime paths defined", () => {
      expect(AUTH_STORE_PATHS.canonical).toBeDefined()
      expect(AUTH_STORE_PATHS.runtime).toBeDefined()
    })
  })

  describe("isSameStore", () => {
    it("should return true for same path", () => {
      expect(isSameStore("/foo/bar", "/foo/bar")).toBe(true)
    })

    it("should return false for different paths", () => {
      expect(isSameStore("/foo/bar", "/foo/baz")).toBe(false)
    })
  })

  describe("McpAuthStore namespace", () => {
    it("should be exported", () => {
      expect(McpAuthStore).toBeDefined()
    })
  })
})
