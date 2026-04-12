# Kiloclaw

> AI Assistant with 4-layer memory, multi-agency orchestration, and policy-first execution.

## CLI Branding

The CLI displays a green gradient ASCII art logo "KILOCLAW" on startup:

- **Location**: `packages/opencode/src/cli/logo.ts` (ASCII art definition)
- **Rendering**: `packages/opencode/src/cli/ui.ts` (gradient color application)
- **Colors**: Green gradient from dark (`#164a16`) to bright (`#82ff82`)

## Credits

**Kiloclaw** is a fork of **[KiloCode](https://github.com/Kilo-Org/kilocode)** (formerly OpenCode). The base code and architecture draws heavily from KiloCode's agent/tool system, session management, and CLI infrastructure.

Kiloclaw extends the foundation with:

- **Multi-agency architecture**: Hierarchical orchestration (Core → Agency → Agent → Skill → Tool)
- **4-layer memory system**: Working, Episodic, Semantic, Procedural
- **Policy-first execution**: Risk scoring, guardrails, proactivity budget, human-in-the-loop checkpoints
- **Full isolation**: No dependencies on KiloCode runtime, config, or telemetry

## Status

**Foundation Phase**: ✅ Complete  
**Core Runtime**: ✅ Complete  
**Memory 4-Layer**: ✅ Complete  
**Agency Migration**: ✅ Complete  
**Flexible Agents**: ✅ Complete (13 agents with prompt/permission)  
**Runtime Stability**: ✅ Enhanced (CLI hang fixes, logging optimization)  
**Development Agency Refoundation**: ✅ Complete (Native-first factory, 1037 tests pass)  
**Development Agency GA**: 🟢 LIVE (2026-04-12 15:07 UTC+2)

### Feature Flags (Active - GA)

```bash
KILO_NATIVE_FACTORY_ENABLED=true          # Native factory enabled (GA)
KILO_NATIVE_FACTORY_SHADOW=false          # Shadow mode disabled
KILO_NATIVE_FACTORY_CANARY_PERCENT=100    # 100% rollout (all users)
```

**Transition**: Shadow Mode → General Availability (skipped canary phase)  
See [docs/plans/KILOCLAW_FOUNDATION_PLAN.md](docs/plans/KILOCLAW_FOUNDATION_PLAN.md) for the full roadmap.  
See [docs/agencies/plans/](docs/agencies/plans/) for Development Agency refactoring documentation.

## Recent Fixes (2026-04-12)

| Fix                                 | Impact                 | Details                                                                                                                                                                                           |
| ----------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Permission logging optimization** | 60-75% log reduction   | Downgraded permission ruleset logging from INFO to DEBUG level, reducing log bloat from 600KB+ to 150-300KB per session. See [CLI_HANG_INVESTIGATION_REPORT.md](CLI_HANG_INVESTIGATION_REPORT.md) |
| **Pseudo tool call recovery**       | NBA runtime stability  | Implemented detection and recovery for LLM-emitted pseudo `[TOOL_CALL]...[/TOOL_CALL]` markup that bypasses proper tool invocation                                                                |
| **NBA skill output instructions**   | Better recommendations | Added explicit output formatting requirements to prevent generic follow-ups and ensure structured value-bet shortlists                                                                            |

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
       |  Agency Dev  |  | Agency Know. |  | Agency Nutri|  +-----v-------+
       +------+-------+  +------+-------+  +------+------+  | Agency Wea.|
       +------+-------+  +------+-------+  +------+------+  +------+------+
              |                 |                 |                 |
       +------v------+   +------v------+   +------v------+   +------v------+
       | Agents      |   | Agents      |   | Agents      |   | Agents      |
       +------+------+   +------+------+   +------+------+   +------+------+
              |
       +------v----------------------------------------------+
       | Skills layer (planning, review, retrieval, etc.)       |
       +------+----------------------------------------------+
              |
       +------v----------------------------------------------+
       | Tools + MCP (fs, git, web, APIs, connectors)        |
       +-----------------------------------------------------+
```

### Flexible Agents

Kiloclaw uses capability-based flexible agents. The **router** agent is the main entry point that automatically delegates to specialized agents based on user intent. Users can also select specific agents directly.

**Primary Agent (Entry Point):**
| Agent | Description |
|--------|-------------|
| router | Automatically routes tasks to specialized agents based on intent classification |

**Subagents (invoked by router or directly via Task tool):**
| Agent | Agency | Capabilities |
| --------------- | ----------- | ---------------------------------------------- |
| coder | development | code-generation, code-modification, bug-fixing |
| debugger | development | debugging, root-cause-analysis |
| planner | development | task-planning, code-planning |
| code-reviewer | development | code-review, quality-assurance |
| researcher | knowledge | web-search, academic-research, fact-checking |
| analyst | knowledge | data-analysis, comparison, evaluation |
| educator | knowledge | explanation, summarization, teaching |
| nutritionist | nutrition | nutrition-analysis, food-analysis |
| recipe-searcher | nutrition | recipe-search, meal-ideas |
| diet-planner | nutrition | meal-planning, diet-generation |
| weather-current | weather | weather-query, current-weather |
| forecaster | weather | weather-forecast, prediction |
| alerter | weather | weather-alerts, notifications |

Run `kiloclaw agent list` to see all available agents.

## Key Documents

| Document                                                                                                        | Description                                      |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| [BLUEPRINT](docs/foundation/KILOCLAW_BLUEPRINT.md)                                                              | Vision, principles, architecture target          |
| [AGENCY_AGENT_SKILL_TOOL_GUIDE](docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md) | Canonical implementation guide for agency stack  |
| [FOUNDATION_PLAN](docs/plans/KILOCLAW_FOUNDATION_PLAN.md)                                                       | 16-week implementation roadmap                   |
| [ELIMINATE_NATIVE_AGENTS](docs/plans/ELIMINATE_NATIVE_AGENTS_PLAN.md)                                           | Migrating to flexible agents                     |
| [ADR-001](docs/adr/ADR-001_Runtime_Hierarchy.md)                                                                | Runtime hierarchy (Core→Agency→Agent→Skill→Tool) |
| [ADR-002](docs/adr/ADR-002_Memory_4_Layer.md)                                                                   | 4-layer memory architecture                      |
| [ADR-003](docs/adr/ADR-003_Safety_Guardrails_Proactivity.md)                                                    | Safety, guardrails, proactivity policy           |
| [ADR-004](docs/adr/ADR-004_Isolation_from_KiloCode.md)                                                          | Isolation from KiloCode runtime                  |
| [DEPLOYMENT_STATUS](DEPLOYMENT_STATUS_2026-04-12.md)                                                            | Development Agency Shadow Mode deployment status |
| [ROLLOUT_PLAN](docs/agencies/plans/KILOCLAW_DEVELOPMENT_AGENCY_ROLLOUT_PLAN_V1_2026-04-12.md)                   | Phased rollout (shadow → canary → GA)            |
| [GO_NO_GO_REVIEW](docs/agencies/plans/KILOCLAW_DEVELOPMENT_AGENCY_GO_NO_GO_REVIEW_V1_2026-04-12.md)             | Development Agency verification & gate review    |

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

### Task Commands

Use `kiloclaw task` in CLI or `/tasks` in TUI for the same task control flow.

- Supported selectors: short task ref `tsk_...`, exact task name, or `#<index>` from task list
- Quote `#<index>` in shell commands to avoid comment parsing

```bash
# CLI: run task now with different selectors
kiloclaw task run-now tsk_01hzy8jv7w
kiloclaw task run-now "Daily summary"
kiloclaw task run-now "#2"

# TUI slash commands
/tasks show tsk_01hzy8jv7w
/tasks run #2
/tasks pause "Daily summary"
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
