import { describe, expect, it } from "bun:test"

const root = `${import.meta.dir}/../../src/kiloclaw/memory`

const files = [
  `${root}/memory.broker.v2.ts`,
  `${root}/memory.embedding.ts`,
  `${root}/memory.retention.ts`,
  `${root}/memory.backfill.ts`,
  `${root}/memory.repository.ts`,
]

const banned = [
  /\bTODO\b/i,
  /\bplaceholder\b/i,
  /not implemented/i,
  /pseudo-embedding/i,
  /hash-based embedding/i,
  /legacy_path/i,
]

describe("Memory V2 no-stub gate", () => {
  for (const file of files) {
    it(`should not contain banned placeholder markers: ${file.split("/").pop()}`, async () => {
      const text = await Bun.file(file).text()
      for (const re of banned) {
        expect(re.test(text)).toBe(false)
      }
    })
  }
})
