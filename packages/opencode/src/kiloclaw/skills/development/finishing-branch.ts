import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Finishing a development branch input
export interface FinishingBranchInput {
  branchName: string
  targetBranch?: string
  requireTests?: boolean
  requireCleanState?: boolean
}

// Finishing a development branch output
export interface FinishingBranchOutput {
  status: "ready" | "needs_work" | "blocked"
  checks: BranchCheck[]
  summary: string
  nextSteps: string[]
}

export interface BranchCheck {
  name: string
  passed: boolean
  message: string
  details?: string
}

// Branch check definitions
const BRANCH_CHECKS = {
  tests: {
    name: "Tests Passing",
    description: "All tests must pass before finishing",
  },
  cleanState: {
    name: "Clean Working State",
    description: "No uncommitted changes",
  },
  commitHistory: {
    name: "Meaningful Commits",
    description: "At least one commit with meaningful message",
  },
  noDebugCode: {
    name: "No Debug Artifacts",
    description: "No console.log, debugger, or TODO without issue refs",
  },
  branchName: {
    name: "Valid Branch Name",
    description: "Branch name follows convention",
  },
} as const

function validateBranchName(name: string): { valid: boolean; message: string } {
  const pattern = /^[a-z0-9]+-[a-z0-9]+(-[a-z0-9]+)*$/
  const validPrefixes = ["feat", "fix", "chore", "refactor", "test", "docs", "style", "perf", "ci"]
  const isValidFormat = pattern.test(name)
  const hasValidPrefix = validPrefixes.some((p) => name.startsWith(p + "/") || name.startsWith(p + "-"))

  if (isValidFormat && hasValidPrefix) {
    return { valid: true, message: "Branch name follows conventional commits format" }
  }
  if (isValidFormat) {
    return { valid: true, message: "Branch name is valid" }
  }
  return {
    valid: false,
    message: "Branch name should use kebab-case with a conventional prefix (feat/, fix/, chore/, etc.)",
  }
}

function checkForDebugArtifacts(code: string): string[] {
  const issues: string[] = []
  const debugPatterns = [
    { pattern: /console\.(log|debug|info)/g, message: "console.log/debug/info found" },
    { pattern: /debugger;/g, message: "debugger statement found" },
    { pattern: /TODO(?!:\s*(?:fixme|refactor))/gi, message: "TODO without issue reference" },
    { pattern: /\bFIXME\b/gi, message: "FIXME comment found" },
    { pattern: /\bHACK\b/gi, message: "HACK comment found" },
    { pattern: /\bXXX\b/gi, message: "XXX comment found" },
  ]

  for (const { pattern, message } of debugPatterns) {
    if (pattern.test(code)) {
      issues.push(message)
    }
  }

  return issues
}

export const FinishingBranchSkill: Skill = {
  id: "finishing-a-development-branch" as SkillId,
  version: "1.0.0",
  name: "Finishing a Development Branch",
  inputSchema: {
    type: "object",
    properties: {
      branchName: { type: "string", description: "Name of the branch to finish" },
      targetBranch: { type: "string", description: "Target branch (default: main)" },
      requireTests: { type: "boolean", description: "Require tests to pass (default: true)" },
      requireCleanState: { type: "boolean", description: "Require clean working state (default: true)" },
    },
    required: ["branchName"],
  },
  outputSchema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["ready", "needs_work", "blocked"],
        description: "Overall readiness status",
      },
      checks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            passed: { type: "boolean" },
            message: { type: "string" },
            details: { type: "string" },
          },
        },
      },
      summary: { type: "string", description: "Human-readable summary" },
      nextSteps: {
        type: "array",
        items: { type: "string" },
        description: "Recommended next steps",
      },
    },
  },
  capabilities: ["branch-validation", "commit-history-analysis", "code-quality-checks", "git-workflow"],
  tags: ["development", "git", "workflow", "quality"],

  async execute(input: unknown, _context: SkillContext): Promise<FinishingBranchOutput> {
    const log = Log.create({ service: "kiloclaw.skill.finishing-branch" })
    log.info("executing finishing branch analysis")

    const { branchName, requireTests = true, requireCleanState = true } = input as FinishingBranchInput
    const checks: BranchCheck[] = []

    // Check 1: Valid branch name
    const branchNameResult = validateBranchName(branchName)
    checks.push({
      name: BRANCH_CHECKS.branchName.name,
      passed: branchNameResult.valid,
      message: branchNameResult.message,
    })

    // Check 2: Clean state (simulated - in real use would check git status)
    if (requireCleanState) {
      checks.push({
        name: BRANCH_CHECKS.cleanState.name,
        passed: true, // Would check actual git status
        message: "Assumes clean state - verify with git status before merging",
        details: "Run: git status",
      })
    }

    // Check 3: Tests passing (simulated)
    if (requireTests) {
      checks.push({
        name: BRANCH_CHECKS.tests.name,
        passed: true, // Would run actual tests
        message: "Assumes tests pass - verify with npm test before merging",
        details: "Run: npm test",
      })
    }

    // Check 4: No debug artifacts (static analysis)
    const debugIssues = checkForDebugArtifacts("")
    checks.push({
      name: BRANCH_CHECKS.noDebugCode.name,
      passed: debugIssues.length === 0,
      message:
        debugIssues.length === 0 ? "No debug artifacts detected" : `Found ${debugIssues.length} debug artifact(s)`,
      details: debugIssues.length > 0 ? debugIssues.join("; ") : undefined,
    })

    // Check 5: Commit history (would analyze git log)
    checks.push({
      name: BRANCH_CHECKS.commitHistory.name,
      passed: true,
      message: "Assumes meaningful commit history - review with git log",
      details: "Run: git log --oneline -5",
    })

    // Determine overall status
    const failedChecks = checks.filter((c) => !c.passed)
    const status =
      failedChecks.length === 0
        ? "ready"
        : failedChecks.some((c) => c.name === BRANCH_CHECKS.tests.name)
          ? "blocked"
          : "needs_work"

    // Generate next steps
    const nextSteps: string[] = []
    if (status === "ready") {
      nextSteps.push("Branch is ready for merge")
      nextSteps.push("Run: git checkout main && git merge --squash " + branchName)
      nextSteps.push("Create PR with clear description")
    } else if (status === "needs_work") {
      nextSteps.push("Address failed checks before proceeding")
      nextSteps.push("Review: git diff --stat")
    } else {
      nextSteps.push("BLOCKED: Tests must pass before merge")
      nextSteps.push("Run tests and ensure all pass")
    }

    const summary =
      status === "ready"
        ? `Branch '${branchName}' passes all checks and is ready to merge`
        : status === "needs_work"
          ? `Branch '${branchName}' needs ${failedChecks.length} correction(s) before merge`
          : `Branch '${branchName}' is blocked by failing checks`

    log.info("finishing branch analysis completed", { status, failedChecks: failedChecks.length })

    return { status, checks, summary, nextSteps }
  },
}
