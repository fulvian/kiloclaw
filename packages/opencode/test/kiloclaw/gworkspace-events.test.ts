import { describe, expect, it, spyOn } from "bun:test"
import { Instance } from "@/project/instance"
import { Bus } from "@/bus"
import { MCP } from "@/mcp"
import { tmpdir } from "../fixture/fixture"
import { GWorkspaceBroker } from "@/kiloclaw/agency/broker/gworkspace-broker"
import { GWorkspaceHITL } from "@/kiloclaw/agency/hitl/gworkspace-hitl"

describe("gworkspace broker telemetry", () => {
  it("emits route and tool events on MCP fallback success", async () => {
    await using tmp = await tmpdir()
    const toolsSpy = spyOn(MCP, "tools").mockResolvedValue({
      "google-workspace_search_gmail_messages": {
        execute: async () => ({ items: [] }),
      } as any,
    })

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const seen: Array<{ type: string; properties: any }> = []
          const unsub = Bus.subscribeAll((event) => {
            seen.push(event)
          })

          try {
            const out = await GWorkspaceBroker.gmail(
              "search",
              { query: "from:me" },
              {
                preferNative: false,
                mcpFallbackEnabled: true,
                fallbackServers: ["google-workspace"],
              },
            )

            expect(out.success).toBeTrue()
            expect(out.provider).toBe("mcp")
            expect(out.fallbackTrigger).toBe("native_unsupported")

            const route = seen.find((evt) => evt.type === "agency.route.decided")
            expect(route).toBeDefined()
            expect(route?.properties.provider).toBe("mcp")

            const started = seen.find((evt) => evt.type === "tool.call.started")
            expect(started).toBeDefined()

            const done = seen.find((evt) => evt.type === "tool.call.completed")
            expect(done).toBeDefined()
            expect(done?.properties.success).toBeTrue()
          } finally {
            unsub()
          }
        },
      })
    } finally {
      toolsSpy.mockRestore()
    }
  })

  it("emits failed completion on MCP execution error", async () => {
    await using tmp = await tmpdir()
    const toolsSpy = spyOn(MCP, "tools").mockResolvedValue({
      "google-workspace_search_gmail_messages": {
        execute: async () => {
          throw new Error("mcp execution failed")
        },
      } as any,
    })

    try {
      await Instance.provide({
        directory: tmp.path,
        fn: async () => {
          const seen: Array<{ type: string; properties: any }> = []
          const unsub = Bus.subscribeAll((event) => {
            seen.push(event)
          })

          try {
            const out = await GWorkspaceBroker.gmail(
              "search",
              { query: "from:me" },
              {
                preferNative: false,
                mcpFallbackEnabled: true,
                fallbackServers: ["google-workspace"],
              },
            )

            expect(out.success).toBeFalse()
            expect(out.provider).toBe("mcp")
            expect(out.fallbackTrigger).toBe("provider_degraded")

            const done = seen.find((evt) => evt.type === "tool.call.completed")
            expect(done).toBeDefined()
            expect(done?.properties.success).toBeFalse()
          } finally {
            unsub()
          }
        },
      })
    } finally {
      toolsSpy.mockRestore()
    }
  })
})

describe("gworkspace hitl telemetry", () => {
  it("emits requested and completed events for approval flow", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const seen: Array<{ type: string; properties: any }> = []
        const unsub = Bus.subscribeAll((event) => {
          seen.push(event)
        })

        try {
          const req = await GWorkspaceHITL.createRequest("gmail", "messages.send", "high", "approve test", {}, 3_000)
          await GWorkspaceHITL.approve(req.id, "approved")
          const ok = await GWorkspaceHITL.waitForApproval(req.id, 2_000)
          expect(ok).toBeTrue()

          const requested = seen.find((evt) => evt.type === "hitl.requested")
          expect(requested).toBeDefined()
          expect(requested?.properties.requestId).toBe(req.id)

          const completed = seen.find((evt) => evt.type === "hitl.completed")
          expect(completed).toBeDefined()
          expect(completed?.properties.requestId).toBe(req.id)
          expect(completed?.properties.outcome).toBe("approved")
        } finally {
          unsub()
        }
      },
    })
  })
})
