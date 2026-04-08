import { useKV } from "./kv"
import type { ScheduledTaskCreateInput } from "@/kiloclaw/proactive/scheduled-task"

export type TaskWizardDraft = {
  step: "schedule" | "intent" | "reliability" | "policy" | "review"
  data: Partial<ScheduledTaskCreateInput>
  taskId?: string // If editing existing task
  createdAt: number
  updatedAt: number
}

const DRAFT_PREFIX = "tui.tasks.wizard."
const DEFAULT_DRAFT_TTL_DAYS = 7

export function useTaskWizardDraft() {
  const kv = useKV()

  function getDraftKey(sessionOrGlobal: "session" | "global", draftId?: string): string {
    if (draftId) return `${DRAFT_PREFIX}${sessionOrGlobal}.${draftId}`
    // Use a default global draft
    return `${DRAFT_PREFIX}global.default`
  }

  function saveDraft(sessionOrGlobal: "session" | "global", draft: TaskWizardDraft, draftId?: string): void {
    const key = getDraftKey(sessionOrGlobal, draftId)
    const draftWithTimestamp: TaskWizardDraft = {
      ...draft,
      updatedAt: Date.now(),
    }
    kv.set(key, draftWithTimestamp)
  }

  function loadDraft(sessionOrGlobal: "session" | "global", draftId?: string): TaskWizardDraft | null {
    const key = getDraftKey(sessionOrGlobal, draftId)
    const stored = kv.get(key)
    if (!stored) return null

    // Check expiry
    const expiryMs = DEFAULT_DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000
    if (Date.now() - stored.updatedAt > expiryMs) {
      // Draft expired, delete it
      deleteDraft(sessionOrGlobal, draftId)
      return null
    }

    return stored as TaskWizardDraft
  }

  function deleteDraft(sessionOrGlobal: "session" | "global", draftId?: string): void {
    const key = getDraftKey(sessionOrGlobal, draftId)
    kv.set(key, undefined)

    const draftsListKey = `${DRAFT_PREFIX}list`
    const draftsList = kv.get(draftsListKey, []) as string[]
    const updatedList = draftsList.filter((k) => k !== key)
    kv.set(draftsListKey, updatedList)
  }

  function listDrafts(): Array<{ key: string; draft: TaskWizardDraft }> {
    const draftsListKey = `${DRAFT_PREFIX}list`
    const draftKeys = kv.get(draftsListKey, []) as string[]
    const results: Array<{ key: string; draft: TaskWizardDraft }> = []

    for (const key of draftKeys) {
      const stored = kv.get(key)
      if (stored) {
        const draft = stored as TaskWizardDraft
        // Check expiry
        const expiryMs = DEFAULT_DRAFT_TTL_DAYS * 24 * 60 * 60 * 1000
        if (Date.now() - draft.updatedAt <= expiryMs) {
          results.push({ key, draft })
        }
      }
    }

    return results.sort((a, b) => b.draft.updatedAt - a.draft.updatedAt)
  }

  function createNewDraft(editTaskId?: string): TaskWizardDraft {
    const now = Date.now()
    return {
      step: "schedule",
      data: {},
      taskId: editTaskId,
      createdAt: now,
      updatedAt: now,
    }
  }

  return {
    saveDraft,
    loadDraft,
    deleteDraft,
    listDrafts,
    createNewDraft,
    DEFAULT_DRAFT_TTL_DAYS,
  }
}
