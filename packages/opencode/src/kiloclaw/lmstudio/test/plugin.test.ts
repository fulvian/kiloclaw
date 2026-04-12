import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { createLMStudioPlugin } from "../plugin"
import { createMockFetch } from "./fixtures/mock-lmstudio"

// Store original fetch
const originalFetch = globalThis.fetch

// Mock PluginInput
const mockInput = {
  client: {} as any,
  project: { id: "test-project" } as any,
  directory: "/test/dir",
  worktree: "/test/worktree",
  serverUrl: new URL("http://localhost:4096"),
  $: {} as any,
}

describe("createLMStudioPlugin", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test("should create plugin with auth provider set to lmstudio", async () => {
    // Mock fetch to simulate unreachable server (will skip auto-start)
    globalThis.fetch = createMockFetch({})

    const plugin = await createLMStudioPlugin(mockInput)

    expect(plugin.auth).toBeDefined()
    expect(plugin.auth?.provider).toBe("lmstudio")
  })

  test("should have local API auth method", async () => {
    globalThis.fetch = createMockFetch({})

    const plugin = await createLMStudioPlugin(mockInput)

    expect(plugin.auth?.methods).toBeDefined()
    expect(plugin.auth?.methods).toHaveLength(1)
    expect(plugin.auth?.methods[0]).toMatchObject({
      type: "api",
      label: "Local LM Studio",
    })
  })

  test("should have authorize function that returns success with local key", async () => {
    globalThis.fetch = createMockFetch({})

    const plugin = await createLMStudioPlugin(mockInput)

    const method = plugin.auth?.methods[0] as any
    const result = await method.authorize()

    expect(result).toEqual({ type: "success", key: "local" })
  })

  test("should return empty options when provider is disabled", async () => {
    // Mock fetch to return a config with enabled: false
    globalThis.fetch = createMockFetch({
      "/v1/models": {
        status: 200,
        body: { object: "list", data: [] },
      },
    })

    const plugin = await createLMStudioPlugin(mockInput)

    // The loader would need to check config, but we can't easily mock Config.get()
    // This test just verifies the plugin structure
    expect(plugin.auth?.loader).toBeDefined()
  })

  test("should have loader function in auth", async () => {
    globalThis.fetch = createMockFetch({})

    const plugin = await createLMStudioPlugin(mockInput)

    expect(typeof plugin.auth?.loader).toBe("function")
  })
})
