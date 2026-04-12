import { test, expect } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { Agent } from "../../src/agent/agent"
import { PermissionNext } from "../../src/permission/next"

test("router keeps skill available and edit denied", async () => {
  await using tmp = await tmpdir()
  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const router = await Agent.get("router")
      expect(router).toBeDefined()
      expect(PermissionNext.evaluate("skill", "*", router!.permission).action).toBe("allow")
      expect(PermissionNext.evaluate("websearch", "*", router!.permission).action).toBe("allow")
      expect(PermissionNext.evaluate("webfetch", "*", router!.permission).action).toBe("allow")
      expect(PermissionNext.evaluate("edit", "*", router!.permission).action).toBe("deny")

      const disabled = PermissionNext.disabled(["skill", "websearch", "webfetch", "edit"], router!.permission)
      expect(disabled.has("skill")).toBe(false)
      expect(disabled.has("websearch")).toBe(false)
      expect(disabled.has("webfetch")).toBe(false)
      expect(disabled.has("edit")).toBe(true)
    },
  })
})
