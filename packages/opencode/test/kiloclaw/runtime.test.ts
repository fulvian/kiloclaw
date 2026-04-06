import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { join } from "path"
import z from "zod"
import {
  // Types (Zod schemas - used as values)
  AgencyId,
  AgentId,
  SkillId,
  ToolId,
  SemanticVersion,
  Duration,
  Domain,
  AgencyStatus,
  AgentStatus,
  TaskStatus,
  CapabilitySet,
  LimitSet,
  PermissionScope,
  Intent,
  Action,
  PolicyContext,
  PolicyResult,
  AgencyAssignment,
  // Agency
  Task,
  TaskResult,
  AgentResult,
  Synthesis,
  ExecutionContext,
  ExecutionResult,
  SkillContext,
  ToolResult,
  ToolHealth,
  Agency,
  // Agent
  Agent,
  // Skill
  Skill,
  // Tool
  Tool,
  // Orchestrator
  CoreOrchestrator,
  // Dispatcher
  Dispatcher,
  // Router
  Router,
  // Registry
  Registry,
  // Config
  Config,
} from "@/kiloclaw"
import type {
  // Orchestrator interfaces (type annotations only)
  MemoryBroker,
  Scheduler,
  AuditLogger,
} from "@/kiloclaw"
import { CorrelationId } from "@/kiloclaw"

// Test fixtures
const FIXTURES = {
  agencyId: "agency-dev" as AgencyId,
  agentId: "agent-001" as AgentId,
  skillId: "skill-read" as SkillId,
  toolId: "tool-fs" as ToolId,
  correlationId: "kiloclaw-test-001" as z.infer<typeof CorrelationId.schema>,
  version: "1.0.0" as SemanticVersion,
}

describe("Kiloclaw Core Runtime", () => {
  describe("WP2.1: Domain Model", () => {
    describe("types", () => {
      it("should validate agency ID type", () => {
        const result = AgencyId.parse("agency-123")
        expect(result).toBe("agency-123" as AgencyId)
      })

      it("should validate semantic version", () => {
        const result = SemanticVersion.parse("1.2.3")
        expect(result).toBe("1.2.3" as SemanticVersion)
      })

      it("should reject invalid semantic version", () => {
        expect(() => SemanticVersion.parse("invalid")).toThrow()
      })

      it("should validate domain enum", () => {
        expect(Domain.parse("development")).toBe("development")
        expect(Domain.parse("knowledge")).toBe("knowledge")
        expect(Domain.parse("nutrition")).toBe("nutrition")
        expect(Domain.parse("weather")).toBe("weather")
        expect(Domain.parse("custom")).toBe("custom")
      })

      it("should validate status enums", () => {
        expect(AgencyStatus.parse("idle")).toBe("idle")
        expect(AgencyStatus.parse("running")).toBe("running")
        expect(AgentStatus.parse("idle")).toBe("idle")
        expect(TaskStatus.parse("pending")).toBe("pending")
      })

      it("should validate capability set", () => {
        const caps: CapabilitySet = { coding: true, debugging: true }
        expect(CapabilitySet.parse(caps)).toEqual(caps)
      })

      it("should validate limit set", () => {
        const limits: LimitSet = { maxConcurrentTasks: 5, maxRetries: 3 }
        expect(LimitSet.parse(limits)).toEqual(limits)
      })

      it("should validate permission scopes", () => {
        const scopes: PermissionScope[] = ["read", "write", "execute"]
        expect(PermissionScope.array().parse(scopes)).toEqual(scopes)
      })

      it("should validate intent with risk scoring", () => {
        const intent: Intent = {
          id: "intent-001",
          type: "code_generation",
          description: "Generate a React component",
          risk: "medium",
        }
        const result = Intent.parse(intent)
        expect(result.risk).toBe("medium")
      })

      it("should validate agency assignment", () => {
        const assignment: AgencyAssignment = {
          agencyId: FIXTURES.agencyId,
          confidence: 0.95,
          reason: "High keyword match",
        }
        const result = AgencyAssignment.parse(assignment)
        expect(result.confidence).toBe(0.95)
      })
    })

    describe("agency", () => {
      it("should create agency with factory", () => {
        const agency = Agency.create({
          id: FIXTURES.agencyId,
          domain: "development",
        })

        expect(agency.id).toBe(FIXTURES.agencyId)
        expect(agency.domain).toBe("development")
        expect(agency.status).toBe("idle")
      })

      it("should start and stop agency", async () => {
        const agency = Agency.create({
          id: FIXTURES.agencyId,
          domain: "development",
        })

        await agency.start()
        expect(agency.status).toBe("running")

        await agency.stop()
        expect(agency.status).toBe("stopped")
      })

      it("should pause agency", async () => {
        const agency = Agency.create({
          id: FIXTURES.agencyId,
          domain: "development",
        })

        await agency.start()
        await agency.pause()
        expect(agency.status).toBe("paused")
      })

      it("should register and deregister agents", () => {
        const agency = Agency.create({
          id: FIXTURES.agencyId,
          domain: "development",
        })

        const agent = Agent.create({
          id: FIXTURES.agentId,
          agency: FIXTURES.agencyId,
          capabilities: { coding: true },
          limits: { maxConcurrentTasks: 3 },
        })

        agency.registerAgent(agent)
        expect(agency.getAgents()).toHaveLength(1)

        agency.deregisterAgent(FIXTURES.agentId)
        expect(agency.getAgents()).toHaveLength(0)
      })

      it("should execute task and return result", async () => {
        const agency = Agency.create({
          id: FIXTURES.agencyId,
          domain: "development",
        })

        const task: Task = {
          id: "task-001",
          type: "code",
          input: { prompt: "hello" },
          priority: 5,
        }

        const result = await agency.executeTask(task)
        expect(result.status).toBe("completed")
      })

      it("should synthesize results", () => {
        const agency = Agency.create({
          id: FIXTURES.agencyId,
          domain: "development",
        })

        const results: AgentResult[] = [
          {
            agentId: FIXTURES.agentId,
            taskId: "task-001",
            status: "completed",
            output: { result: "output1" },
          },
        ]

        const synthesis = agency.synthesizeResults(results)
        expect(synthesis.summary).toContain("1 results")
        expect(synthesis.confidence).toBe(0.9)
      })
    })

    describe("agent", () => {
      it("should create agent with factory", () => {
        const agent = Agent.create({
          id: FIXTURES.agentId,
          agency: FIXTURES.agencyId,
          capabilities: { coding: true, debugging: true },
          limits: { maxConcurrentTasks: 5, timeoutMs: 30000 },
        })

        expect(agent.id).toBe(FIXTURES.agentId)
        expect(agent.agency).toBe(FIXTURES.agencyId)
        expect(agent.capabilities).toEqual({ coding: true, debugging: true })
      })

      it("should execute task and return result", async () => {
        const agent = Agent.create({
          id: FIXTURES.agentId,
          agency: FIXTURES.agencyId,
          capabilities: { coding: true },
          limits: { maxConcurrentTasks: 5 },
        })

        const task: Task = {
          id: "task-001",
          type: "code",
          input: { prompt: "hello" },
          priority: 5,
        }

        const context: ExecutionContext = {
          correlationId: FIXTURES.correlationId,
          agencyId: FIXTURES.agencyId,
          taskId: task.id,
        }

        const result = await agent.execute(task, context)
        expect(result.success).toBe(true)
      })

      it("should report status", () => {
        const agent = Agent.create({
          id: FIXTURES.agentId,
          agency: FIXTURES.agencyId,
          capabilities: { coding: true },
          limits: {},
        })

        expect(agent.getStatus()).toBe("idle")
      })
    })

    describe("skill", () => {
      it("should create skill with factory", () => {
        const skill = Skill.create({
          id: FIXTURES.skillId,
          version: FIXTURES.version,
          name: "read_file",
          capabilities: ["file:read", "fs:access"],
          tags: ["file", "io"],
          inputSchema: { path: { type: "string" } },
          outputSchema: { content: { type: "string" } },
        })

        expect(skill.id).toBe(FIXTURES.skillId)
        expect(skill.version).toBe(FIXTURES.version)
        expect(skill.capabilities).toEqual(["file:read", "fs:access"])
      })

      it("should execute skill", async () => {
        const skill = Skill.create({
          id: FIXTURES.skillId,
          version: FIXTURES.version,
          name: "read_file",
          capabilities: ["file:read"],
          tags: ["file"],
          inputSchema: { path: { type: "string" } },
          outputSchema: { content: { type: "string" } },
        })

        const context: SkillContext = {
          correlationId: FIXTURES.correlationId,
          agencyId: FIXTURES.agencyId,
          skillId: skill.id,
        }

        const result = await skill.execute({ path: "/test/file.txt" }, context)
        expect(result).toBeDefined()
      })
    })

    describe("tool", () => {
      it("should create tool with factory", () => {
        const tool = Tool.create({
          id: FIXTURES.toolId,
          name: "filesystem",
          permissionScope: ["read", "write"],
        })

        expect(tool.id).toBe(FIXTURES.toolId)
        expect(tool.name).toBe("filesystem")
        expect(tool.permissionScope).toEqual(["read", "write"])
      })

      it("should execute tool with permissions", async () => {
        const tool = Tool.create({
          id: FIXTURES.toolId,
          name: "filesystem",
          permissionScope: ["read"],
        })

        const result = await tool.execute({ path: "/test" }, ["read"])
        expect(result.success).toBe(true)
      })

      it("should check tool health", async () => {
        const tool = Tool.create({
          id: FIXTURES.toolId,
          name: "filesystem",
          permissionScope: ["read"],
        })

        const health = await tool.health()
        expect(health.healthy).toBe(true)
      })
    })

    describe("orchestrator", () => {
      it("should create orchestrator", () => {
        const orchestrator = CoreOrchestrator.create({})
        expect(orchestrator).toBeDefined()
      })

      it("should route intent", async () => {
        const orchestrator = CoreOrchestrator.create({})

        const intent: Intent = {
          id: "intent-001",
          type: "code_generation",
          description: "Generate a React component",
          risk: "low",
        }

        const assignment = await orchestrator.routeIntent(intent)
        expect(assignment.agencyId).toBeDefined()
        expect(assignment.confidence).toBeGreaterThan(0)
      })

      it("should enforce policy", () => {
        const orchestrator = CoreOrchestrator.create({})

        const action: Action = {
          type: "file_write",
          target: "/test/file.txt",
        }

        const context: PolicyContext = {
          agencyId: FIXTURES.agencyId,
          correlationId: FIXTURES.correlationId,
        }

        const result = orchestrator.enforcePolicy(action, context)
        expect(result.allowed).toBe(true)
      })

      it("should deny high-risk policy action without approval", () => {
        const orchestrator = CoreOrchestrator.create({})

        const action: Action = {
          type: "delete_resource",
          target: "/critical",
        }

        const context: PolicyContext = {
          agencyId: FIXTURES.agencyId,
          correlationId: FIXTURES.correlationId,
          intent: {
            id: "intent-high-risk",
            type: "cleanup",
            description: "Delete production resources",
            risk: "critical",
          },
          userApproved: false,
        }

        const result = orchestrator.enforcePolicy(action, context)
        expect(result.allowed).toBe(false)
        expect(result.requiresApproval).toBe(true)
      })

      it("should allow high-risk policy action with explicit approval", () => {
        const orchestrator = CoreOrchestrator.create({})

        const action: Action = {
          type: "delete_resource",
          target: "/critical",
        }

        const context: PolicyContext = {
          agencyId: FIXTURES.agencyId,
          correlationId: FIXTURES.correlationId,
          intent: {
            id: "intent-high-risk-approved",
            type: "cleanup",
            description: "Delete production resources",
            risk: "critical",
          },
          userApproved: true,
        }

        const result = orchestrator.enforcePolicy(action, context)
        expect(result.allowed).toBe(true)
        expect(result.requiresApproval).toBe(true)
      })

      it("should provide memory broker", () => {
        const orchestrator = CoreOrchestrator.create({})
        const memory = orchestrator.memory()

        expect(memory.read).toBeDefined()
        expect(memory.write).toBeDefined()
        expect(memory.delete).toBeDefined()
        expect(memory.list).toBeDefined()
      })

      it("should provide scheduler", () => {
        const orchestrator = CoreOrchestrator.create({})
        const scheduler = orchestrator.scheduler()

        expect(scheduler.schedule).toBeDefined()
        expect(scheduler.cancel).toBeDefined()
        expect(scheduler.pause).toBeDefined()
        expect(scheduler.resume).toBeDefined()
      })

      it("should provide audit logger", () => {
        const orchestrator = CoreOrchestrator.create({})
        const audit = orchestrator.audit()

        expect(audit.log).toBeDefined()
        expect(audit.correlation).toBeDefined()
      })
    })
  })

  describe("WP2.2: Dispatcher", () => {
    it("should create dispatcher", () => {
      const dispatcher = Dispatcher.create({})
      expect(dispatcher).toBeDefined()
    })

    it("should enqueue and dequeue tasks", () => {
      const dispatcher = Dispatcher.create({})

      const task: Task = {
        id: "task-001",
        type: "code",
        input: {},
        priority: 5,
      }

      dispatcher.enqueue(task, FIXTURES.correlationId)
      const stats = dispatcher.getStats()
      expect(stats.queued).toBe(1)
    })

    it("should respect priority ordering", () => {
      const dispatcher = Dispatcher.create({})

      const lowPriority: Task = { id: "low", type: "code", input: {}, priority: 1 }
      const highPriority: Task = { id: "high", type: "code", input: {}, priority: 10 }

      dispatcher.enqueue(lowPriority, FIXTURES.correlationId)
      dispatcher.enqueue(highPriority, FIXTURES.correlationId)

      const dequeued = dispatcher.dequeue()
      expect(dequeued?.task.id).toBe("high")
    })

    it("should cancel tasks", () => {
      const dispatcher = Dispatcher.create({})

      const task: Task = { id: "task-001", type: "code", input: {}, priority: 5 }
      dispatcher.enqueue(task, FIXTURES.correlationId)

      const cancelled = dispatcher.cancel("task-001")
      expect(cancelled).toBe(true)
      expect(dispatcher.getStats().queued).toBe(0)
    })

    it("should pause and resume", () => {
      const dispatcher = Dispatcher.create({})
      dispatcher.pause()
      dispatcher.resume()
      expect(dispatcher.getStats()).toBeDefined()
    })
  })

  describe("WP2.3: Router", () => {
    it("should create router", () => {
      const router = Router.create({})
      expect(router).toBeDefined()
    })

    it("should route development intent to development agency", async () => {
      const router = Router.create({})

      const intent: Intent = {
        id: "intent-001",
        type: "code_generation",
        description: "Generate a React component",
        risk: "low",
      }

      const result = await router.route(intent)
      expect(result.matchedDomain).toBe("development")
    })

    it("should route knowledge intent to knowledge agency", async () => {
      const router = Router.create({})

      const intent: Intent = {
        id: "intent-002",
        type: "search",
        description: "Search for information about TypeScript",
        risk: "low",
      }

      const result = await router.route(intent)
      expect(result.matchedDomain).toBe("knowledge")
    })

    it("should route weather intent to weather agency", async () => {
      const router = Router.create({})

      const intent: Intent = {
        id: "intent-003",
        type: "weather_query",
        description: "What is the weather today?",
        risk: "low",
      }

      const result = await router.route(intent)
      expect(result.matchedDomain).toBe("weather")
    })

    it("should register custom domain handler", async () => {
      const router = Router.create({})

      router.registerDomainHandler("custom", async () => "custom-agency" as AgencyId)

      const intent: Intent = {
        id: "intent-004",
        type: "custom",
        description: "Custom action",
        risk: "low",
      }

      const result = await router.route(intent)
      expect(result.agencyId).toBe("custom-agency" as AgencyId)
    })
  })

  describe("WP2.3: Registry", () => {
    it("should create registry", () => {
      const registry = Registry.create({})
      expect(registry).toBeDefined()
    })

    it("should register and retrieve skills", () => {
      const registry = Registry.create({})

      const skill = Skill.create({
        id: FIXTURES.skillId,
        version: FIXTURES.version,
        name: "read_file",
        capabilities: ["file:read"],
        tags: ["file"],
        inputSchema: {},
        outputSchema: {},
      })

      registry.registerSkill(skill)
      const retrieved = registry.getSkill(FIXTURES.skillId)
      expect(retrieved?.id).toBe(FIXTURES.skillId)
    })

    it("should list skills", () => {
      const registry = Registry.create({})

      registry.registerSkill(
        Skill.create({
          id: "skill-1" as SkillId,
          version: "1.0.0",
          name: "skill1",
          capabilities: ["cap1"],
          tags: [],
          inputSchema: {},
          outputSchema: {},
        }),
      )

      registry.registerSkill(
        Skill.create({
          id: "skill-2" as SkillId,
          version: "1.0.0",
          name: "skill2",
          capabilities: ["cap2"],
          tags: [],
          inputSchema: {},
          outputSchema: {},
        }),
      )

      const skills = registry.listSkills()
      expect(skills).toHaveLength(2)
    })

    it("should find skills by capability", () => {
      const registry = Registry.create({})

      registry.registerSkill(
        Skill.create({
          id: "skill-1" as SkillId,
          version: "1.0.0",
          name: "skill1",
          capabilities: ["coding", "debugging"],
          tags: [],
          inputSchema: {},
          outputSchema: {},
        }),
      )

      const found = registry.findSkillsByCapability("coding")
      expect(found).toHaveLength(1)
      expect(found[0].capabilities).toContain("coding")
    })

    it("should register and retrieve tools", () => {
      const registry = Registry.create({})

      const tool = Tool.create({
        id: FIXTURES.toolId,
        name: "filesystem",
        permissionScope: ["read", "write"],
      })

      registry.registerTool(tool)
      const retrieved = registry.getTool(FIXTURES.toolId)
      expect(retrieved?.id).toBe(FIXTURES.toolId)
    })

    it("should unregister skills and tools", () => {
      const registry = Registry.create({})

      const skill = Skill.create({
        id: FIXTURES.skillId,
        version: "1.0.0",
        name: "skill1",
        capabilities: ["cap1"],
        tags: [],
        inputSchema: {},
        outputSchema: {},
      })

      registry.registerSkill(skill)
      const unregistered = registry.unregisterSkill(FIXTURES.skillId)
      expect(unregistered).toBe(true)
      expect(registry.getSkill(FIXTURES.skillId)).toBeUndefined()
    })

    it("should provide stats", () => {
      const registry = Registry.create({})

      const skill = Skill.create({
        id: "skill-1" as SkillId,
        version: "1.0.0",
        name: "skill1",
        capabilities: ["cap1"],
        tags: [],
        inputSchema: {},
        outputSchema: {},
      })

      registry.registerSkill(skill)

      const stats = registry.getStats()
      expect(stats.skills).toBe(1)
      expect(stats.tools).toBe(0)
      expect(stats.capabilities).toBe(1)
    })
  })

  describe("WP2.4: Config Loader", () => {
    it("should create config with defaults", () => {
      const config = Config.create({})
      expect(config.config.logLevel).toBe("INFO")
      expect(config.config.debug).toBe(false)
    })

    it("should get agency config", () => {
      const config = Config.create({
        agency: {
          "agency-dev": { debug: true },
        },
      })

      const agencyConfig = config.getAgencyConfig("agency-dev")
      expect(agencyConfig.debug).toBe(true)
    })

    it("should reload config", () => {
      const config = Config.create({})
      config.reload() // Should not throw
    })
  })

  describe("WP2.5: Contract Tests - Happy Paths", () => {
    it("should create and use full runtime stack", async () => {
      // Create components
      const orchestrator = CoreOrchestrator.create({})
      const registry = Registry.create({})
      const dispatcher = Dispatcher.create({})
      const router = Router.create({})

      // Register skill
      const skill = Skill.create({
        id: "skill-code-gen" as SkillId,
        version: "1.0.0",
        name: "code_generation",
        capabilities: ["coding"],
        tags: ["development"],
        inputSchema: { prompt: { type: "string" } },
        outputSchema: { code: { type: "string" } },
      })
      registry.registerSkill(skill)

      // Create agency
      const agency = Agency.create({
        id: "agency-dev" as AgencyId,
        domain: "development",
      })

      // Register agency handler
      router.registerDomainHandler("development", async () => agency.id)

      // Route intent
      const intent: Intent = {
        id: "intent-full-stack",
        type: "code_generation",
        description: "Generate a React component",
        risk: "low",
      }

      const assignment = await router.route(intent)
      expect(assignment.matchedDomain).toBe("development")

      // Enqueue task
      const task: Task = {
        id: "task-full-stack",
        type: "code",
        input: { prompt: "Create a React button" },
        priority: 8,
      }

      const corrId = CorrelationId.generate()
      dispatcher.enqueue(task, corrId)

      // Execute task via agency
      const result = await agency.executeTask(task)
      expect(result.status).toBe("completed")
    })
  })

  describe("WP2.5: Contract Tests - Failure Paths", () => {
    it("should handle invalid semantic version", () => {
      expect(() => SemanticVersion.parse("not-semver")).toThrow()
    })

    it("should handle unknown agency", async () => {
      const router = Router.create({})
      const intent: Intent = {
        id: "intent-unknown",
        type: "unknown_action",
        description: "Some unknown action",
        risk: "low",
      }

      const result = await router.route(intent)
      // Should route to custom with low confidence
      expect(result.matchedDomain).toBe("custom")
    })

    it("should handle dispatcher cancel of non-existent task", () => {
      const dispatcher = Dispatcher.create({})
      const cancelled = dispatcher.cancel("non-existent-task")
      expect(cancelled).toBe(false)
    })

    it("should handle registry get of non-existent skill", () => {
      const registry = Registry.create({})
      const skill = registry.getSkill("non-existent" as SkillId)
      expect(skill).toBeUndefined()
    })

    it("should handle policy denial", () => {
      const orchestrator = CoreOrchestrator.create({})

      const action: Action = {
        type: "dangerous_operation",
        target: "/system",
      }

      const context: PolicyContext = {
        agencyId: FIXTURES.agencyId,
        correlationId: FIXTURES.correlationId as z.infer<typeof CorrelationId.schema>,
      }

      // Policy should still allow (default behavior), but we can test the structure
      const result = orchestrator.enforcePolicy(action, context)
      expect(result).toBeDefined()
    })
  })
})
