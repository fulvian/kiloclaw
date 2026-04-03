// Kiloclaw CLI commands - Agency, Skill, and Provider management
import { cmd } from "./cmd"
import { getCatalog, type Provider } from "../../kiloclaw/agency/catalog"
import { KeyManager } from "../../kiloclaw/agency/key-pool"
import { AgentFactory } from "../../kiloclaw/agency/factory"
import { AgencyName } from "../../kiloclaw/agency/types"
import { allSkills, knowledgeSkills, developmentSkills, nutritionSkills, weatherSkills } from "../../kiloclaw/skills"
import { Log } from "@/util/log"
import { EOL } from "os"

const log = Log.create({ service: "kiloclaw.cli" })

function skillsForAgency(domain: string) {
  if (domain === "development") return developmentSkills
  if (domain === "knowledge") return knowledgeSkills
  if (domain === "nutrition") return nutritionSkills
  if (domain === "weather") return weatherSkills
  return []
}

// Agency List Command
const AgencyListCommand = cmd({
  command: "list",
  describe: "list all available agencies",
  builder: (yargs) =>
    yargs.option("json", {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    }),
  async handler(args) {
    const catalog = getCatalog()
    catalog.bootstrapDefaultCatalog()
    const agencies = catalog.listAgencies()

    if (args.json) {
      console.log(JSON.stringify(agencies, null, 2))
      return
    }

    if (agencies.length === 0) {
      console.log("No agencies registered.")
      return
    }

    console.log("Available Agencies:")
    console.log("=".repeat(60))
    for (const agency of agencies) {
      const providers = catalog.listProviders(agency.domain as any)
      const skills = skillsForAgency(agency.domain)
      console.log(`\n[${agency.domain.toUpperCase()}]`)
      console.log(`  ID: ${agency.id}`)
      console.log(`  Status: ${agency.status}`)
      console.log(`  Providers: ${providers.length}`)
      console.log(`  Skills: ${skills.length}`)
    }
    console.log(`\nTotal: ${agencies.length} agencies`)
  },
})

// Agency Info Command
const AgencyInfoCommand = cmd({
  command: "info <name>",
  describe: "show detailed information about an agency",
  builder: (yargs) =>
    yargs.positional("name", {
      type: "string",
      describe: "agency name (knowledge, development, nutrition, weather)",
      demandOption: true,
    }),
  async handler(args) {
    const catalog = getCatalog()
    catalog.bootstrapDefaultCatalog()
    const name = args.name as string

    const agency = catalog.getAgencyByDomain(name as any)
    if (!agency) {
      console.error(`Agency not found: ${name}`)
      console.error("Available agencies: knowledge, development, nutrition, weather")
      process.exit(1)
    }

    const providers = catalog.listProviders(agency.domain as any)
    const skills = skillsForAgency(agency.domain)

    console.log(`\nAgency: ${agency.domain.toUpperCase()}`)
    console.log("=".repeat(60))
    console.log(`ID: ${agency.id}`)
    console.log(`Domain: ${agency.domain}`)
    console.log(`Status: ${agency.status}`)

    console.log(`\nProviders (${providers.length}):`)
    for (const p of providers) {
      console.log(`  - ${p.name}`)
    }

    console.log(`\nSkills (${skills.length}):`)
    for (const s of skills) {
      console.log(`  - ${s.name} (${s.id}) - ${s.capabilities.join(", ")}`)
    }
  },
})

// Agency Command
const AgencyCommand = cmd({
  command: "agency",
  describe: "manage agencies",
  builder: (yargs) => yargs.command(AgencyListCommand).command(AgencyInfoCommand).demandCommand(),
  async handler() {},
})

// Skill List Command
const SkillListCommand = cmd({
  command: "list",
  describe: "list all skills, optionally filtered by agency",
  builder: (yargs) =>
    yargs
      .option("agency", {
        type: "string",
        describe: "filter by agency (knowledge, development, nutrition, weather)",
      })
      .option("json", {
        type: "boolean",
        description: "Output as JSON",
        default: false,
      }),
  async handler(args) {
    let skills
    if (args.agency) {
      switch (args.agency) {
        case "knowledge":
          skills = knowledgeSkills
          break
        case "development":
          skills = developmentSkills
          break
        case "nutrition":
          skills = nutritionSkills
          break
        case "weather":
          skills = weatherSkills
          break
        default:
          console.error(`Unknown agency: ${args.agency}`)
          process.exit(1)
      }
    } else {
      skills = allSkills
    }

    if (args.json) {
      console.log(
        JSON.stringify(
          skills.map((s) => ({
            id: s.id,
            name: s.name,
            version: s.version,
            capabilities: s.capabilities,
            tags: s.tags,
          })),
          null,
          2,
        ),
      )
      return
    }

    console.log(`\nSkills${args.agency ? ` (${args.agency})` : ""}: ${skills.length}`)
    console.log("=".repeat(60))
    for (const s of skills) {
      console.log(`\n[${s.name}]`)
      console.log(`  ID: ${s.id}`)
      console.log(`  Version: ${s.version}`)
      console.log(`  Capabilities: ${s.capabilities.join(", ")}`)
      console.log(`  Tags: ${s.tags.join(", ")}`)
    }
  },
})

// Skill Info Command
const SkillInfoCommand = cmd({
  command: "info <name>",
  describe: "show detailed information about a skill",
  builder: (yargs) =>
    yargs.positional("name", {
      type: "string",
      describe: "skill name or ID",
      demandOption: true,
    }),
  async handler(args) {
    const name = args.name as string
    const skill = allSkills.find((s) => s.name === name || s.id === name)

    if (!skill) {
      console.error(`Skill not found: ${name}`)
      console.error("Use 'kiloclaw skill list' to see available skills.")
      process.exit(1)
    }

    console.log(`\nSkill: ${skill.name}`)
    console.log("=".repeat(60))
    console.log(`ID: ${skill.id}`)
    console.log(`Version: ${skill.version}`)
    console.log(`Capabilities: ${skill.capabilities.join(", ")}`)
    console.log(`Tags: ${skill.tags.join(", ")}`)
    console.log(`\nInput Schema:`)
    console.log(JSON.stringify(skill.inputSchema, null, 2))
    console.log(`\nOutput Schema:`)
    console.log(JSON.stringify(skill.outputSchema, null, 2))
  },
})

// Skill Command
const SkillCommand = cmd({
  command: "skill",
  describe: "manage skills",
  builder: (yargs) => yargs.command(SkillListCommand).command(SkillInfoCommand).demandCommand(),
  async handler() {},
})

// Provider List Command
const ProviderListCommand = cmd({
  command: "list",
  describe: "list all available providers, optionally filtered by agency",
  builder: (yargs) =>
    yargs.option("agency", {
      type: "string",
      describe: "filter by agency (knowledge, development, nutrition, weather)",
    }),
  async handler(args) {
    const catalog = getCatalog()
    catalog.bootstrapDefaultCatalog()
    const providers = catalog.listProviders(args.agency as any)

    console.log(`\nProviders${args.agency ? ` (${args.agency})` : ""}: ${providers.length}`)
    console.log("=".repeat(60))
    for (const p of providers) {
      console.log(`\n[${p.name}]`)
      console.log(`  Agency: ${p.agency}`)
    }
  },
})

// Provider Health Command
const ProviderHealthCommand = cmd({
  command: "health <name>",
  describe: "check health status of a provider",
  builder: (yargs) =>
    yargs.positional("name", {
      type: "string",
      describe: "provider name",
      demandOption: true,
    }),
  async handler(args) {
    const catalog = getCatalog()
    catalog.bootstrapDefaultCatalog()
    const name = args.name as string
    const provider = catalog.getProvider(name)

    if (!provider) {
      console.error(`Provider not found: ${name}`)
      console.error("Use 'kiloclaw provider list' to see available providers.")
      process.exit(1)
    }

    console.log(`\nChecking health of ${provider.name}...`)
    try {
      const healthy = await provider.health()
      if (healthy) {
        console.log(`✅ ${provider.name} is healthy`)
      } else {
        console.log(`❌ ${provider.name} is unhealthy`)
        process.exit(1)
      }
    } catch (err) {
      console.log(`❌ ${provider.name} check failed: ${err instanceof Error ? err.message : String(err)}`)
      process.exit(1)
    }
  },
})

// Provider Keys Command - Show API key status and rotation
const ProviderKeysCommand = cmd({
  command: "keys",
  describe: "show API key status and rotation for providers",
  builder: (yargs) =>
    yargs.option("provider", {
      type: "string",
      describe: "show keys for specific provider only",
    }),
  async handler(args) {
    const keyManager = KeyManager.getInstance()
    keyManager.loadAllFromEnv()

    const providers = keyManager.listProviders()

    if (providers.length === 0) {
      console.log("\nNo API key pools configured.")
      console.log("\nConfigure keys using environment variables:")
      console.log("  export TAVILY_API_KEY_1=tvly_xxxxx")
      console.log("  export TAVILY_API_KEY_2=tvly_yyyyy")
      console.log("  export FIRECRAWL_API_KEYS=fc_xxxx,fc_yyyy")
      return
    }

    console.log("\nAPI Key Pools Status")
    console.log("=".repeat(60))

    const filterProvider = args.provider as string | undefined

    for (const p of providers) {
      if (filterProvider && p.provider.toLowerCase() !== filterProvider.toLowerCase()) {
        continue
      }

      const pool = keyManager.getPool(p.provider.toUpperCase())
      const stats = pool.getStats()
      const keys = pool.listKeys()

      console.log(`\n[${p.provider.toUpperCase()}]`)
      console.log(`  Total Keys: ${stats.totalKeys}`)
      console.log(`  Available:  ${stats.availableKeys}`)
      console.log(`  At Limit:   ${stats.keysAtMinuteLimit} (minute) / ${stats.keysAtDailyLimit} (daily)`)
      console.log(`  In Cooldown: ${stats.keysInCooldown}`)

      if (keys.length > 0) {
        console.log("  Keys:")
        for (const k of keys) {
          const status = k.isAvailable ? "✅" : "❌"
          const lastUsed = k.lastUsed ? new Date(k.lastUsed).toLocaleTimeString() : "never"
          console.log(`    ${status} ${k.maskedKey} (last used: ${lastUsed})`)
        }
      }
    }
  },
})

// Provider Command
const ProviderCommand = cmd({
  command: "provider",
  describe: "manage search and data providers",
  builder: (yargs) =>
    yargs.command(ProviderListCommand).command(ProviderHealthCommand).command(ProviderKeysCommand).demandCommand(),
  async handler() {},
})

// Agent List Command
const AgentListCommand = cmd({
  command: "list",
  describe: "list all agents, optionally filtered by agency",
  builder: (yargs) =>
    yargs
      .option("agency", {
        type: "string",
        describe: "filter by agency (knowledge, development, nutrition, weather)",
      })
      .option("json", {
        type: "boolean",
        description: "Output as JSON",
        default: false,
      }),
  async handler(args) {
    const agency = args.agency as AgencyName | undefined

    const agents = agency ? AgentFactory.listAgentsByAgency(agency) : AgentFactory.listAgents()

    if (args.json) {
      console.log(
        JSON.stringify(
          agents.map((a) => ({
            id: a.id,
            name: a.name,
            agencyOwner: a.agencyOwner,
            agencyCross: a.agencyCross,
            taskTypes: a.taskTypes,
            skills: a.skills,
            capabilities: a.capabilities,
            description: a.description,
            version: a.version,
          })),
          null,
          2,
        ),
      )
      return
    }

    console.log(`\nAgents${agency ? ` (${agency})` : ""}: ${agents.length}`)
    console.log("=".repeat(60))
    for (const a of agents) {
      console.log(`\n[${a.name}]`)
      console.log(`  ID: ${a.id}`)
      console.log(`  Agency Owner: ${a.agencyOwner}`)
      if (a.agencyCross.length > 0) {
        console.log(`  Agency Cross: ${a.agencyCross.join(", ")}`)
      }
      console.log(`  Tasks: ${a.taskTypes.join(", ")}`)
      console.log(`  Skills: ${a.skills.join(", ")}`)
    }
  },
})

// Agent Info Command
const AgentInfoCommand = cmd({
  command: "info <name>",
  describe: "show detailed information about an agent",
  builder: (yargs) =>
    yargs.positional("name", {
      type: "string",
      describe: "agent name or ID",
      demandOption: true,
    }),
  async handler(args) {
    const name = args.name as string
    const agents = AgentFactory.listAgents()
    const agent = agents.find((a) => a.id === name || a.name.toLowerCase() === name.toLowerCase())

    if (!agent) {
      console.error(`Agent not found: ${name}`)
      console.error("Use 'kiloclaw agent list' to see available agents.")
      process.exit(1)
    }

    console.log(`\nAgent: ${agent.name}`)
    console.log("=".repeat(60))
    console.log(`ID: ${agent.id}`)
    console.log(`Version: ${agent.version}`)
    console.log(`Agency Owner: ${agent.agencyOwner}`)
    console.log(`Agency Cross: ${agent.agencyCross.length > 0 ? agent.agencyCross.join(", ") : "(none)"}`)
    console.log(`\nDescription: ${agent.description}`)
    console.log(`\nTask Types (${agent.taskTypes.length}):`)
    for (const t of agent.taskTypes) {
      console.log(`  - ${t}`)
    }
    console.log(`\nSkills (${agent.skills.length}):`)
    for (const s of agent.skills) {
      console.log(`  - ${s}`)
    }
    console.log(`\nCapabilities (${agent.capabilities.length}):`)
    for (const c of agent.capabilities) {
      console.log(`  - ${c}`)
    }
  },
})

// Agent Tasks Command
const AgentTasksCommand = cmd({
  command: "tasks <name>",
  describe: "show the tasks an agent can perform",
  builder: (yargs) =>
    yargs.positional("name", {
      type: "string",
      describe: "agent name or ID",
      demandOption: true,
    }),
  async handler(args) {
    const name = args.name as string
    const agents = AgentFactory.listAgents()
    const agent = agents.find((a) => a.id === name || a.name.toLowerCase() === name.toLowerCase())

    if (!agent) {
      console.error(`Agent not found: ${name}`)
      console.error("Use 'kiloclaw agent list' to see available agents.")
      process.exit(1)
    }

    console.log(`\nTasks for ${agent.name}:`)
    console.log("=".repeat(60))
    for (const task of agent.taskTypes) {
      console.log(`  - ${task}`)
    }
    console.log(`\nTotal: ${agent.taskTypes.length} task types`)
  },
})

// Agent Command
const AgentCommand = cmd({
  command: "agent",
  describe: "manage specialized agents",
  builder: (yargs) =>
    yargs.command(AgentListCommand).command(AgentInfoCommand).command(AgentTasksCommand).demandCommand(),
  async handler() {},
})

// Main Kiloclaw Command
export const KiloclawCommand = cmd({
  command: "kiloclaw",
  describe: "Kiloclaw agency-based AI agent system",
  builder: (yargs) =>
    yargs.command(AgencyCommand).command(SkillCommand).command(ProviderCommand).command(AgentCommand).demandCommand(),
  async handler() {},
})
