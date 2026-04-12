import { describe, expect, test } from "bun:test"
import { Config } from "@/kiloclaw/config"

function snapshotLegacyEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => key.startsWith("ARIA_") || key.startsWith("KILO_") || key.startsWith("OPENCODE_"),
    ),
  )
}

function clearLegacyEnv() {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("ARIA_") || key.startsWith("KILO_") || key.startsWith("OPENCODE_")) {
      delete process.env[key]
    }
  }
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key]
      continue
    }
    process.env[key] = value
  }
}

describe("Kiloclaw strict env", () => {
  test("should block config creation when legacy env vars exist", () => {
    const previousStrict = process.env["KILOCLAW_STRICT_ENV"]
    const previousLegacy = process.env["KILO_TEST_LEGACY_FLAG"]

    process.env["KILOCLAW_STRICT_ENV"] = "true"
    process.env["KILO_TEST_LEGACY_FLAG"] = "1"

    try {
      expect(() => Config.create({})).toThrow("KILOCLAW_STRICT_ENV=true blocks legacy env prefixes")
    } finally {
      if (previousStrict === undefined) delete process.env["KILOCLAW_STRICT_ENV"]
      else process.env["KILOCLAW_STRICT_ENV"] = previousStrict

      if (previousLegacy === undefined) delete process.env["KILO_TEST_LEGACY_FLAG"]
      else process.env["KILO_TEST_LEGACY_FLAG"] = previousLegacy
    }
  })

  test("should allow config creation with strict mode and no legacy prefixes", () => {
    const legacySnapshot = snapshotLegacyEnv()
    const previousStrict = process.env["KILOCLAW_STRICT_ENV"]
    const previousDebug = process.env["KILOCLAW_DEBUG"]

    clearLegacyEnv()
    process.env["KILOCLAW_STRICT_ENV"] = "true"
    process.env["KILOCLAW_DEBUG"] = "true"

    try {
      const cfg = Config.create({})
      expect(cfg.config.debug).toBe(true)
    } finally {
      if (previousStrict === undefined) delete process.env["KILOCLAW_STRICT_ENV"]
      else process.env["KILOCLAW_STRICT_ENV"] = previousStrict

      if (previousDebug === undefined) delete process.env["KILOCLAW_DEBUG"]
      else process.env["KILOCLAW_DEBUG"] = previousDebug

      restoreEnv(legacySnapshot)
    }
  })
})
