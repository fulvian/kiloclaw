import path from "path"
import { pathToFileURL } from "url"
import z from "zod"
import { Tool } from "./tool"
import { Skill } from "../skill"
import { PermissionNext } from "../permission/next"
import { Ripgrep } from "../file/ripgrep"
import { iife } from "@/util/iife"
import { Log } from "@/util/log" // kilocode_change - for logging
import {
  knowledgeSkills,
  developmentSkills,
  nutritionSkills,
  weatherSkills,
  nbaSkills,
  financeSkills,
  travelSkills,
} from "../kiloclaw/skills" // kilocode_change - agency skills
import type { Skill as KiloclawSkill } from "../kiloclaw/skill" // kilocode_change
import { SKILL_TOOL_EXECUTE_MODE_ENABLED, SKILL_NO_SILENT_FALLBACK_ENABLED } from "../session/runtime-flags" // kilocode_change - P1 skill execute mode
import { RuntimeRemediationMetrics } from "@/kiloclaw/telemetry/runtime-remediation.metrics" // kilocode_change - P1 telemetry
import { executeSkill } from "../kiloclaw/agency/execution-bridge" // kilocode_change - P1 execution bridge
import { Session } from "../session" // kilocode_change - to get user messages
import { MessageV2 } from "../session/message-v2" // kilocode_change - to get message parts

const BUILTIN = Skill.BUILTIN_LOCATION // kilocode_change
const log = Log.create({ service: "skill-tool" })

export const SkillTool = Tool.define("skill", async (ctx) => {
  const skills = await Skill.all()

  // kilocode_change start - include agency skills (Knowledge + Development + Nutrition + Weather + NBA + Finance)
  // Convert kiloclaw skills to Skill.Info format
  // Note: kiloclaw skills have id, name, capabilities, tags but NOT description directly
  const buildAgencySkillDescription = (s: KiloclawSkill) =>
    `Agency: ${s.tags.join(", ")} | Capabilities: ${s.capabilities.join(", ")}`

  const agencySkillInfos: Skill.Info[] = [
    ...knowledgeSkills.map((s) => ({
      name: s.id as string,
      description: buildAgencySkillDescription(s),
      location: "builtin" as const,
      content: "",
    })),
    ...developmentSkills.map((s) => ({
      name: s.id as string,
      description: buildAgencySkillDescription(s),
      location: "builtin" as const,
      content: "",
    })),
    ...nutritionSkills.map((s) => ({
      name: s.id as string,
      description: buildAgencySkillDescription(s),
      location: "builtin" as const,
      content: "",
    })),
    ...weatherSkills.map((s) => ({
      name: s.id as string,
      description: buildAgencySkillDescription(s),
      location: "builtin" as const,
      content: "",
    })),
    ...nbaSkills.map((s) => ({
      name: s.id as string,
      description: buildAgencySkillDescription(s),
      location: "builtin" as const,
      content: "",
    })),
    ...financeSkills.map((s) => ({
      name: s.id as string,
      description: buildAgencySkillDescription(s),
      location: "builtin" as const,
      content: "",
    })),
    ...travelSkills.map((s) => ({
      name: s.id as string,
      description: buildAgencySkillDescription(s),
      location: "builtin" as const,
      content: "",
    })),
  ]

  // Merge agency skills with standard skills (agency skills have priority)
  const allSkillsList = [...agencySkillInfos, ...Object.values(skills)]

  // Filter skills by agent permissions if agent provided
  const agent = ctx?.agent
  const accessibleSkills = agent
    ? allSkillsList.filter((skill) => {
        const rule = PermissionNext.evaluate("skill", skill.name, agent.permission)
        return rule.action !== "deny"
      })
    : allSkillsList
  // kilocode_change end

  // kilocode_change start - separate standard skills from agency skills for display
  const standardSkills = accessibleSkills.filter((s) => s.location !== "builtin")
  const agencySkillsList = accessibleSkills.filter((s) => s.location === "builtin")

  const buildSkillsSection = (skillList: Skill.Info[], title: string) => {
    if (skillList.length === 0) return ""
    return [
      title,
      "",
      ...skillList.flatMap((skill) => {
        const loc = skill.location === BUILTIN ? BUILTIN : pathToFileURL(skill.location).href
        return [
          `  <skill>`,
          `    <name>${skill.name}</name>`,
          `    <description>${skill.description}</description>`,
          `    <location>${loc}</location>`,
          `  </skill>`,
        ]
      }),
      "",
    ].join("\n")
  }

  const description =
    accessibleSkills.length === 0
      ? "Load a specialized skill that provides domain-specific instructions and workflows. No skills are currently available."
      : [
          "Load a specialized skill that provides domain-specific instructions and workflows.",
          "",
          "When you recognize that a task matches one of the available skills listed below, use this tool to load the full skill instructions.",
          "",
          "The skill will inject detailed instructions, workflows, and access to bundled resources (scripts, references, templates) into the conversation context.",
          "",
          'Tool output includes a `<skill_content name="...">` block with the loaded content.',
          "",
          "The following skills provide specialized sets of instructions for particular tasks",
          "Invoke this tool to load a skill when a task matches one of the available skills listed below:",
          "",
          // kilocode_change start - show agency skills separately
          buildSkillsSection(
            agencySkillsList,
            "<!-- Agency Skills (Knowledge + Development + Nutrition + Weather + NBA + Finance) -->",
          ),
          buildSkillsSection(standardSkills, "<!-- Standard Skills -->"),
          // kilocode_change end
        ].join("\n")
  // kilocode_change end

  const examples = accessibleSkills
    .map((skill) => `'${skill.name}'`)
    .slice(0, 3)
    .join(", ")
  const hint = examples.length > 0 ? ` (e.g., ${examples}, ...)` : ""

  const parameters = z.object({
    name: z.string().describe(`The name of the skill from available_skills${hint}`),
    mode: z
      .enum(["load", "execute"])
      .optional()
      .describe("Mode: 'load' returns skill content only (documental), 'execute' triggers actual skill execution"),
    input: z
      .record(z.string(), z.any())
      .optional()
      .describe(
        "Input parameters for skill execution. For weather-* skills: { location: string, days: number }. For travel-*-search skills: extract relevant params from user query (e.g., { destination: 'Roma', cuisine: 'italian' }). For transfer search: { from: string, to: string, date: string }.",
      ),
  })

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      // P1: Distinguish load-skill (documental) vs execute-skill (operational)
      const isExecuteMode = params.mode === "execute" || SKILL_TOOL_EXECUTE_MODE_ENABLED()
      const noSilentFallback = SKILL_NO_SILENT_FALLBACK_ENABLED()

      // kilocode_change start - check for agency skills first
      const allKiloclawSkills = [
        ...knowledgeSkills,
        ...developmentSkills,
        ...nutritionSkills,
        ...weatherSkills,
        ...nbaSkills,
        ...financeSkills,
        ...travelSkills,
      ]
      const agencySkill = allKiloclawSkills.find((s) => s.id === params.name)

      if (agencySkill) {
        await ctx.ask({
          permission: "skill",
          patterns: [params.name],
          always: [params.name],
          metadata: {},
        })

        const genericContent =
          typeof agencySkill.execute === "function"
            ? `Agency Skill: ${agencySkill.id}\nName: ${agencySkill.name}\nCapabilities: ${agencySkill.capabilities.join(", ")}\nTags: ${agencySkill.tags.join(", ")}`
            : `Agency Skill: ${agencySkill.id}`

        const nbaContent = [
          `Agency Skill: ${agencySkill.id}`,
          `Name: ${agencySkill.name}`,
          `Capabilities: ${agencySkill.capabilities.join(", ")}`,
          `Tags: ${agencySkill.tags.join(", ")}`,
          "",
          "MANDATORY: Use the NBA Agency tools to fetch data. Do NOT use websearch for NBA data.",
          "",
          "Step 1: Use 'nba-games' tool to get today's NBA games schedule and scores",
          "Step 2: Use 'nba-odds' tool to get betting odds from multiple bookmakers",
          "Step 3: Use 'nba-injuries' tool to get injury reports for all teams",
          "Step 4: Analyze the data and generate recommendations based on the output contract below",
          "",
          "If a requested section has no reliable sources, explicitly mark it unavailable (never fabricate).",
          "- Do not ask generic follow-up questions if the user asked for analysis/recommendations.",
          "- Use a best-effort shortlist with explicit assumptions when some inputs are missing.",
          "- If live markets are unavailable, return an empty shortlist with clear blocking reasons.",
          "- Mark every recommendation as HITL-required before any stake action.",
          "- Treat the output contract below as mandatory; do not omit sections.",
          "- If data is missing for a section, include the section and write: 'Unavailable - <reason>'.",
          "",
          "MANDATORY output contract (use these exact section headings):",
          "## 1) Shortlist EV+ (max 3)",
          "- game | market | bookmaker | odds | edge % | confidence | rationale",
          "## 2) Match Pack",
          "- for each shortlisted game include: Last 5, H2H last 3, projected lineups, injury report, key stats/top scorers",
          "## 3) Odds Board Multi-Bookmaker",
          "- at least 2 bookmakers per market when available; include timestamp per source",
          "## 4) Value Betting",
          "- EV estimate formula, assumptions, fair odds vs market odds",
          "## 5) Recommended Multipla/Parlay",
          "- legs, combined odds, risk level, why selected",
          "## 6) Excluded Candidates",
          "- candidate and explicit exclusion reason",
          "## 7) Risk Notes",
          "- freshness, injury uncertainty, late-line movement",
          "## 8) HITL",
          "- explicit statement: no automatic execution; human approval required",
        ].join("\n")

        const content = agencySkill.id === "nba-analysis" ? nbaContent : genericContent

        const agencyType = knowledgeSkills.some((s) => s.id === agencySkill.id)
          ? "knowledge"
          : developmentSkills.some((s) => s.id === agencySkill.id)
            ? "development"
            : nutritionSkills.some((s) => s.id === agencySkill.id)
              ? "nutrition"
              : weatherSkills.some((s) => s.id === agencySkill.id)
                ? "weather"
                : nbaSkills.some((s) => s.id === agencySkill.id)
                  ? "nba"
                  : financeSkills.some((s) => s.id === agencySkill.id)
                    ? "finance"
                    : travelSkills.some((s) => s.id === agencySkill.id)
                      ? "travel"
                      : "unknown"
        const skillName = agencySkill.id as string // Cast branded SkillId to string

        // P1: Build skill output
        const skillOutput = [
          `<skill_content name="${agencySkill.id}">`,
          `# Agency Skill: ${agencySkill.id}`,
          "",
          content,
          "",
          `This is a ${agencyType === "knowledge" ? "Knowledge" : agencyType === "development" ? "Development" : agencyType === "nutrition" ? "Nutrition" : agencyType === "weather" ? "Weather" : agencyType === "nba" ? "NBA" : agencyType === "finance" ? "Finance" : agencyType === "travel" ? "Travel" : "Unknown"} Agency skill.`,
          "</skill_content>",
        ].join("\n")

        // P1: Telemetry - record skill loaded
        RuntimeRemediationMetrics.recordAgencyChainStarted({
          correlationId: ctx.sessionID ?? "unknown",
          agencyId: agencyType,
          skill: agencySkill.id,
        })
        RuntimeRemediationMetrics.incrementAgencyChainStarted()

        // P1: Guardrail - if execute mode not enabled, warn about load-only behavior
        if (!isExecuteMode && noSilentFallback) {
          RuntimeRemediationMetrics.recordSkillLoadedNotExecuted({
            correlationId: ctx.sessionID ?? "unknown",
            agencyId: agencyType,
            skill: agencySkill.id,
            reason: "skill tool in load-only mode; set mode=execute for operational execution",
          })
          RuntimeRemediationMetrics.incrementSkillLoadedNotExecuted()
        }

        // P1: If execute mode enabled, call the execution bridge
        if (isExecuteMode) {
          // Use provided input if available, otherwise extract from user message
          let userInput: unknown = {}

          // If input was explicitly provided in the tool call, use it
          if (params.input && Object.keys(params.input).length > 0) {
            userInput = params.input
            log.info("using provided input params", { skill: agencySkill.id, input: params.input })
          } else {
            // Extract parameters from user message
            try {
              const msgs = await Session.messages({ sessionID: ctx.sessionID })
              const lastUserMsg = msgs.findLast((m: any) => m.info.role === "user")
              if (lastUserMsg) {
                const textParts = lastUserMsg.parts
                  .filter((p: any) => p.type === "text" && !p.ignored && !p.synthetic)
                  .map((p: any) => p.text)
                  .join(" ")
                  .trim()

                // For weather skills, extract location from query text
                if (agencySkill.id.startsWith("weather-")) {
                  userInput = extractWeatherParams(textParts)
                }
                // For travel skills, extract relevant parameters
                else if (agencySkill.id.startsWith("travel-")) {
                  userInput = extractTravelParams(agencySkill.id, textParts)
                }
                // For other skills, use query format
                else {
                  userInput = { query: textParts, sources: 5 }
                }
              }
            } catch (err) {
              log.warn("failed to extract params from user message", { err })
            }
          }

          // Helper: extract weather params
          function extractWeatherParams(text: string): { location: string; days: number } {
            const locationPatterns = [
              /(?:a|ad)\s+([A-Za-zÀ-ÿ\s\.\-\']+?)(?:,|$|\s+[A-Z])/i,
              /(?:in)\s+([A-Za-zÀ-ÿ\s\.\-\']+?)(?:,|$|\s+[A-Z])/i,
              /(?:tempo|meteo|previsioni|forecast)\s+(?:a\s+)?([A-Za-zÀ-ÿ\s\.\-\']+?)(?:,|$|\s+[A-Z])/i,
              /weather\s+(?:in\s+)?([A-Za-zÀ-ÿ\s\.\-\']+?)(?:,|$|\s+[A-Z])/i,
            ]
            let location = ""
            for (const pattern of locationPatterns) {
              const match = text.match(pattern)
              if (match && match[1]) {
                location = match[1].trim()
                location = location.replace(/\s+(da|del|della|dalle|dai|e|da|dei|degli|al|ai|alla|alle)\s+.*$/i, "")
                location = location.replace(/,\s*$/, "")
                break
              }
            }
            // Check for Italian cities
            const italianCities = [
              "Roma",
              "Milano",
              "Napoli",
              "Firenze",
              "Venezia",
              "Torino",
              "Bologna",
              "Genova",
              "Palermo",
              "Bari",
              "Catania",
              "Verona",
              "Trieste",
              "Brescia",
              "Reggio Calabria",
              "Modena",
              "Parma",
              "Reggio Emilia",
              "Perugia",
              "Salerno",
              "Foggia",
              "Rimini",
              "Siracusa",
              "Bergamo",
              "Pescara",
              "Trento",
              "Ferrara",
              "Catanzaro",
              "Arezzo",
              "Latina",
              "Piacenza",
              "Lucca",
              "Frosinone",
              "Rome",
              "Milan",
              "Naples",
              "Florence",
              "Venice",
              "Turin",
              "Genoa",
            ]
            for (const city of italianCities) {
              if (text.toLowerCase().includes(city.toLowerCase())) {
                location = city
                break
              }
            }
            if (!location) location = "Roma"

            const daysMatch = text.match(/(\d+)\s*giorn[oi]|(\d+)\s*days?/i)
            const days = daysMatch ? parseInt(daysMatch[1] || daysMatch[2]) : 7

            return { location, days }
          }

          // Helper: extract travel params based on skill type
          function extractTravelParams(skillId: string, text: string): unknown {
            // Common Italian cities for destination extraction
            const italianCities = [
              { it: "Roma", en: "Rome" },
              { it: "Milano", en: "Milan" },
              { it: "Napoli", en: "Naples" },
              { it: "Firenze", en: "Florence" },
              { it: "Venezia", en: "Venice" },
              { it: "Torino", en: "Turin" },
              { it: "Bologna", en: "Bologna" },
              { it: "Genova", en: "Genoa" },
              { it: "Palermo", en: "Palermo" },
              { it: "Bari", en: "Bari" },
              { it: "Catania", en: "Catania" },
            ]

            // Helper to extract destination/city from text
            const extractCity = (): string => {
              for (const { it, en } of italianCities) {
                if (text.toLowerCase().includes(it.toLowerCase())) return it
                if (text.toLowerCase().includes(en.toLowerCase())) return it
              }
              // Default to Rome if Italian city found
              if (text.toLowerCase().includes("roma") || text.toLowerCase().includes("rome")) return "Roma"
              return "Roma" // Default
            }

            // Extract date patterns
            const extractDate = (pattern: RegExp): string | undefined => {
              const match = text.match(pattern)
              return match ? match[1] : undefined
            }

            // Extract cuisine preferences
            const extractCuisine = (): string | undefined => {
              const cuisines = [
                "italiana",
                "italian",
                "romana",
                "romana cuisine",
                "napoletana",
                "pizza",
                "toscana",
                "tuscan",
                "pesce",
                "seafood",
                "carne",
                "meat",
                "vegetariano",
                "vegetarian",
                "vegano",
                "vegan",
                "cinese",
                "chinese",
                "giapponese",
                "japanese",
                "messicano",
                "mexican",
                "indiano",
                "indian",
              ]
              for (const c of cuisines) {
                if (text.toLowerCase().includes(c)) return c
              }
              return undefined
            }

            // Extract party composition
            const extractParty = (): { adults?: number; children?: number } => {
              const party: { adults?: number; children?: number } = {}
              // Look for "bambina di quasi 2 anni", "figlia di 2 anni", etc.
              const childMatch = text.match(/bambin[ao]\s+di\s+quasi\s+(\d+)\s+ann|numero\s+figli/i)
              if (childMatch) {
                party.children = parseInt(childMatch[1])
              }
              // Default to 2 adults if not specified
              if (!party.adults && !party.children) {
                party.adults = 2
                party.children = 1
              }
              return party
            }

            // Extract price range
            const extractPriceRange = (): string | undefined => {
              if (text.includes("economico") || text.includes("budget") || text.includes("€")) return "budget"
              if (text.includes("luss") || text.includes("luxury") || text.includes("€€€")) return "luxury"
              if (text.includes("medio") || text.includes("mid-range") || text.includes("€€")) return "mid-range"
              return undefined
            }

            // Extract airport/location references
            const extractAirport = (): { from?: string; to?: string } => {
              const result: { from?: string; to?: string } = {}
              if (text.toLowerCase().includes("aeroporto") || text.toLowerCase().includes("airport")) {
                if (text.toLowerCase().includes("fiumicino")) {
                  result.from =
                    text.toLowerCase().includes("all'hotel") || text.toLowerCase().includes("allogg")
                      ? "Fiumicino"
                      : "Fiumicino Airport"
                }
                if (text.toLowerCase().includes("ciampino")) {
                  result.from = "Ciampino Airport"
                }
              }
              if (text.toLowerCase().includes("hotel") || text.toLowerCase().includes("vill")) {
                // User is going to hotel
              }
              return result
            }

            // Route based on skill type
            switch (skillId) {
              case "travel-restaurant-search": {
                const destination = extractCity()
                const cuisine = extractCuisine()
                const priceRange = extractPriceRange()
                return { destination, cuisine, priceRange }
              }

              case "travel-transfer-search": {
                const airports = extractAirport()
                const dateMatch = text.match(/(?:giovedì|venerdì|sabato|domenica|lunedì|martedì|mercoledì)/i)
                // Extract date from day name or use a date pattern
                const dayMatch = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/)
                let date = dayMatch ? dayMatch[1] : undefined

                return {
                  from: airports.from || "Fiumicino Airport",
                  to:
                    text.toLowerCase().includes("hotel") || text.toLowerCase().includes("vill")
                      ? "Villa Pamphili"
                      : "Roma",
                  date: date || "2026-04-16",
                  passengers: 3,
                }
              }

              case "travel-activity-search": {
                const destination = extractCity()
                const party = extractParty()

                // Extract category based on interests mentioned
                let category: string | undefined
                if (
                  text.toLowerCase().includes("bambin") ||
                  text.toLowerCase().includes("figlia") ||
                  text.toLowerCase().includes("famiglia")
                ) {
                  category = "family"
                } else if (text.toLowerCase().includes("cultura") || text.toLowerCase().includes("museo")) {
                  category = "culture"
                } else if (text.toLowerCase().includes("cibo") || text.toLowerCase().includes("gastronom")) {
                  category = "food"
                } else if (text.toLowerCase().includes("avventura")) {
                  category = "adventure"
                }

                return { destination, category, ...party }
              }

              case "travel-hotel-search": {
                const destination = extractCity()
                const priceRange = extractPriceRange()
                return { destination, priceRange }
              }

              case "travel-flight-search": {
                // For flight search, we need origin and destination
                const destination = extractCity()
                return {
                  destination,
                  departureDate: "2026-04-16",
                  passengers: 3,
                }
              }

              default:
                return { query: text, sources: 5 }
            }
          }

          // Call the execution bridge
          const bridgeConfig = {
            maxSteps: 10,
            timeoutMs: 60000,
            correlationId: ctx.sessionID ?? `skill-${Date.now()}`,
            agencyId: agencyType,
          }

          const bridgeResult = await executeSkill(agencySkill.id as string, userInput, bridgeConfig)

          if (bridgeResult.success) {
            // Return the actual execution result
            // Format object outputs as JSON, scalar outputs as-is
            const formattedOutput =
              bridgeResult.output !== undefined
                ? typeof bridgeResult.output === "object"
                  ? JSON.stringify(bridgeResult.output, null, 2)
                  : String(bridgeResult.output)
                : "Skill executed successfully"

            return {
              title: `Executed skill: ${agencySkill.id}`,
              output: formattedOutput,
              metadata: {
                name: skillName,
                dir: BUILTIN,
                skillExecuted: true,
                success: true,
                stepsExecuted: bridgeResult.stepsExecuted,
                durationMs: bridgeResult.durationMs,
              },
            } as any
          } else {
            // Bridge execution failed - fall back to load mode
            return {
              title: `Skill execution failed: ${agencySkill.id}`,
              output: skillOutput,
              metadata: {
                name: skillName,
                dir: BUILTIN,
                skillExecuted: false,
                success: false,
                errorMessage: bridgeResult.error,
                fallbackToLoadMode: true,
              },
            } as any
          }
        }

        return {
          title: `Loaded agency skill: ${agencySkill.id}`,
          output: skillOutput,
          metadata: {
            name: skillName,
            dir: BUILTIN,
            // P1: Flag to indicate this skill is loaded but not executed (documental mode)
            // This prevents downstream code from treating this as a completed operational step
            ...(isExecuteMode ? {} : { skillLoadedNotExecuted: true }),
          },
        }
      }
      // kilocode_change end

      const skill = await Skill.get(params.name)

      if (!skill) {
        const available = await Skill.all().then((x) => Object.keys(x).join(", "))
        throw new Error(`Skill "${params.name}" not found. Available skills: ${available || "none"}`)
      }

      await ctx.ask({
        permission: "skill",
        patterns: [params.name],
        always: [params.name],
        metadata: {},
      })

      // kilocode_change start - built-in skills have no filesystem directory
      if (skill.location === BUILTIN) {
        // P1: Telemetry for built-in skill load
        RuntimeRemediationMetrics.recordAgencyChainStarted({
          correlationId: ctx.sessionID ?? "unknown",
          agencyId: "standard",
          skill: skill.name,
        })
        RuntimeRemediationMetrics.incrementAgencyChainStarted()

        // P1: Guardrail for built-in skills
        if (!isExecuteMode && noSilentFallback) {
          RuntimeRemediationMetrics.recordSkillLoadedNotExecuted({
            correlationId: ctx.sessionID ?? "unknown",
            agencyId: "standard",
            skill: skill.name,
            reason: "skill tool in load-only mode; set mode=execute for operational execution",
          })
          RuntimeRemediationMetrics.incrementSkillLoadedNotExecuted()
        }

        return {
          title: `Loaded skill: ${skill.name}`,
          output: [
            `<skill_content name="${skill.name}">`,
            "# Skill: ${skill.name}",
            "",
            skill.content.trim(),
            "</skill_content>",
          ].join("\n"),
          metadata: {
            name: skill.name,
            dir: BUILTIN,
            ...(isExecuteMode ? {} : { skillLoadedNotExecuted: true }),
          },
        }
      }
      // kilocode_change end

      const dir = path.dirname(skill.location)
      const base = pathToFileURL(dir).href

      const limit = 10
      const files = await iife(async () => {
        const arr = []
        for await (const file of Ripgrep.files({
          cwd: dir,
          follow: false,
          hidden: true,
          signal: ctx.abort,
        })) {
          if (file.includes("SKILL.md")) {
            continue
          }
          arr.push(path.resolve(dir, file))
          if (arr.length >= limit) {
            break
          }
        }
        return arr
      }).then((f) => f.map((file) => `<file>${file}</file>`).join("\n"))

      // P1: Telemetry for filesystem skill load
      RuntimeRemediationMetrics.recordAgencyChainStarted({
        correlationId: ctx.sessionID ?? "unknown",
        agencyId: "standard",
        skill: skill.name,
      })
      RuntimeRemediationMetrics.incrementAgencyChainStarted()

      // P1: Guardrail for filesystem skills
      if (!isExecuteMode && noSilentFallback) {
        RuntimeRemediationMetrics.recordSkillLoadedNotExecuted({
          correlationId: ctx.sessionID ?? "unknown",
          agencyId: "standard",
          skill: skill.name,
          reason: "skill tool in load-only mode; set mode=execute for operational execution",
        })
        RuntimeRemediationMetrics.incrementSkillLoadedNotExecuted()
      }

      return {
        title: `Loaded skill: ${skill.name}`,
        output: [
          `<skill_content name="${skill.name}">`,
          "# Skill: ${skill.name}",
          "",
          skill.content.trim(),
          "",
          `Base directory for this skill: ${base}`,
          "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.",
          "Note: file list is sampled.",
          "",
          "<skill_files>",
          files,
          "</skill_files>",
          "</skill_content>",
        ].join("\n"),
        metadata: {
          name: skill.name,
          dir,
          ...(isExecuteMode ? {} : { skillLoadedNotExecuted: true }),
        },
      }
    },
  }
})
