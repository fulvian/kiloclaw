import { describe, it, expect } from "bun:test"
import {
  canonicalUrl,
  urlsAreEquivalent,
  urlOrigin,
  urlMatchesOrigin,
  buildAuthKey,
  parseAuthKey,
  isValidUrl,
  classifyUrlChange,
} from "@/mcp/auth-url"

describe("auth-url", () => {
  describe("canonicalUrl", () => {
    it("should lowercase host", () => {
      expect(canonicalUrl("https://API.EXAMPLE.COM/path")).toBe("https://api.example.com/path")
    })

    it("should remove trailing slashes", () => {
      expect(canonicalUrl("https://api.example.com/path/")).toBe("https://api.example.com/path")
      expect(canonicalUrl("https://api.example.com/")).toBe("https://api.example.com")
    })

    it("should remove default ports", () => {
      expect(canonicalUrl("https://api.example.com:443/path")).toBe("https://api.example.com/path")
      expect(canonicalUrl("http://api.example.com:80/path")).toBe("http://api.example.com/path")
    })

    it("should preserve non-default ports", () => {
      expect(canonicalUrl("https://api.example.com:8443/path")).toBe("https://api.example.com:8443/path")
    })

    it("should normalize localhost to localhost", () => {
      expect(canonicalUrl("http://127.0.0.1:8080/path")).toBe("http://localhost:8080/path")
      expect(canonicalUrl("http://localhost:8080/path")).toBe("http://localhost:8080/path")
    })

    it("should handle URL objects", () => {
      const url = new URL("https://API.EXAMPLE.COM/path/")
      expect(canonicalUrl(url)).toBe("https://api.example.com/path")
    })

    it("should not remove trailing slash for root", () => {
      expect(canonicalUrl("https://api.example.com")).toBe("https://api.example.com")
    })

    it("should preserve query strings", () => {
      expect(canonicalUrl("https://api.example.com/path?foo=bar")).toBe("https://api.example.com/path?foo=bar")
    })
  })

  describe("urlsAreEquivalent", () => {
    it("should return true for equivalent URLs", () => {
      expect(urlsAreEquivalent("https://API.EXAMPLE.COM/", "https://api.example.com")).toBe(true)
      expect(urlsAreEquivalent("http://127.0.0.1:80/path", "http://localhost/path")).toBe(true)
      expect(urlsAreEquivalent("https://api.example.com:443/", "https://api.example.com")).toBe(true)
    })

    it("should return false for different URLs", () => {
      expect(urlsAreEquivalent("https://api.example.com/path", "https://api.example.com/other")).toBe(false)
      expect(urlsAreEquivalent("https://api.example.com", "https://other.example.com")).toBe(false)
    })
  })

  describe("urlOrigin", () => {
    it("should extract origin from URL", () => {
      expect(urlOrigin("https://api.example.com:8443/path")).toBe("https://api.example.com:8443")
      expect(urlOrigin("http://localhost:8080/path")).toBe("http://localhost:8080")
    })
  })

  describe("urlMatchesOrigin", () => {
    it("should return true for matching origins", () => {
      expect(urlMatchesOrigin("https://api.example.com:8443/path", "https://api.example.com:8443")).toBe(true)
      expect(urlMatchesOrigin("http://localhost:8080/", "http://localhost:8080/path")).toBe(true)
    })

    it("should return false for different origins", () => {
      expect(urlMatchesOrigin("https://api.example.com/path", "https://other.example.com")).toBe(false)
    })
  })

  describe("buildAuthKey", () => {
    it("should build stable auth key", () => {
      const key = buildAuthKey("google-workspace", "https://api.example.com/path")
      expect(key).toContain("google-workspace:")
      expect(key).toContain("https://api.example.com/path")
    })
  })

  describe("parseAuthKey", () => {
    it("should parse valid auth key", () => {
      const result = parseAuthKey("google-workspace:https://api.example.com/path")
      expect(result).toEqual({
        mcpName: "google-workspace",
        canonicalUrl: "https://api.example.com/path",
      })
    })

    it("should return null for invalid key", () => {
      expect(parseAuthKey("invalid-key")).toBeNull()
      expect(parseAuthKey("no-url:")).toBeNull()
    })
  })

  describe("isValidUrl", () => {
    it("should return true for valid URLs", () => {
      expect(isValidUrl("https://api.example.com")).toBe(true)
      expect(isValidUrl("http://localhost:8080/path")).toBe(true)
    })

    it("should return false for invalid URLs", () => {
      expect(isValidUrl("not-a-url")).toBe(false)
      expect(isValidUrl("")).toBe(false)
    })
  })

  describe("classifyUrlChange", () => {
    it("should detect semantic changes (same server)", () => {
      expect(classifyUrlChange("https://API.EXAMPLE.COM/", "https://api.example.com")).toEqual({ semantic: true })
      expect(classifyUrlChange("http://127.0.0.1:80/", "http://localhost/")).toEqual({ semantic: true })
    })

    it("should detect actual changes (different server)", () => {
      const result = classifyUrlChange("https://api.example.com/path", "https://other.example.com/path")
      expect(result.semantic).toBe(false)
      expect(result.reason).toContain("different origin")
    })
  })
})
