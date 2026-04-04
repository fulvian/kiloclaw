import { describe, expect, it } from "bun:test"
import { join } from "path"
import { tmpdir } from "../fixture/fixture"
import { MemoryBrokerV2, MemoryDb } from "@/kiloclaw/memory"
import { GraphMemoryRepo } from "@/kiloclaw/memory"
import { MemoryExtractor } from "@/kiloclaw/memory/memory.extractor"
import { MemoryGraph } from "@/kiloclaw/memory/memory.graph"

describe("Memory Graph", () => {
  it("upserts entities and deduplicates edges", async () => {
    await using tmp = await tmpdir()
    const dbPath = join(tmp.path, "test-graph.db")
    await MemoryDb.init(dbPath)

    const first = await GraphMemoryRepo.upsertEntity({
      id: "ent_1",
      tenant_id: "default",
      name: "project",
      entity_type: "project",
      metadata_json: { source: "test" },
      created_at: Date.now(),
      updated_at: Date.now(),
    })

    const second = await GraphMemoryRepo.upsertEntity({
      id: "ent_2",
      tenant_id: "default",
      name: "project",
      entity_type: "project",
      metadata_json: { source: "update" },
      created_at: Date.now(),
      updated_at: Date.now(),
    })

    expect(second).toBe(first)

    const react = await GraphMemoryRepo.upsertEntity({
      id: "ent_react",
      tenant_id: "default",
      name: "React",
      entity_type: "technology",
      metadata_json: {},
      created_at: Date.now(),
      updated_at: Date.now(),
    })

    await GraphMemoryRepo.addEdge({
      id: "edge_1",
      tenant_id: "default",
      source_id: first,
      relation: "uses",
      target_id: react,
      weight: 100,
      metadata_json: {},
      created_at: Date.now(),
    })

    await GraphMemoryRepo.addEdge({
      id: "edge_2",
      tenant_id: "default",
      source_id: first,
      relation: "uses",
      target_id: react,
      weight: 100,
      metadata_json: {},
      created_at: Date.now(),
    })

    const connected = await GraphMemoryRepo.getConnected("default", first, "uses")
    expect(connected.length).toBe(1)
    expect(connected[0].entity.name).toBe("React")

    await MemoryDb.close()
  })

  it("persists graph from extractor entities", async () => {
    await using tmp = await tmpdir()
    const dbPath = join(tmp.path, "test-graph-extractor.db")
    await MemoryDb.init(dbPath)

    await MemoryExtractor.persistGraph("project uses React and Node", {
      sessionId: "s1",
      agentId: "a1",
      correlationId: "c1",
    })

    const project = await MemoryGraph.upsertEntity({
      name: "project",
      type: "project",
    })

    const connected = await GraphMemoryRepo.getConnected("default", project, "uses")
    const names = connected.map((item) => item.entity.name).sort()

    expect(names).toContain("React")
    expect(names).toContain("Node")

    const traversed = await GraphMemoryRepo.traverse("default", project, 2)
    expect(traversed.includes(project)).toBe(true)
    expect(traversed.length).toBeGreaterThanOrEqual(3)

    await MemoryDb.close()
  })

  it("improves retrieval with graph-assisted boost", async () => {
    await using tmp = await tmpdir()
    const dbPath = join(tmp.path, "test-graph-retrieve.db")
    await MemoryDb.init(dbPath)

    await MemoryBrokerV2.semantic().assert("project", "uses", "React", 90)
    await MemoryBrokerV2.semantic().assert("project", "uses", "TypeScript", 90)
    await MemoryBrokerV2.semantic().assert("project", "uses", "Docker", 90)

    await MemoryExtractor.persistGraph("project uses React and TypeScript", {
      sessionId: "s2",
      agentId: "a2",
      correlationId: "c2",
    })

    const out = await MemoryBrokerV2.retrieve({
      query: "what technology is related to React in this project",
      limit: 8,
    })

    const text = JSON.stringify(out.items).toLowerCase()
    expect(text.includes("react")).toBe(true)
    expect(text.includes("typescript") || text.includes("docker")).toBe(true)

    await MemoryDb.close()
  })
})
