import type { ExecutionContext, ExecutionResult, SkillContext, Task } from "../../agency"
import type { Skill } from "../../skill"

function toError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function contextFor(skillId: string, task: Task, context: ExecutionContext): SkillContext {
  return {
    correlationId: context.correlationId,
    agencyId: context.agencyId,
    agentId: context.metadata?.agentId as string | undefined,
    skillId,
    metadata: {
      taskId: task.id,
      taskType: task.type,
      ...context.metadata,
    },
  }
}

export async function runSkill(skill: Skill, task: Task, context: ExecutionContext): Promise<ExecutionResult> {
  const start = Date.now()

  try {
    const output = await skill.execute(task.input, contextFor(skill.id, task, context))
    return {
      success: true,
      output,
      metrics: { durationMs: Date.now() - start },
    }
  } catch (err) {
    return {
      success: false,
      error: toError(err),
      metrics: { durationMs: Date.now() - start },
    }
  }
}
