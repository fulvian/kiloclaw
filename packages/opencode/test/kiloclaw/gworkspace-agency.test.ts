import { describe, it, expect } from "bun:test"
import { GWorkspaceAgency } from "@/kiloclaw/agency/manifests/gworkspace-manifest"

describe("gworkspace manifest policy", () => {
  it("maps canonical and audit-style operations", () => {
    expect(GWorkspaceAgency.getPolicy("gmail", "messages.send")).toBe("CONFIRM")
    expect(GWorkspaceAgency.getPolicy("gmail", "gmail.send")).toBe("CONFIRM")
    expect(GWorkspaceAgency.getPolicy("gmail", "gmail.draft")).toBe("NOTIFY")
    expect(GWorkspaceAgency.getPolicy("drive", "drive.share_public")).toBe("DENY")
  })

  it("enforces deny-by-default for unknown operations", () => {
    expect(GWorkspaceAgency.getPolicy("gmail", "messages.unknown_action")).toBe("DENY")
    expect(GWorkspaceAgency.getPolicy("unknown", "whatever")).toBe("DENY")
  })

  it("requires approval only for confirm/hitl", () => {
    expect(GWorkspaceAgency.requiresApproval("gmail", "messages.get")).toBeFalse()
    expect(GWorkspaceAgency.requiresApproval("gmail", "drafts.create")).toBeFalse()
    expect(GWorkspaceAgency.requiresApproval("gmail", "messages.send")).toBeTrue()
  })
})
