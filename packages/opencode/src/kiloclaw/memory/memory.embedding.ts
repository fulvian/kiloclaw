import { Log } from "@/util/log"
import { AutoStart } from "@/kiloclaw/lmstudio/autostart"
import { HealthCheck } from "@/kiloclaw/lmstudio/health"
import { Lifecycle as LMStudioLifecycle } from "@/kiloclaw/lmstudio/lifecycle"

const log = Log.create({ service: "kiloclaw.memory.embedding" })

const BASE_URL = process.env["KILO_MEMORY_LMSTUDIO_BASE_URL"] ?? "http://127.0.0.1:1234"
const MODEL = process.env["KILO_MEMORY_EMBEDDING_MODEL"] ?? "text-embedding-mxbai-embed-large-v1"
const TIMEOUT_MS = Number(process.env["KILO_MEMORY_EMBEDDING_TIMEOUT_MS"] ?? 10000)
const RETRIES = Number(process.env["KILO_MEMORY_EMBEDDING_RETRIES"] ?? 2)

let modelReady = false

type EmbeddingResponse = {
  data?: Array<{
    embedding?: number[]
  }>
}

export namespace MemoryEmbedding {
  export async function ensureReady(): Promise<void> {
    const health = await HealthCheck.check(BASE_URL, { timeout: 3000, retries: 1 })
    if (!health.reachable) {
      const started = await AutoStart.startDaemon(BASE_URL)
      if (!started.success) {
        throw new Error(started.error ?? "LM Studio unavailable")
      }
    }

    if (modelReady) return

    try {
      const loaded = await LMStudioLifecycle.isModelLoaded(BASE_URL, MODEL)
      if (!loaded) {
        await LMStudioLifecycle.loadModel(BASE_URL, {
          model: MODEL,
          ttl: 1800,
          priority: "high",
        })
      }
    } catch (err) {
      // Some LM Studio builds expose /v1/embeddings without supporting /api/v1/models/load
      // Continue and let embedding request validate availability.
      log.warn("model preload skipped", { model: MODEL, err: String(err) })
    }

    modelReady = true
  }

  export async function embed(input: string): Promise<number[]> {
    const [first] = await embedBatch([input])
    return first
  }

  export async function embedBatch(input: string[]): Promise<number[][]> {
    await ensureReady()

    const body = JSON.stringify({
      model: MODEL,
      input,
    })

    const attempt = async (round: number): Promise<number[][]> => {
      const ctl = new AbortController()
      const to = setTimeout(() => ctl.abort(), TIMEOUT_MS)

      try {
        const res = await fetch(`${BASE_URL}/v1/embeddings`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body,
          signal: ctl.signal,
        })

        if (!res.ok) {
          const txt = await res.text()

          // LM Studio reports no loaded models with HTTP 400
          if (res.status === 400 && txt.toLowerCase().includes("no models loaded")) {
            modelReady = false
            await ensureReady()
            throw new Error("embedding model was not loaded; retried model load")
          }

          throw new Error(`embedding request failed ${res.status}: ${txt}`)
        }

        const json = (await res.json()) as EmbeddingResponse
        const out = (json.data ?? []).map((x) => x.embedding ?? [])

        const invalid = out.some((x) => !Array.isArray(x) || x.length === 0)
        if (invalid) {
          throw new Error("embedding response missing vectors")
        }

        return out
      } catch (err) {
        const canRetry = round < RETRIES
        if (canRetry) {
          log.warn("embedding request retry", { round, err: String(err) })
          return attempt(round + 1)
        }
        throw err
      } finally {
        clearTimeout(to)
      }
    }

    return attempt(0)
  }

  export function model(): string {
    return MODEL
  }

  export function baseURL(): string {
    return BASE_URL
  }
}
