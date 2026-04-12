/**
 * Session Execution Bridge - Connects routing to skill/chain execution
 * P1: Collega routing a esecuzione reale
 *
 * This module provides the execution bridge that connects routing decisions
 * to actual skill/chain execution via runSkill and executeChain.
 */

import { Log } from "@/util/log"
import { runSkill } from "./agents/exec"
import { executeChain, getChain, getSkill } from "./chain-executor"
import type { SkillContext, ExecutionContext, Task } from "../agency"
import { RuntimeRemediationMetrics } from "@/kiloclaw/telemetry/runtime-remediation.metrics"
import {
  SESSION_EXECUTION_BRIDGE_ENABLED,
  SESSION_EXECUTION_BRIDGE_MAX_STEPS,
  SESSION_EXECUTION_BRIDGE_TIMEOUT_MS,
} from "../../session/runtime-flags"

const log = Log.create({ service: "kiloclaw.execution-bridge" })

export interface BridgeConfig {
  maxSteps: number
  timeoutMs: number
  correlationId: string
  agencyId: string
}

export interface BridgeResult {
  success: boolean
  output: unknown
  error?: string
  stepsExecuted: number
  durationMs: number
}

/**
 * Build SkillContext from session context
 */
function buildSkillContext(
  agencyId: string,
  correlationId: string,
  skillId: string,
  agentId?: string,
  metadata?: Record<string, unknown>,
): SkillContext {
  return {
    correlationId,
    agencyId,
    agentId,
    skillId,
    metadata,
  }
}

/**
 * Build ExecutionContext from session info
 */
function buildExecutionContext(
  agencyId: string,
  correlationId: string,
  taskId: string,
  agentId?: string,
  metadata?: Record<string, unknown>,
): ExecutionContext {
  return {
    correlationId,
    agencyId,
    taskId,
    metadata,
  }
}

/**
 * Execute a single skill via runSkill
 */
export async function executeSkill(skillId: string, input: unknown, config: BridgeConfig): Promise<BridgeResult> {
  const start = Date.now()

  // Check if bridge is enabled
  if (!SESSION_EXECUTION_BRIDGE_ENABLED()) {
    return {
      success: false,
      output: undefined,
      error: "Execution bridge disabled",
      stepsExecuted: 0,
      durationMs: Date.now() - start,
    }
  }

  const skill = getSkill(skillId)
  if (!skill) {
    const err = `Skill not found: ${skillId}`
    log.warn("execution bridge skill not found", { skillId })
    RuntimeRemediationMetrics.recordAgencyChainCompleted({
      correlationId: config.correlationId,
      agencyId: config.agencyId,
      skill: skillId,
      status: "failed",
      stepsCompleted: 0,
      totalSteps: 1,
      durationMs: Date.now() - start,
      error: err,
    })
    RuntimeRemediationMetrics.incrementAgencyChainFailed()
    return {
      success: false,
      output: undefined,
      error: err,
      stepsExecuted: 0,
      durationMs: Date.now() - start,
    }
  }

  // Build context
  const skillContext = buildSkillContext(config.agencyId, config.correlationId, skillId, undefined, {
    source: "execution-bridge",
  })

  // Create a task for the skill
  const task: Task = {
    id: `bridge-task-${Date.now()}`,
    type: "skill-execution",
    input,
    priority: 5,
  }

  // Create execution context for runSkill
  const execContext = buildExecutionContext(config.agencyId, config.correlationId, task.id, undefined, {
    source: "execution-bridge",
  })

  log.info("execution bridge invoking runSkill", {
    skillId,
    correlationId: config.correlationId,
    agencyId: config.agencyId,
  })

  // Record chain started
  RuntimeRemediationMetrics.recordAgencyChainStarted({
    correlationId: config.correlationId,
    agencyId: config.agencyId,
    skill: skillId,
  })
  RuntimeRemediationMetrics.incrementAgencyChainStarted()

  try {
    const result = await runSkill(skill, task, execContext)

    if (result.success) {
      RuntimeRemediationMetrics.recordAgencyChainCompleted({
        correlationId: config.correlationId,
        agencyId: config.agencyId,
        skill: skillId,
        status: "success",
        stepsCompleted: 1,
        totalSteps: 1,
        durationMs: Date.now() - start,
      })
      RuntimeRemediationMetrics.incrementAgencyChainCompleted()

      return {
        success: true,
        output: result.output,
        stepsExecuted: 1,
        durationMs: Date.now() - start,
      }
    } else {
      RuntimeRemediationMetrics.recordAgencyChainCompleted({
        correlationId: config.correlationId,
        agencyId: config.agencyId,
        skill: skillId,
        status: "failed",
        stepsCompleted: 0,
        totalSteps: 1,
        durationMs: Date.now() - start,
        error: result.error,
      })
      RuntimeRemediationMetrics.incrementAgencyChainFailed()

      return {
        success: false,
        output: undefined,
        error: result.error,
        stepsExecuted: 0,
        durationMs: Date.now() - start,
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.error("execution bridge runSkill failed", { skillId, error: errorMsg })

    RuntimeRemediationMetrics.recordAgencyChainCompleted({
      correlationId: config.correlationId,
      agencyId: config.agencyId,
      skill: skillId,
      status: "failed",
      stepsCompleted: 0,
      totalSteps: 1,
      durationMs: Date.now() - start,
      error: errorMsg,
    })
    RuntimeRemediationMetrics.incrementAgencyChainFailed()

    return {
      success: false,
      output: undefined,
      error: errorMsg,
      stepsExecuted: 0,
      durationMs: Date.now() - start,
    }
  }
}

/**
 * Execute a chain via executeChain
 */
export async function executeSkillChain(chainId: string, input: unknown, config: BridgeConfig): Promise<BridgeResult> {
  const start = Date.now()

  if (!SESSION_EXECUTION_BRIDGE_ENABLED()) {
    return {
      success: false,
      output: undefined,
      error: "Execution bridge disabled",
      stepsExecuted: 0,
      durationMs: Date.now() - start,
    }
  }

  const chain = getChain(chainId)
  if (!chain) {
    const err = `Chain not found: ${chainId}`
    log.warn("execution bridge chain not found", { chainId })

    RuntimeRemediationMetrics.recordAgencyChainCompleted({
      correlationId: config.correlationId,
      agencyId: config.agencyId,
      skill: chainId,
      chainId,
      status: "failed",
      stepsCompleted: 0,
      totalSteps: 0,
      durationMs: Date.now() - start,
      error: err,
    })
    RuntimeRemediationMetrics.incrementAgencyChainFailed()

    return {
      success: false,
      output: undefined,
      error: err,
      stepsExecuted: 0,
      durationMs: Date.now() - start,
    }
  }

  // Build skill context
  const skillContext = buildSkillContext(config.agencyId, config.correlationId, chainId, undefined, {
    source: "execution-bridge",
    chain: true,
  })

  log.info("execution bridge invoking executeChain", {
    chainId,
    steps: chain.steps.length,
    correlationId: config.correlationId,
    agencyId: config.agencyId,
  })

  RuntimeRemediationMetrics.recordAgencyChainStarted({
    correlationId: config.correlationId,
    agencyId: config.agencyId,
    skill: chainId,
    chainId,
  })
  RuntimeRemediationMetrics.incrementAgencyChainStarted()

  try {
    const result = await executeChain(chainId, input, skillContext)

    // Record step events
    for (let i = 0; i < result.steps.length; i++) {
      const step = result.steps[i]!
      RuntimeRemediationMetrics.recordAgencyChainStep({
        correlationId: config.correlationId,
        agencyId: config.agencyId,
        skill: chainId,
        chainId,
        stepIndex: i,
        stepSkillId: step.skillId,
        success: step.success,
        durationMs: step.durationMs,
        error: step.error,
      })
    }

    if (result.success) {
      RuntimeRemediationMetrics.recordAgencyChainCompleted({
        correlationId: config.correlationId,
        agencyId: config.agencyId,
        skill: chainId,
        chainId,
        status: "success",
        stepsCompleted: result.steps.length,
        totalSteps: chain.steps.length,
        durationMs: Date.now() - start,
      })
      RuntimeRemediationMetrics.incrementAgencyChainCompleted()

      return {
        success: true,
        output: result.finalOutput,
        stepsExecuted: result.steps.length,
        durationMs: Date.now() - start,
      }
    } else {
      RuntimeRemediationMetrics.recordAgencyChainCompleted({
        correlationId: config.correlationId,
        agencyId: config.agencyId,
        skill: chainId,
        chainId,
        status: "failed",
        stepsCompleted: 0,
        totalSteps: chain.steps.length,
        durationMs: Date.now() - start,
        error: result.error,
      })
      RuntimeRemediationMetrics.incrementAgencyChainFailed()

      return {
        success: false,
        output: undefined,
        error: result.error,
        stepsExecuted: 0,
        durationMs: Date.now() - start,
      }
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    log.error("execution bridge executeChain failed", { chainId, error: errorMsg })

    RuntimeRemediationMetrics.recordAgencyChainCompleted({
      correlationId: config.correlationId,
      agencyId: config.agencyId,
      skill: chainId,
      chainId,
      status: "failed",
      stepsCompleted: 0,
      totalSteps: chain.steps.length,
      durationMs: Date.now() - start,
      error: errorMsg,
    })
    RuntimeRemediationMetrics.incrementAgencyChainFailed()

    return {
      success: false,
      output: undefined,
      error: errorMsg,
      stepsExecuted: 0,
      durationMs: Date.now() - start,
    }
  }
}

/**
 * Format bridge result as skill tool output
 */
export function formatBridgeResultAsToolOutput(
  result: BridgeResult,
  skillId: string,
): {
  title: string
  output: string
  metadata: Record<string, unknown>
} {
  if (result.success) {
    return {
      title: `Executed skill: ${skillId}`,
      output: result.output !== undefined ? String(result.output) : "Skill executed successfully",
      metadata: {
        skillExecuted: true,
        success: true,
        stepsExecuted: result.stepsExecuted,
        durationMs: result.durationMs,
      },
    }
  } else {
    return {
      title: `Skill execution failed: ${skillId}`,
      output: result.error ?? "Unknown error",
      metadata: {
        skillExecuted: true,
        success: false,
        error: result.error,
        stepsExecuted: result.stepsExecuted,
        durationMs: result.durationMs,
      },
    }
  }
}
