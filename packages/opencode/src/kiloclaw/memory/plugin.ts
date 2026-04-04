import { Identifier } from "@/id/id"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"
import { Session } from "@/session"
import { MessageV2 } from "@/session/message-v2"
import type { Hooks, PluginInput } from "@kilocode/plugin"
import { MemoryBrokerV2 } from "./memory.broker.v2"

const log = Log.create({ service: "kiloclaw.memory.plugin" })

log.info("createMemoryContextPlugin loaded")

const RECALL = [
  /ultim[ea]\s+conversaz/i,
  /cronolog/i,
  /di\s+cosa\s+abbiamo\s+parlato/i,
  /previous\s+conversation/i,
  /what\s+did\s+we\s+talk\s+about/i,
  /last\s+conversations?/i,
  /remember\s+our\s+past/i,
]

export async function createMemoryContextPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    "chat.message": async (input, output) => {
      const text = userText(output.parts)
      if (!text) return
      console.log("[MEMORY-PLUGIN] chat.message hook fired", { sessionID: input.sessionID, textLength: text.length })

      const ts = Date.now()
      const body = clip(text, 1200)

      await MemoryBrokerV2.write({
        layer: "working",
        key: `session:${input.sessionID}:last_user_query`,
        value: { text: body, at: ts },
        ttlMs: 6 * 60 * 60 * 1000,
      }).catch((err) => {
        log.debug("working memory write skipped", { err: String(err) })
      })

      await MemoryBrokerV2.write({
        layer: "episodic",
        key: `session:${input.sessionID}:user_turn:${input.messageID ?? "none"}`,
        value: {
          taskDescription: body,
          outcome: "user_input",
          correlationId: input.messageID,
          startedAt: ts,
          completedAt: ts,
          agentId: input.agent,
        },
      }).catch((err) => {
        log.debug("episodic memory write skipped", { err: String(err) })
      })
    },

    "experimental.chat.messages.transform": async (_input, output) => {
      console.log("[MEMORY-PLUGIN] transform hook fired", { messageCount: output.messages.length })
      const msg = output.messages.findLast((item) => item.info.role === "user")
      if (!msg) {
        console.log("[MEMORY-PLUGIN] no user message found")
        return
      }

      const text = userText(msg.parts)
      console.log("[MEMORY-PLUGIN] user text:", text.slice(0, 100))
      if (!needsRecall(text)) {
        console.log("[MEMORY-PLUGIN] recall NOT needed")
        return
      }
      console.log("[MEMORY-PLUGIN] recall IS needed, fetching sessions and memory")

      const cur = msg.info.sessionID
      const currentDir = Instance.directory
      console.log("[MEMORY-PLUGIN] current directory:", currentDir)
      const allSessions = [...Session.listGlobal({ directory: currentDir, roots: true, limit: 12 })]
      console.log("[MEMORY-PLUGIN] all sessions found:", allSessions.length)
      const items = allSessions.filter((s) => s.id !== cur).slice(0, 5)
      console.log("[MEMORY-PLUGIN] filtered sessions (excluding current):", items.length)
      const lines = await Promise.all(
        items.map(async (session) => {
          const msgs = await Session.messages({ sessionID: session.id, limit: 8 }).catch(() => [])
          const last = msgs.findLast((m) => m.info.role === "user")
          const snippet = clip(userText(last?.parts ?? []), 140)
          const title = clip(session.title, 90)
          const stamp = new Date(session.time.updated).toISOString()
          if (!snippet) return `- ${title} [${stamp}]`
          return `- ${title} [${stamp}] — ${snippet}`
        }),
      )

      const mem = await MemoryBrokerV2.retrieve({ query: text, limit: 6 })
        .then((x) => x.items)
        .catch((err) => {
          console.log("[MEMORY-PLUGIN] retrieve failed:", err)
          return []
        })

      console.log("[MEMORY-PLUGIN] memory retrieve returned:", mem.length, "items")

      const memLines = mem
        .slice(0, 4)
        .map((item) => `- ${String((item.item as any).layer ?? "memory")}: ${clip(memorySnippet(item.item), 140)}`)

      const block = [
        "<system-reminder>",
        "Recovered context from memory and previous sessions:",
        lines.length > 0 ? lines.join("\n") : "- No previous sessions found in this workspace.",
        "",
        "Relevant memory hits:",
        memLines.length > 0 ? memLines.join("\n") : "- No relevant memory entries found.",
        "",
        "If the user asked about previous conversations, answer using this recovered context.",
        "</system-reminder>",
      ].join("\n")

      console.log("[MEMORY-PLUGIN] injecting memory block, length:", block.length)
      msg.parts.push({
        id: Identifier.ascending("part"),
        messageID: msg.info.id,
        sessionID: msg.info.sessionID,
        type: "text",
        text: block,
        synthetic: true,
      } satisfies MessageV2.TextPart)
      console.log(
        "[MEMORY-PLUGIN] parts after injection:",
        msg.parts.length,
        "synthetic count:",
        msg.parts.filter((p) => "synthetic" in p && p.synthetic).length,
      )
    },
  }
}

function needsRecall(text: string): boolean {
  return RECALL.some((re) => re.test(text))
}

function userText(parts: Array<{ type: string; text?: string; synthetic?: boolean }>): string {
  return parts
    .filter((p) => p.type === "text" && !p.synthetic)
    .map((p) => p.text ?? "")
    .join("\n")
    .trim()
}

function clip(input: string, max: number): string {
  if (input.length <= max) return input
  return `${input.slice(0, max)}…`
}

function memorySnippet(item: any): string {
  if (item?.task_description) return String(item.task_description)
  if (item?.subject || item?.predicate || item?.object) {
    return `${item.subject ?? ""} ${item.predicate ?? ""} ${String(item.object ?? "")}`.trim()
  }
  if (item?.name || item?.description) return `${item.name ?? ""} ${item.description ?? ""}`.trim()
  if (item?.key || item?.value) return `${String(item.key ?? "")} ${String(item.value ?? "")}`.trim()
  return JSON.stringify(item)
}
