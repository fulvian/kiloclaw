import { Flag } from "@/flag/flag"
import { Log } from "@/util/log"
import { MemoryEmbedding } from "./memory.embedding"

const log = Log.create({ service: "kiloclaw.memory.intent" })

type Lang = "it" | "en" | "mixed" | "unknown"

export type RecallIntentKind = "explicit_recall" | "project_context" | "continuation" | "preference_reuse" | "none"

export type RecallIntent = {
  kind: RecallIntentKind
  lang: Lang
  score: number
  reasons: string[]
  feats: {
    lexical: number
    temporal: number
    referential: number
    semantic: number
    question: number
  }
}

const IT = [
  "ricorda",
  "ricordami",
  "ricordi",
  "memoria",
  "storico",
  "sessione",
  "sessioni",
  "precedente",
  "precedenti",
  "ultime",
  "ultimamente",
  "avevamo",
  "parlato",
  "discusso",
  "feedback",
  "preferenze",
  "gusto",
  "gusti",
  "piace",
  "piacciono",
  "consigliami",
]

const EN = [
  "remember",
  "memory",
  "history",
  "previous",
  "earlier",
  "last",
  "session",
  "sessions",
  "discussed",
  "talked",
  "agreed",
  "feedback",
  "preferences",
  "taste",
  "tastes",
  "recommend",
  "suggest",
]

const PREF = [
  "prefer",
  "preferenze",
  "preferences",
  "style",
  "stile",
  "come vuoi",
  "as i asked",
  "gusto",
  "gusti",
  "mi piace",
  "mi piacciono",
  "in base ai miei gusti",
  "sulla base dei miei gusti",
  "in base alle mie preferenze",
  "based on my taste",
  "based on my tastes",
  "based on my preferences",
  "what i like",
]
const CONT = ["riprendi", "continue", "continue from", "come prima", "from before", "da prima", "resume"]
const TEMP = ["ieri", "today", "yesterday", "last", "prima", "earlier", "ultime", "recent", "recently"]
const EXPLICIT_RECALL = [
  /di\s+cosa\s+abbiamo\s+(?:parlato|discusso|trattato)/i,
  /cosa\s+abbiamo\s+(?:fatto|detto)\s+(?:ultimamente|nelle\s+ultime\s+chat|nelle\s+ultime\s+sessioni)/i,
  /di\s+cosa\s+si\s+è\s+parlato/i,
  /what\s+did\s+we\s+(?:talk\s+about|discuss)\s+(?:recently|in\s+the\s+last\s+sessions?)/i,
  /what\s+have\s+we\s+been\s+(?:working\s+on|discussing)/i,
]

const PROTO: Record<Exclude<RecallIntentKind, "none">, string[]> = {
  explicit_recall: [
    "what did we discuss in previous sessions and what feedback did i give",
    "di cosa abbiamo discusso nelle ultime sessioni e quale feedback ho dato",
  ],
  project_context: ["what did we decide before about this project", "cosa avevamo deciso prima su questo progetto"],
  continuation: ["continue from where we left off previously", "riprendi da dove eravamo rimasti"],
  preference_reuse: ["use my previous preferences and feedback", "usa le mie preferenze e i feedback precedenti"],
}

const W = {
  lexical: 0.34,
  temporal: 0.12,
  referential: 0.14,
  semantic: 0.3,
  question: 0.1,
} as const

export namespace MemoryIntent {
  export async function classify(text: string): Promise<RecallIntent> {
    const raw = text.trim()
    if (!raw) {
      return out("none", "unknown", 0, [], {
        lexical: 0,
        temporal: 0,
        referential: 0,
        semantic: 0,
        question: 0,
      })
    }

    const norm = raw.toLowerCase()
    const lang = detectLang(norm)
    const lexical = lexicalScore(norm)
    const temporal = hasAny(norm, TEMP) ? 1 : 0
    const referential = /(we|our|abbiamo|nostr|prima|before|già|already|mio|miei|mie|my)/i.test(norm) ? 1 : 0
    const question = /\?|\b(cosa|what|which|quando|when|who)\b/i.test(norm) ? 1 : 0
    const semantic = await semanticScore(norm)
    const score = clamp(
      W.lexical * lexical +
        W.temporal * temporal +
        W.referential * referential +
        W.semantic * semantic +
        W.question * question,
    )

    const reasons = [
      lexical > 0.55 ? "lexical_recall_signal" : "",
      temporal > 0 ? "temporal_reference" : "",
      referential > 0 ? "cross_turn_reference" : "",
      semantic > 0.55 ? "semantic_recall_similarity" : "",
    ].filter(Boolean)

    const kind = classifyKind(norm, score)
    return out(kind, lang, score, reasons, {
      lexical,
      temporal,
      referential,
      semantic,
      question,
    })
  }
}

function classifyKind(text: string, score: number): RecallIntentKind {
  if (hasPreferenceCue(text)) return "preference_reuse"
  if (hasExplicitRecallCue(text)) return "explicit_recall"
  if (score < 0.36) return "none"
  if (hasAny(text, PREF)) return "preference_reuse"
  if (hasAny(text, CONT)) return "continuation"
  if (/(session|sessioni|history|storico|ricord|remember|feedback)/i.test(text)) return "explicit_recall"
  return "project_context"
}

function detectLang(text: string): Lang {
  const it = hitCount(text, IT)
  const en = hitCount(text, EN)
  if (it > 0 && en > 0) return "mixed"
  if (it > 0) return "it"
  if (en > 0) return "en"
  return "unknown"
}

function lexicalScore(text: string): number {
  const a = hitRatio(text, IT)
  const b = hitRatio(text, EN)
  const c = hasAny(text, PREF) ? 0.8 : 0
  const d = hasAny(text, CONT) ? 0.8 : 0
  const e = EXPLICIT_RECALL.some((re) => re.test(text)) ? 0.95 : 0
  return clamp(Math.max(a, b, c, d, e))
}

async function semanticScore(text: string): Promise<number> {
  if (!Flag.KILO_MEMORY_INTENT_CLASSIFIER_V1) return 0
  const terms = [
    "session",
    "ricorda",
    "remember",
    "previous",
    "feedback",
    "preferenze",
    "gusti",
    "gusto",
    "mi piace",
    "preferences",
    "taste",
    "recommend",
    "consigli",
    "consigliami",
  ]
  const has = terms.some((x) => text.includes(x))
  if (!has) return 0
  try {
    const probes = Object.values(PROTO).flat()
    const vec = await MemoryEmbedding.embedBatch([text, ...probes])
    const q = vec[0]
    const sim = vec.slice(1).map((v) => cos(q, v))
    const top = sim.sort((x, y) => y - x)[0] ?? 0
    return clamp((top - 0.2) / 0.8)
  } catch (err) {
    log.warn("intent semantic scoring failed", { err: String(err) })
    return 0
  }
}

function hitCount(text: string, words: string[]): number {
  return words.filter((x) => text.includes(x)).length
}

function hitRatio(text: string, words: string[]): number {
  if (words.length === 0) return 0
  return hitCount(text, words) / words.length
}

function hasAny(text: string, words: string[]): boolean {
  return words.some((x) => text.includes(x))
}

function hasPreferenceCue(text: string): boolean {
  if (hasAny(text, PREF)) return true
  if (/\b(consigliami|consiglia|raccomanda)\b/i.test(text) && /(gust|prefer|piac)/i.test(text)) return true
  if (/\b(recommend|suggest)\b/i.test(text) && /(taste|preference|like)/i.test(text)) return true
  if (/\b(simile|similar)\b/i.test(text) && /(piace|liked|like)/i.test(text)) return true
  return false
}

function hasExplicitRecallCue(text: string): boolean {
  if (EXPLICIT_RECALL.some((re) => re.test(text))) return true
  if (
    /\b(ultimamente|ultime\s+chat|ultime\s+sessioni|precedenti\s+sessioni)\b/i.test(text) &&
    /\b(abbiamo|we)\b/i.test(text)
  ) {
    return true
  }
  return false
}

function clamp(n: number): number {
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function cos(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  const dot = a.reduce((acc, x, i) => acc + x * b[i], 0)
  const na = Math.sqrt(a.reduce((acc, x) => acc + x * x, 0))
  const nb = Math.sqrt(b.reduce((acc, x) => acc + x * x, 0))
  const den = na * nb
  if (den === 0) return 0
  return dot / den
}

function out(
  kind: RecallIntentKind,
  lang: Lang,
  score: number,
  reasons: string[],
  feats: RecallIntent["feats"],
): RecallIntent {
  return { kind, lang, score, reasons, feats }
}
