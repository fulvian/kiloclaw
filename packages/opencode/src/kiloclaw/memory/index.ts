// Kiloclaw Memory 4-Layer - Barrel exports

// Types
export * from "./types.js"

// Memory layers
export { WorkingMemory, workingMemory } from "./working.js"
export { EpisodicMemory, episodicMemory } from "./episodic.js"
export { SemanticMemory, semanticMemory } from "./semantic.js"
export { ProceduralMemory, proceduralMemory } from "./procedural.js"

// Broker and lifecycle
export { MemoryBroker, memoryBroker } from "./broker.js"
export { MemoryLifecycle, memoryLifecycle } from "./lifecycle.js"
