import { Identifier } from "@/id/id"
import { Log } from "@/util/log"
import { Instance } from "@/project/instance"
import { Session } from "@/session"
import { MessageV2 } from "@/session/message-v2"
import { Flag } from "@/flag/flag"
import type { Hooks, PluginInput } from "@kilocode/plugin"
import { MemoryBrokerV2 } from "./memory.broker.v2"
import { MemoryWriteback } from "./memory.writeback"
import { MemoryRecallPolicy } from "./memory.recall-policy"
import { MemoryMetrics } from "./memory.metrics"
import { MemoryPackager } from "./memory.packager"
import { MemoryInjectionPolicy } from "./memory.injection-policy"

const log = Log.create({ service: "kiloclaw.memory.plugin" })

log.info("createMemoryContextPlugin loaded")

const RECALL = [
  // Italian patterns
  /ultim[ea]\s+conversaz/i,
  /cronolog/i,
  /di\s+cosa\s+abbiamo\s+parlato/i,
  /di\s+cosa\s+si\s+è\s+parlato/i,
  /cosa\s+abbiamo\s+fatto\s+ultim/i,
  /cosa\s+abbiamo\s+trattat/i,
  /argoment[io]\s+(?:precedenti|passat|scors)/i,
  /session[ie]\s+precedenti/i,
  /nostr[ei]\s+conversation/i,
  /ricord/i,
  // English patterns
  /previous\s+conversation/i,
  /what\s+did\s+we\s+talk\s+about/i,
  /last\s+conversations?/i,
  /remember\s+our\s+past/i,
  /what\s+were?\s+we\s+(?:working\s+on|talking\s+about|discussing)/i,
  /previous\s+(?:session|meeting|discussion)/i,
  /recall\s+(?:past|previous)/i,
  /history\s+of\s+(?:our|our\s+)?conversations/i,
  // Implicit references to memory/history
  /memoria/i,
  /passato/i,
  /storico/i,
]

async function needsRecallAsync(text: string): Promise<boolean> {
  if (RECALL.some((re) => re.test(text))) {
    return true
  }
  const out = await MemoryRecallPolicy.evaluate(text)
  return out.decision === "recall"
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export async function createMemoryContextPlugin(_input: PluginInput): Promise<Hooks> {
  return {
    "chat.message": async (input, output) => {
      const text = userText(output.parts)
      if (!text) return
      console.log("[MEMORY-PLUGIN] chat.message hook fired", { sessionID: input.sessionID, textLength: text.length })

      // Non-blocking async writeback with selective extraction
      MemoryWriteback.recordUserTurn({
        sessionId: input.sessionID,
        messageID: input.messageID ?? undefined,
        agent: input.agent,
        text: text,
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

      const policy = await MemoryRecallPolicy.evaluate(text)
      MemoryMetrics.observeGate({
        decision: policy.decision,
        confidence: policy.confidence,
        lang: policy.intent.lang,
        reasons: policy.reasons,
      })

      if (!Flag.KILO_MEMORY_RECALL_POLICY_V1) {
        if (!(await needsRecallAsync(text))) {
          console.log("[MEMORY-PLUGIN] recall NOT needed")
          return
        }
      }

      if (policy.decision === "skip") {
        console.log("[MEMORY-PLUGIN] recall NOT needed")
        return
      }

      if (policy.decision === "shadow") {
        console.log("[MEMORY-PLUGIN] recall SHADOW mode")
        if (!Flag.KILO_MEMORY_SHADOW_MODE && !Flag.KILO_MEMORY_RECALL_TRI_STATE) return
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

      const mem = await MemoryBrokerV2.retrieve({ query: text, limit: 8 })
        .then((x) => x.items)
        .catch((err) => {
          console.log("[MEMORY-PLUGIN] retrieve failed:", err)
          return []
        })

      console.log("[MEMORY-PLUGIN] memory retrieve returned:", mem.length, "items")

      const plan = MemoryInjectionPolicy.decide({
        confidence: policy.confidence,
        text,
      })
      const mode = plan.mode
      const memPacked = MemoryPackager.packageMemory(mem, {
        structuredFormat: true,
        maxItemsPerLayer: plan.maxItemsPerLayer,
      })
      const memLines = mem
        .slice(0, plan.maxHits)
        .map((item) => `- ${String(layerOf(item.item))}: ${clip(memorySnippet(item.item), 140)}`)

      const block = [
        "<system-reminder>",
        "Recovered context from memory and previous sessions:",
        lines.length > 0 ? lines.join("\n") : "- No previous sessions found in this workspace.",
        "",
        "Relevant memory hits:",
        memLines.length > 0 ? memLines.join("\n") : "- No relevant memory entries found.",
        "",
        "Structured memory package:",
        memPacked,
        "",
        `Injection mode: ${mode}.`,
        `Recall policy: decision=${policy.decision}, confidence=${policy.confidence.toFixed(3)}, lang=${policy.intent.lang}.`,
        "If the user asked about previous conversations, answer using this recovered context.",
        "</system-reminder>",
      ].join("\n")

      MemoryMetrics.observeInjection({
        mode,
        tokens: estimateTokens(block),
        count: mem.length,
        diversity: diversity(mem),
      })

      console.log("[MEMORY-PLUGIN] injecting memory block, length:", block.length)
      if (policy.decision === "shadow") {
        console.log("[MEMORY-PLUGIN] shadow-only decision, skipping prompt injection")
        return
      }
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

function layerOf(item: unknown): string {
  if (!item || typeof item !== "object") return "memory"
  const row = item as { layer?: unknown }
  if (typeof row.layer === "string") return row.layer
  return "memory"
}

function diversity(items: Array<{ item: unknown }>): number {
  const layers = new Set(items.map((x) => layerOf(x.item)))
  return layers.size
}
