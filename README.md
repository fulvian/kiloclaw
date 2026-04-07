# Kiloclaw

> AI Assistant with 4-layer memory, multi-agency orchestration, and policy-first execution.

## Credits

**Kiloclaw** is a fork of **[KiloCode](https://github.com/Kilo-Org/kilocode)** (formerly OpenCode). The base code and architecture draws heavily from KiloCode's agent/tool system, session management, and CLI infrastructure.

Kiloclaw extends the foundation with:

- **Multi-agency architecture**: Hierarchical orchestration (Core → Agency → Agent → Skill → Tool)
- **4-layer memory system**: Working, Episodic, Semantic, Procedural
- **Policy-first execution**: Risk scoring, guardrails, proactivity budget, human-in-the-loop checkpoints
- **Full isolation**: No dependencies on KiloCode runtime, config, or telemetry

## Status

**Foundation Phase**: ✅ Complete  
**Core Runtime**: ✅ Implemented  
**Memory 4-Layer**: In Progress  
**Agency Migration**: Pending

See [docs/plans/KILOCLAW_FOUNDATION_PLAN.md](docs/plans/KILOCLAW_FOUNDATION_PLAN.md) for the full roadmap.

## Architecture

```
+---------------------------------------------------------------+
|                     KILOCLAW CORE ORCHESTRATOR               |
| intent routing | policy engine | memory broker | scheduler    |
+------------------------------+--------------------------------+
                               |
               +----------------+----------------+
               |                |                |
       +-------v------+  +------v-------+  +-----v-------+
       |  Agency Dev  |  | Agency Know. |  | Agency Nutri|
       +------+-------+  +------+-------+  +------+------+
              |                 |                 |
       +------v------+   +------v------+   +------v------+
       | Agents      |   | Agents      |   | Agents      |
       +------+------+   +------+------+   +------+------+
              |
       +------v----------------------------------------------+
       | Skills layer (planning, review, retrieval, etc.)       |
       +------+----------------------------------------------+
              |
       +------v----------------------------------------------+
       | Tools + MCP (fs, git, web, APIs, connectors)        |
       +-----------------------------------------------------+
```

## Key Documents

| Document                                                                                                        | Description                                      |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [BLUEPRINT](docs/foundation/KILOCLAW_BLUEPRINT.md)                                                              | Vision, principles, architecture target          |
| [AGENCY_AGENT_SKILL_TOOL_GUIDE](docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md) | Canonical implementation guide for agency stack  |
| [FOUNDATION_PLAN](docs/plans/KILOCLAW_FOUNDATION_PLAN.md)                                                       | 16-week implementation roadmap                   |
| [ADR-001](docs/adr/ADR-001_Runtime_Hierarchy.md)                                                                | Runtime hierarchy (Core→Agency→Agent→Skill→Tool) |
| [ADR-002](docs/adr/ADR-002_Memory_4_Layer.md)                                                                   | 4-layer memory architecture                      |
| [ADR-003](docs/adr/ADR-003_Safety_Guardrails_Proactivity.md)                                                    | Safety, guardrails, proactivity policy           |
| [ADR-004](docs/adr/ADR-004_Isolation_from_KiloCode.md)                                                          | Isolation from KiloCode runtime                  |

## Getting Started

```bash
# Clone the repository
git clone https://github.com/fulvian/kiloclaw.git
cd kiloclaw

# Install dependencies
bun install

# Run typecheck
bun run typecheck

# Run tests
bun test
```

## License

MIT - See [LICENSE](LICENSE)

## Relationship to KiloCode

Kiloclaw is a **fork** that maintains compatibility with KiloCode's plugin ecosystem and tool interfaces, but operates as a completely isolated system:

- Separate data directory (`~/.kiloclaw/` vs `~/.kilocode/`)
- Separate environment prefix (`KILOCLAW_*` vs `KILO_*`)
- Separate telemetry endpoints
- No shared state or configuration

---

_This project is based on [KiloCode](https://github.com/Kilo-Org/kilocode), which itself is a fork of [OpenCode](https://github.com/anomalyco/opencode)._
