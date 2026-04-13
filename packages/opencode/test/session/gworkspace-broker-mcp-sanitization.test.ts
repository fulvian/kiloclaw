import { describe, test, expect } from "bun:test"

describe("gworkspace broker MCP sanitization", () => {
  test("sanitizes server names (keeps alphanumeric, underscore, hyphen)", () => {
    // Same regex as MCP index: /[^a-zA-Z0-9_-]/g
    const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9_-]/g, "_")
    
    expect(sanitize("google-workspace")).toBe("google-workspace")
    expect(sanitize("google-workspace-mcp")).toBe("google-workspace-mcp")
    expect(sanitize("gworkspace")).toBe("gworkspace")
    expect(sanitize("server@name!")).toBe("server_name_")
  })

  test("constructs correct MCP tool keys with sanitization", () => {
    const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9_-]/g, "_")
    const fallbackServers = ["google-workspace", "google-workspace-mcp"]
    const toolName = "search_gmail_messages"

    const keys = fallbackServers.map((server) => `${sanitize(server)}_${toolName}`)

    expect(keys).toEqual([
      "google-workspace_search_gmail_messages",
      "google-workspace-mcp_search_gmail_messages",
    ])
  })

  test("handles edge cases in server names", () => {
    const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9_-]/g, "_")
    
    // Hyphens and underscores are preserved
    expect(sanitize("my-server_name")).toBe("my-server_name")
    expect(sanitize("my_server-name")).toBe("my_server-name")
    
    // Special characters are replaced with underscores
    expect(sanitize("server name")).toBe("server_name")
    expect(sanitize("server.name")).toBe("server_name")
  })
})
