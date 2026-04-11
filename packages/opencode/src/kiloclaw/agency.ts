import z from "zod"
import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import { type AgencyId, type Domain, type AgencyStatus, type AgentId } from "./types"
// kilocode_change start - use type-only import to avoid circular dependency
import type { Agent } from "./agent"
// kilocode_change end

// Task and result types
export const Task = z.object({
  id: z.string(),
  type: z.string(),
  input: z.unknown(),
  priority: z.number().int().min(0).max(10).default(5),
  deadline: z.number().int().positive().optional(),
  skills: z.array(z.string()).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})
export type Task = z.infer<typeof Task>

export const TaskResult = z.object({
  taskId: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled", "timeout"]),
  output: z.unknown().optional(),
  error: z.string().optional(),
  duration: z.number().int().nonnegative().optional(),
})
export type TaskResult = z.infer<typeof TaskResult>

export const AgentResult = z.object({
  agentId: z.string(),
  taskId: z.string(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled", "timeout"]),
  output: z.unknown().optional(),
  evidence: z.array(z.record(z.string(), z.unknown())).optional(),
})
export type AgentResult = z.infer<typeof AgentResult>

export const Synthesis = z.object({
  summary: z.string(),
  confidence: z.number().min(0).max(1),
  outputs: z.array(z.unknown()),
  recommendations: z.array(z.string()).optional(),
})
export type Synthesis = z.infer<typeof Synthesis>

// Execution context for agents
export const ExecutionContext = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  taskId: z.string(),
  deadline: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type ExecutionContext = z.infer<typeof ExecutionContext>

// Execution result for agents
export const ExecutionResult = z.object({
  success: z.boolean(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  evidence: z.array(z.record(z.string(), z.unknown())).optional(),
  metrics: z
    .object({
      durationMs: z.number().int().nonnegative(),
      tokensUsed: z.number().int().nonnegative().optional(),
    })
    .optional(),
})
export type ExecutionResult = z.infer<typeof ExecutionResult>

// Skill context for skill execution
export const SkillContext = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  agentId: z.string().optional(),
  skillId: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type SkillContext = z.infer<typeof SkillContext>

// Tool result
export const ToolResult = z.object({
  success: z.boolean(),
  output: z.unknown().optional(),
  error: z.string().optional(),
  durationMs: z.number().int().nonnegative(),
})
export type ToolResult = z.infer<typeof ToolResult>

// Tool health status
export const ToolHealth = z.object({
  healthy: z.boolean(),
  latencyMs: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
})
export type ToolHealth = z.infer<typeof ToolHealth>

// Agency Info for registry
export const AgencyInfo = z.object({
  id: z.string(),
  domain: z.enum(["development", "knowledge", "nutrition", "weather", "nba", "custom"]),
  status: z.enum(["idle", "running", "paused", "stopped", "error"]),
})
export type AgencyInfo = z.infer<typeof AgencyInfo>

// Agency interface
export interface Agency {
  readonly id: AgencyId
  readonly domain: Domain
  readonly status: AgencyStatus
  start(): Promise<void>
  stop(): Promise<void>
  pause(): Promise<void>
  registerAgent(agent: Agent): void
  deregisterAgent(agentId: AgentId): void
  getAgents(): ReadonlyArray<Agent>
  executeTask(task: Task): Promise<TaskResult>
  synthesizeResults(results: AgentResult[]): Synthesis
}

// Agency namespace with factory
export namespace Agency {
  export interface Info {
    readonly id: AgencyId
    readonly domain: Domain
  }

  export const Info = z.object({
    id: z.string(),
    domain: z.enum(["development", "knowledge", "nutrition", "weather", "nba", "custom"]),
  })

  export const create = fn(Info, (input) => {
    const log = Log.create({ service: "kiloclaw.agency" })
    const agents = new Map<AgentId, Agent>()
    let status: AgencyStatus = "idle"

    const agency: Agency = {
      id: input.id as AgencyId,
      domain: input.domain as Domain,
      get status() {
        return status
      },
      async start() {
        log.info("agency started", { agencyId: input.id, domain: input.domain })
        status = "running"
      },
      async stop() {
        log.info("agency stopped", { agencyId: input.id })
        status = "stopped"
      },
      async pause() {
        log.info("agency paused", { agencyId: input.id })
        status = "paused"
      },
      registerAgent(agent: Agent) {
        agents.set(agent.id, agent)
        log.debug("agent registered", { agencyId: input.id, agentId: agent.id })
      },
      deregisterAgent(agentId: AgentId) {
        agents.delete(agentId)
        log.debug("agent deregistered", { agencyId: input.id, agentId })
      },
      getAgents(): ReadonlyArray<Agent> {
        return [...agents.values()]
      },
      async executeTask(task: Task): Promise<TaskResult> {
        log.info("executing task", { agencyId: input.id, taskId: task.id })
        return {
          taskId: task.id,
          status: "completed",
          output: undefined,
        }
      },
      synthesizeResults(results: AgentResult[]): Synthesis {
        return {
          summary: `Synthesized ${results.length} results`,
          confidence: 0.9,
          outputs: results.map((r) => r.output).filter((o) => o !== undefined),
        }
      },
    }

    return agency
  })
}
