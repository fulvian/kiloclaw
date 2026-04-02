import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Diff change types
export type DiffType = "added" | "removed" | "modified" | "unchanged"

// Individual diff entry
export interface Diff {
  readonly type: DiffType
  readonly path: string
  readonly oldValue?: string
  readonly newValue?: string
  readonly lineNumber?: number
}

// Conflict type
export interface Conflict {
  readonly path: string
  readonly type: "both_modified" | "deleted_by_us" | "deleted_by_them"
  readonly ourVersion?: string
  readonly theirVersion?: string
}

// Comparison input schema
export interface ComparisonInput {
  before: string
  after: string
}

// Comparison output schema
export interface ComparisonOutput {
  diff: Diff[]
  conflicts: Conflict[]
  summary: {
    additions: number
    deletions: number
    modifications: number
  }
}

// Parse diff output into structured format
function parseTextDiff(before: string, after: string): { diffs: Diff[]; summary: ComparisonOutput["summary"] } {
  const diffs: Diff[] = []
  const beforeLines = before.split("\n")
  const afterLines = after.split("\n")

  let additions = 0
  let deletions = 0
  let modifications = 0

  // Simple line-by-line diff algorithm (Longest Common Subsequence approximation)
  const maxLen = Math.max(beforeLines.length, afterLines.length)

  for (let i = 0; i < maxLen; i++) {
    const beforeLine = beforeLines[i]
    const afterLine = afterLines[i]

    if (beforeLine === undefined) {
      // Added in after
      diffs.push({
        type: "added",
        path: `line ${i + 1}`,
        newValue: afterLine,
        lineNumber: i + 1,
      })
      additions++
    } else if (afterLine === undefined) {
      // Removed from before
      diffs.push({
        type: "removed",
        path: `line ${i + 1}`,
        oldValue: beforeLine,
        lineNumber: i + 1,
      })
      deletions++
    } else if (beforeLine !== afterLine) {
      // Modified
      diffs.push({
        type: "modified",
        path: `line ${i + 1}`,
        oldValue: beforeLine,
        newValue: afterLine,
        lineNumber: i + 1,
      })
      modifications++
    } else {
      // Unchanged
      diffs.push({
        type: "unchanged",
        path: `line ${i + 1}`,
        oldValue: beforeLine,
        newValue: afterLine,
        lineNumber: i + 1,
      })
    }
  }

  return {
    diffs,
    summary: { additions, deletions, modifications },
  }
}

// Detect potential conflicts (simplified version)
function detectConflicts(before: string, after: string): Conflict[] {
  const conflicts: Conflict[] = []

  // If the changes are on same lines, potential conflict
  const beforeLines = before.split("\n")
  const afterLines = after.split("\n")

  // Check for conflicting modifications
  for (let i = 0; i < Math.min(beforeLines.length, afterLines.length); i++) {
    const beforeLine = beforeLines[i]
    const afterLine = afterLines[i]

    // If both versions modified the same line differently
    if (beforeLine !== afterLine && i < beforeLines.length - 1) {
      // Simple conflict detection heuristic
      const beforeChanged = i > 0 && beforeLines[i - 1] !== beforeLines[i]
      const afterChanged = i > 0 && afterLines[i - 1] !== afterLines[i]

      if (beforeChanged && afterChanged && beforeLine !== afterLine) {
        conflicts.push({
          path: `line ${i + 1}`,
          type: "both_modified",
          ourVersion: beforeLine,
          theirVersion: afterLine,
        })
      }
    }
  }

  // Check for deletion conflicts
  if (beforeLines.length > afterLines.length) {
    const deletedLines = beforeLines.slice(afterLines.length)
    if (deletedLines.some((line) => line.trim().length > 0)) {
      conflicts.push({
        path: `lines ${afterLines.length + 1}-${beforeLines.length}`,
        type: "deleted_by_them",
        ourVersion: deletedLines.join("\n"),
      })
    }
  }

  return conflicts
}

// Calculate overall similarity
function calculateSimilarity(before: string, after: string): number {
  if (before === after) return 1.0
  if (!before || !after) return 0.0

  const beforeWords = before.split(/\s+/)
  const afterWords = after.split(/\s+/)

  const set1 = new Set(beforeWords)
  const set2 = new Set(afterWords)

  let intersection = 0
  for (const word of set1) {
    if (set2.has(word)) intersection++
  }

  const union = set1.size + set2.size - intersection
  return union > 0 ? intersection / union : 0
}

export const ComparisonSkill: Skill = {
  id: "comparison" as SkillId,
  version: "1.0.0",
  name: "Code Comparison",
  inputSchema: {
    type: "object",
    properties: {
      before: { type: "string", description: "Original code/ content" },
      after: { type: "string", description: "Modified code/ content" },
    },
    required: ["before", "after"],
  },
  outputSchema: {
    type: "object",
    properties: {
      diff: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            path: { type: "string" },
            oldValue: { type: "string" },
            newValue: { type: "string" },
            lineNumber: { type: "number" },
          },
        },
      },
      conflicts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            path: { type: "string" },
            type: { type: "string" },
            ourVersion: { type: "string" },
            theirVersion: { type: "string" },
          },
        },
      },
      summary: {
        type: "object",
        properties: {
          additions: { type: "number" },
          deletions: { type: "number" },
          modifications: { type: "number" },
        },
      },
    },
  },
  capabilities: ["diff_analysis", "conflict_resolution", "change_tracking"],
  tags: ["development", "diff", "merge", "version-control"],

  async execute(input: unknown, context: SkillContext): Promise<ComparisonOutput> {
    const log = Log.create({ service: "kiloclaw.skill.comparison" })
    log.info("executing code comparison", { correlationId: context.correlationId })

    const { before, after } = input as ComparisonInput

    if (!before && !after) {
      log.warn("empty content provided for comparison")
      return {
        diff: [],
        conflicts: [],
        summary: { additions: 0, deletions: 0, modifications: 0 },
      }
    }

    const { diffs, summary } = parseTextDiff(before || "", after || "")
    const conflicts = detectConflicts(before || "", after || "")

    // If there are many conflicts, flag potential issues
    const similarity = calculateSimilarity(before || "", after || "")

    if (similarity < 0.3 && conflicts.length === 0) {
      log.warn("low similarity detected, potential major restructuring", {
        correlationId: context.correlationId,
        similarity,
      })
    }

    const output: ComparisonOutput = {
      diff: diffs,
      conflicts,
      summary,
    }

    log.info("code comparison completed", {
      correlationId: context.correlationId,
      additions: summary.additions,
      deletions: summary.deletions,
      modifications: summary.modifications,
      conflictCount: conflicts.length,
    })

    return output
  },
}
