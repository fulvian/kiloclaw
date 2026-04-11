import { describe, expect, it } from "bun:test"
import { Bus } from "@/bus"
import { Instance } from "@/project/instance"
import {
  NbaRuntime,
  type NbaPolicyDecision,
  type NbaRequestCompleted,
  type NbaRequestStarted,
  type NbaSignalEvent,
} from "@/kiloclaw/agency/nba/runtime"
import { tmpdir } from "../fixture/fixture"

describe("nba runtime", () => {
  it("denies unknown capability by default", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const out = NbaRuntime.decide({
          capability: "unknown_capability",
        })

        expect(out.outcome).toBe("deny")
        expect(out.policy).toBe("DENY")
        expect(out.hitlRequired).toBeFalse()
      },
    })
  })

  it("requires hitl for stake sizing", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const out = NbaRuntime.decide({
          capability: "stake_sizing",
        })

        expect(out.outcome).toBe("require_hitl")
        expect(out.policy).toBe("CONFIRM")
        expect(out.hitlRequired).toBeTrue()
      },
    })
  })

  it("blocks recommendation on stale odds", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const out = NbaRuntime.decide({
          capability: "recommendation_report",
          freshness: {
            odds: {
              freshness_seconds: 200,
              max_freshness_seconds: 120,
            },
          },
        })

        expect(out.outcome).toBe("deny")
        expect(out.reason).toContain("stale")
      },
    })
  })

  it("clamps confidence in emitted signal and recommendation", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const signal = NbaRuntime.emitSignal({
          signal_id: "sig-1",
          game_id: "game-1",
          market: "h2h",
          model_probability: 0.55,
          fair_implied_probability: 0.51,
          edge: 0.04,
          value_flag: true,
          confidence: 0.999,
          calibration_bucket: "0.9-1.0",
          stale_blocked: false,
          freshness_seconds: 5,
          freshness_state: "fresh",
          collected_at_utc: new Date().toISOString(),
        })

        const rec = NbaRuntime.emitRecommendation({
          recommendation_id: "rec-1",
          signal_id: signal.signal_id,
          action: "lean_home",
          rationale: "edge positive",
          confidence: 0.999,
          constraints: {
            hitl_required: true,
            max_stake_pct: 0.01,
          },
          policy_level: "CONFIRM",
          emitted_at_utc: new Date().toISOString(),
        })

        expect(signal.confidence).toBe(0.95)
        expect(rec.confidence).toBe(0.95)
      },
    })
  })

  it("publishes policy decision telemetry event", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const seen: Array<{
          started: NbaRequestStarted[]
          completed: NbaRequestCompleted[]
          policy: NbaPolicyDecision[]
          emitted: NbaSignalEvent[]
        }> = [
          {
            started: [],
            completed: [],
            policy: [],
            emitted: [],
          },
        ]

        const unsub = Bus.subscribeAll((event) => {
          if (event.type === "agency2.request_started") {
            seen[0].started.push(event.properties as NbaRequestStarted)
          }

          if (event.type === "agency2.request_completed") {
            seen[0].completed.push(event.properties as NbaRequestCompleted)
          }

          if (event.type === "agency2.policy_decision") {
            seen[0].policy.push(event.properties as NbaPolicyDecision)
          }

          if (event.type === "agency2.signal_emitted") {
            seen[0].emitted.push(event.properties as NbaSignalEvent)
          }
        })

        try {
          const out = NbaRuntime.decide({ capability: "probability_estimation" })
          expect(out.outcome).toBe("allow")
        } finally {
          unsub()
        }

        expect(seen[0].started.length).toBe(1)
        expect(seen[0].policy.length).toBe(1)
        expect(seen[0].completed.length).toBe(1)
        expect(seen[0].policy[0]?.capability).toBe("probability_estimation")
      },
    })
  })
})
