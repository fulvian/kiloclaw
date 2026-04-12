import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Brainstorming input
export interface BrainstormingInput {
  topic: string
  goal?: string
  constraints?: string[]
  mode?: "ideas" | "solutions" | "alternatives" | "improvements"
}

// Brainstorming output
export interface BrainstormingOutput {
  ideas: BrainstormIdea[]
  categories: string[]
  recommendations: string[]
  summary: string
}

export interface BrainstormIdea {
  id: string
  title: string
  description: string
  feasibility: "high" | "medium" | "low"
  novelty: "high" | "medium" | "low"
  risks?: string[]
}

// Brainstorming techniques
const BRAINSTORMING_TECHNIQUES = [
  "SCAMPER (Substitute, Combine, Adapt, Modify, Put to other use, Eliminate, Reverse)",
  "Six Thinking Hats (平行思考)",
  "Random Input (random word triggers)",
  "Mind Mapping (visual brainstorming)",
  "Starbursting (questions: who, what, where, why, when, how)",
  "Analogy inspired (how does nature/doamin X solve this?)",
] as const

function generateIdeas(topic: string, mode: string): BrainstormIdea[] {
  // Generate varied ideas based on topic
  const baseIdeas = [
    {
      title: `自动化解决方案`,
      description: `Use automation to streamline ${topic} related tasks`,
      feasibility: "high" as const,
      novelty: "medium" as const,
    },
    {
      title: `AI增强方案`,
      description: `Leverage AI capabilities to improve ${topic}`,
      feasibility: "medium" as const,
      novelty: "high" as const,
    },
    {
      title: `简化流程`,
      description: `Simplify the ${topic} process by removing unnecessary steps`,
      feasibility: "high" as const,
      novelty: "low" as const,
    },
    {
      title: `协作平台`,
      description: `Create a collaborative space for ${topic} activities`,
      feasibility: "medium" as const,
      novelty: "medium" as const,
    },
    {
      title: `数据驱动洞察`,
      description: `Use analytics to gain insights about ${topic}`,
      feasibility: "high" as const,
      novelty: "medium" as const,
    },
  ]

  return baseIdeas.map((idea, idx) => ({
    ...idea,
    id: `idea-${idx + 1}`,
    description: idea.description.replace(/\{topic\}/g, topic),
    risks: idea.feasibility === "high" ? undefined : ["Implementation complexity", "Resource constraints"],
  }))
}

export const BrainstormingSkill: Skill = {
  id: "brainstorming" as SkillId,
  version: "1.0.0",
  name: "Brainstorming",
  inputSchema: {
    type: "object",
    properties: {
      topic: { type: "string", description: "Topic to brainstorm" },
      goal: { type: "string", description: "Goal or objective" },
      constraints: {
        type: "array",
        items: { type: "string" },
        description: "Constraints or limitations",
      },
      mode: {
        type: "string",
        enum: ["ideas", "solutions", "alternatives", "improvements"],
        description: "Brainstorming mode",
      },
    },
    required: ["topic"],
  },
  outputSchema: {
    type: "object",
    properties: {
      ideas: { type: "array" },
      categories: { type: "array", items: { type: "string" } },
      recommendations: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
    },
  },
  capabilities: ["idea-generation", "creative-thinking", "problem-solving", "divergent-thinking"],
  tags: ["brainstorming", "creativity", "ideation", "meta"],

  async execute(input: unknown, _context: SkillContext): Promise<BrainstormingOutput> {
    const log = Log.create({ service: "kiloclaw.skill.brainstorming" })
    log.info("executing brainstorming", { topic: (input as BrainstormingInput).topic })

    const { topic, goal, constraints = [], mode = "ideas" } = input as BrainstormingInput

    if (!topic || topic.trim().length === 0) {
      return {
        ideas: [],
        categories: [],
        recommendations: [],
        summary: "No topic provided for brainstorming",
      }
    }

    const ideas = generateIdeas(topic, mode)

    const categories = [
      "Technology solutions",
      "Process improvements",
      "User experience enhancements",
      "Data-driven approaches",
    ]

    const recommendations: string[] = [
      `Consider using SCAMPER technique to expand on ideas for "${topic}"`,
      goal ? `Evaluate ideas against goal: "${goal}"` : "Define a clear goal to better evaluate ideas",
      constraints.length > 0
        ? `Constraints to consider: ${constraints.join(", ")}`
        : "No constraints specified - consider adding limitations",
      `Review ideas with Six Thinking Hats perspective for balanced evaluation`,
    ]

    const summary = `Generated ${ideas.length} idea(s) for "${topic}" in ${mode} mode`

    log.info("brainstorming completed", { topic, ideas: ideas.length })

    return { ideas, categories, recommendations, summary }
  },
}
