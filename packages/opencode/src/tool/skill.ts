import path from "path"
import { pathToFileURL } from "url"
import z from "zod"
import { Tool } from "./tool"
import { Skill } from "../skill"
import { PermissionNext } from "../permission/next"
import { Ripgrep } from "../file/ripgrep"
import { iife } from "@/util/iife"
import { knowledgeSkills, developmentSkills, nutritionSkills, weatherSkills, nbaSkills } from "../kiloclaw/skills" // kilocode_change - agency skills
import type { Skill as KiloclawSkill } from "../kiloclaw/skill" // kilocode_change

const BUILTIN = Skill.BUILTIN_LOCATION // kilocode_change

export const SkillTool = Tool.define("skill", async (ctx) => {
  const skills = await Skill.all()

  // kilocode_change start - include agency skills (Knowledge + Development)
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
            "<!-- Agency Skills (Knowledge + Development + Nutrition + Weather + NBA) -->",
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
  })

  return {
    description,
    parameters,
    async execute(params: z.infer<typeof parameters>, ctx) {
      // kilocode_change start - check for agency skills first
      const allKiloclawSkills = [...knowledgeSkills, ...developmentSkills]
      const agencySkill = allKiloclawSkills.find((s) => s.id === params.name)

      if (agencySkill) {
        await ctx.ask({
          permission: "skill",
          patterns: [params.name],
          always: [params.name],
          metadata: {},
        })

        // Agency skills return content via their execute method
        const content =
          typeof agencySkill.execute === "function"
            ? `Agency Skill: ${agencySkill.id}\nName: ${agencySkill.name}\nCapabilities: ${agencySkill.capabilities.join(", ")}\nTags: ${agencySkill.tags.join(", ")}`
            : `Agency Skill: ${agencySkill.id}`

        const agencyType = knowledgeSkills.some((s) => s.id === agencySkill.id) ? "knowledge" : "development"
        const skillName = agencySkill.id as string // Cast branded SkillId to string

        return {
          title: `Loaded agency skill: ${agencySkill.id}`,
          output: [
            `<skill_content name="${agencySkill.id}">`,
            `# Agency Skill: ${agencySkill.id}`,
            "",
            content,
            "",
            `This is a ${agencyType === "knowledge" ? "Knowledge" : "Development"} Agency skill.`,
            "For web search and research tasks, use the websearch tool which routes to Tavily/Firecrawl/Brave providers.",
            "</skill_content>",
          ].join("\n"),
          metadata: {
            name: skillName,
            dir: BUILTIN,
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
        },
      }
    },
  }
})
