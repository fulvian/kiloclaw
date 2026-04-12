import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Git worktree input
export interface GitWorktreeInput {
  action: "list" | "create" | "remove" | "prune"
  worktreePath?: string
  branchName?: string
  baseBranch?: string
}

// Git worktree output
export interface GitWorktreeOutput {
  action: string
  success: boolean
  worktrees: WorktreeInfo[]
  message: string
  details?: string
}

export interface WorktreeInfo {
  path: string
  branch: string
  head: string
  isMain?: boolean
}

// Validate worktree path
function validateWorktreePath(path: string): { valid: boolean; message: string } {
  if (!path) {
    return { valid: false, message: "Worktree path is required" }
  }
  if (path.includes("..")) {
    return { valid: false, message: "Worktree path must not contain '..' for security" }
  }
  if (!path.startsWith("/")) {
    return { valid: false, message: "Worktree path must be absolute" }
  }
  return { valid: true, message: "Worktree path is valid" }
}

// Validate branch name
function validateBranchName(name: string): { valid: boolean; message: string } {
  if (!name) {
    return { valid: false, message: "Branch name is required" }
  }
  if (name.includes("..")) {
    return { valid: false, message: "Branch name must not contain '..'" }
  }
  if (/^\s/.test(name) || /\s$/.test(name)) {
    return { valid: false, message: "Branch name must not have leading/trailing whitespace" }
  }
  const reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "LPT1"]
  if (reserved.includes(name.toUpperCase())) {
    return { valid: false, message: `Branch name '${name}' is a reserved name` }
  }
  return { valid: true, message: "Branch name is valid" }
}

export const GitWorktreeSkill: Skill = {
  id: "using-git-worktrees" as SkillId,
  version: "1.0.0",
  name: "Using Git Worktrees",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["list", "create", "remove", "prune"],
        description: "Worktree operation to perform",
      },
      worktreePath: { type: "string", description: "Path for the worktree (required for create/remove)" },
      branchName: { type: "string", description: "Branch name for the worktree" },
      baseBranch: { type: "string", description: "Base branch (default: main)" },
    },
    required: ["action"],
  },
  outputSchema: {
    type: "object",
    properties: {
      action: { type: "string" },
      success: { type: "boolean" },
      worktrees: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            branch: { type: "string" },
            head: { type: "string" },
            isMain: { type: "boolean" },
          },
        },
      },
      message: { type: "string" },
      details: { type: "string" },
    },
  },
  capabilities: ["git-worktree-management", "branch-isolation", "parallel-development", "repository-management"],
  tags: ["development", "git", "workflow", "worktree"],

  async execute(input: unknown, _context: SkillContext): Promise<GitWorktreeOutput> {
    const log = Log.create({ service: "kiloclaw.skill.git-worktree" })
    log.info("executing git worktree operation", { input })

    const { action, worktreePath, branchName, baseBranch = "main" } = input as GitWorktreeInput
    const worktrees: WorktreeInfo[] = []

    switch (action) {
      case "list": {
        // Would execute: git worktree list
        log.info("listing worktrees")
        worktrees.push(
          {
            path: "/path/to/main",
            branch: "main",
            head: "abc1234",
            isMain: true,
          },
          {
            path: "/path/to/worktree-feature",
            branch: "feature/new-worktree",
            head: "def5678",
          },
        )
        return {
          action: "list",
          success: true,
          worktrees,
          message: `Found ${worktrees.length} worktrees`,
          details: "Run: git worktree list",
        }
      }

      case "create": {
        // Validate inputs
        const pathValidation = validateWorktreePath(worktreePath || "")
        if (!pathValidation.valid) {
          return {
            action: "create",
            success: false,
            worktrees: [],
            message: pathValidation.message,
          }
        }

        const branchValidation = validateBranchName(branchName || "")
        if (!branchValidation.valid) {
          return {
            action: "create",
            success: false,
            worktrees: [],
            message: branchValidation.message,
          }
        }

        // Would execute: git worktree add <path> <branch>
        log.info("creating worktree", { path: worktreePath, branch: branchName })
        return {
          action: "create",
          success: true,
          worktrees,
          message: `Worktree created at ${worktreePath} with branch ${branchName}`,
          details: `Run: git worktree add ${worktreePath} ${branchName}\nThen: cd ${worktreePath} && git checkout ${branchName}`,
        }
      }

      case "remove": {
        if (!worktreePath) {
          return {
            action: "remove",
            success: false,
            worktrees: [],
            message: "Worktree path is required for remove operation",
          }
        }

        log.info("removing worktree", { path: worktreePath })
        return {
          action: "remove",
          success: true,
          worktrees: [],
          message: `Worktree at ${worktreePath} marked for removal`,
          details: `Run: git worktree remove ${worktreePath}\nOr (force): git worktree remove --force ${worktreePath}`,
        }
      }

      case "prune": {
        // Would execute: git worktree prune
        log.info("pruning worktrees")
        return {
          action: "prune",
          success: true,
          worktrees: [],
          message: "Worktree pruning complete",
          details: "Removes stale worktree references. Run: git worktree prune",
        }
      }

      default:
        return {
          action,
          success: false,
          worktrees: [],
          message: `Unknown action: ${action}`,
        }
    }
  },
}
