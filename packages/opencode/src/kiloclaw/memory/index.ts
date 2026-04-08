// Kiloclaw Memory 4-Layer - Barrel exports

// Types - use export * to allow merging with namespaces of same name
export * from "./types.js"

// Memory layers - export both namespaces (for module methods) and instances
export { workingMemory, WorkingMemory } from "./working.js"
export { episodicMemory, EpisodicMemory } from "./episodic.js"
export { semanticMemory, SemanticMemory } from "./semantic.js"
export { proceduralMemory, ProceduralMemory } from "./procedural.js"

// Broker and lifecycle - export both namespaces and instances
export { memoryBroker, MemoryBroker } from "./broker.js"
export { memoryLifecycle, MemoryLifecycle } from "./lifecycle.js"

// Durability and retrieval
export { MemorySqliteStore } from "./persistence/sqlite-store"
export { RetentionJob, type RetentionSummary } from "./jobs/retention"
export { MemoryRanker, type RankWeights } from "./retrieval/ranker"
