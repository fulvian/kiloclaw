# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## SUMMARY

**Kilo CLI** is an open source AI coding agent that generates code from natural language, automates tasks, and supports 500+ AI models. It's built as a monorepo fork of [opencode](https://github.com/anomalyco/opencode) with Kilo-specific extensions for agency/orchestration patterns (Kiloclaw system).

The project uses **Bun** (v1.3.10) as package manager, **Turbo** for monorepo orchestration, **TypeScript**, and **SolidJS** for UI components.

**Always use parallel tools when applicable.** The default branch is `main`. You may be running in a git worktree — all changes must stay in your current working directory.

---

## ⚠️ MANDATORY DOCUMENTATION RULE

**ALL documents created must be saved ONLY as `.md` files (never `.txt` or any other format) and MUST be saved ONLY inside `docs/` and its subdirectories.**

This is an **inderogable rule**. Apply it to:
- Analysis documents
- Investigation reports
- Phase progress/completion logs
- Architecture decisions
- Debugging notes
- Test results
- Handover documents
- Any other documentation

**Valid paths**:
- `docs/analysis/`
- `docs/guide/`
- `docs/safety/`
- `docs/tech-debt/`
- `docs/plans/`
- `docs/handoff/`
- `docs/protocols/`
- `docs/architecture/`
- `docs/migration/`
- `docs/qa/`
- `docs/foundation/`
- `docs/agencies/`
- `docs/release/`
- Or create new subdirectories under `docs/` if needed

**Invalid**:
- Root-level `.md` files (unless explicitly required like CLAUDE.md, AGENTS.md, README.md which are already there)
- `.txt` files anywhere
- Documents outside `docs/`

---

## BUILD, LINT, AND TEST COMMANDS

### Root Level
```bash
bun run dev              # Dev mode (runs opencode package)
bun run typecheck        # Typecheck all packages (uses tsgo, not tsc)
bun run extension        # Build + launch VS Code with extension in dev mode
```

### packages/opencode (Core CLI)
```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/opencode --conditions=browser src/index.ts    # Direct run
bun run --cwd packages/opencode typecheck    # tsgo --noEmit
bun run --cwd packages/opencode test         # All tests
bun run --cwd packages/opencode test test/tool/tool.test.ts  # Single test (from package dir)
bun run --cwd packages/opencode test test/scheduler.test.ts -- --grep "test name"  # Single test with grep
```

### packages/kilo-vscode (VS Code Extension)
```bash
bun run --cwd packages/kilo-vscode compile       # Typecheck + lint + build
bun run --cwd packages/kilo-vscode watch         # Watch mode (esbuild + tsc)
bun run --cwd packages/kilo-vscode test          # Run tests
bun run --cwd packages/kilo-vscode lint          # ESLint on src/
bun run --cwd packages/kilo-vscode format        # Format before committing
bun run --cwd packages/kilo-vscode extension     # Build + launch VS Code dev mode
bun script/local-bin.ts                          # Build CLI binary to bin/kilo
```

### SDK Regeneration
```bash
./script/generate.ts   # Regenerate packages/sdk/js/ after changing server endpoints
```

### Other Utilities
```bash
bun run --cwd packages/kilo-vscode knip              # Check unused exports
bun script/extract-source-links.ts                    # Update source-links.md after URL changes
bun run --cwd packages/kilo-vscode check-kilocode-change  # Verify no kilocode_change markers in wrong places
```

**TESTING:** No mocks — test actual implementation against real artifacts. Use the `tmpdir` fixture from `packages/opencode/test/fixture/fixture.ts` for temporary directories. Tests compile to `out/` (not `dist/`).

---

## MONOREPO STRUCTURE

| Package | Name | Purpose |
|---------|------|---------|
| `packages/opencode/` | `@kilocode/cli` | Core CLI — agents, tools, sessions, orchestration |
| `packages/sdk/js/` | `@kilocode/sdk` | Auto-generated SDK (do NOT edit `src/gen/`) |
| `packages/kilo-vscode/` | `kilo-code` | VS Code extension + Agent Manager UI |
| `packages/kilo-gateway/` | `@kilocode/kilo-gateway` | Auth, provider routing |
| `packages/kilo-telemetry/` | `@kilocode/kilo-telemetry` | PostHog + OpenTelemetry |
| `packages/kilo-ui/` | `@kilocode/kilo-ui` | SolidJS component library |
| `packages/plugin/` | `@kilocode/plugin` | Plugin/tool interface definitions |
| `packages/util/` | `@opencode-ai/util` | Shared utilities |

---

## CODE STYLE GUIDELINES (MANDATORY)

### Naming Rules — MANDATORY
- **Prefer single-word names**: `pid`, `cfg`, `err`, `opts`, `dir`, `root`, `child`, `state`, `timeout`
- Multi-word names only when a single word is ambiguous
- Do NOT introduce new camelCase compounds when a short single-word alternative exists
- **Before finishing edits, review touched lines and shorten newly introduced identifiers**

### Imports
- Use path aliases where configured: `@/*` maps to `./src/*`
- Prefer absolute imports via aliases over relative paths in deep files
- Named imports preferred: `import { Foo } from "bar"` not `import bar from "bar"`

### Types
- Avoid `any` type
- Rely on type inference; avoid explicit type annotations unless necessary for exports
- Use Zod schemas for input validation (see `fn()` pattern below)

### Control Flow — NO `let` or `else` STATEMENTS
- **No `let` statements** — use `const` with ternary or early returns
- **No `else` statements** — prefer early returns or `iife()`

```ts
// Good
const foo = condition ? 1 : 2
function bar() {
  if (x) return 1
  return 2
}

// Bad
let foo
if (condition) foo = 1
else foo = 2
```

### Error Handling
- **No empty catch blocks** — always log or handle errors
- Use `NamedError.create()` for structured errors with Zod schemas

```ts
try {
  await save(data)
} catch (err) {
  log.error("save failed", { err })
}
```

### Bun APIs
- Use Bun APIs when available: `Bun.file()`, `Bun.write()`, `$` from "bun"

### Windows Process Spawning — CRITICAL
**Any `spawn`/`execFile`/`exec` call WITHOUT `windowsHide: true` flashes a cmd.exe window.**
Use wrappers from `src/util/process.ts` which enforce `windowsHide: true` automatically.

---

## KEY PATTERNS (opencode package)

### Namespace Modules
Code organized as TypeScript `namespace` (not classes):
```ts
export namespace Session {
  export const Info = z.object({ ... })
  export type Info = z.infer<typeof Info>
  export const create = fn(z.object({ ... }), async (input) => { ... })
}
```

### Instance.state(init, dispose?)
Per-project lazy singleton tied to `AsyncLocalStorage`

### fn(schema, callback)
Wraps functions with Zod input validation

### Tool.define(id, init)
All tools follow `{ description, parameters, execute }` pattern

### BusEvent.define(type, schema) + Bus.publish()
In-process pub/sub event system

### Log.create({ service: "name" })
Logging pattern

---

## KILOCLAW AGENCY/ORCHESTRATION SYSTEM

The **Kiloclaw** system routes user intent through a hierarchical stack:

```
Intent → Orchestrator → Router (L0-L3) → Agencies → Agents → Skills → Tools
```

### Architecture Components

- **Orchestrator**: `packages/opencode/src/kiloclaw/orchestrator.ts` — initial intent assignment
- **Router**: `packages/opencode/src/kiloclaw/agency/routing/pipeline.ts` — intent routing across L0-L3 layers
- **Registry**: 
  - `packages/opencode/src/kiloclaw/agency/registry/agency-registry.ts` — agency definitions
  - `packages/opencode/src/kiloclaw/agency/registry/agent-registry.ts` — agent definitions (FlexibleAgentRegistry)
  - `packages/opencode/src/kiloclaw/agency/registry/skill-registry.ts` — skill definitions
  - `packages/opencode/src/kiloclaw/agency/registry/chain-registry.ts` — skill chains
- **Policy Engine**: `packages/opencode/src/session/tool-policy.ts` — deny-by-default capability gates
- **Observability**: Correlation IDs + structured telemetry in `packages/opencode/src/kiloclaw/telemetry/routing.metrics.ts`

### Mandatory Implementation Guide

**For any new `agency` / `agent` / `skill` / `tool` implementation, follow:**
```
docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md
```

This guide is **mandatory reference** for:
- Architecture and component responsibility mapping
- Runtime policy enforcement (deny-by-default approach)
- Observability and correlation IDs
- Testing patterns
- Rollout procedures

---

## KILOCLAW AGENCIES

Agencies are domain-specific collections of agents, skills, and policies. Current agencies:

| Agency ID | Domain | Purpose | Wave | Policy Level |
|-----------|--------|---------|------|--------------|
| `agency-knowledge` | `knowledge` | Research, synthesis, web search, fact-checking | 1 | Standard |
| `agency-development` | `development` | Coding, review, refactoring, debugging, testing | 1 | Standard |
| `agency-nutrition` | `nutrition` | Food/nutrition analysis, meal planning, recipes | 2 | Standard |
| `agency-weather` | `weather` | Weather queries, forecasts, alerts | 2 | Standard |
| `agency-gworkspace` | `gworkspace` | Gmail, Calendar, Drive, Docs, Sheets (requires approval) | 3 | Approval-required |
| `agency-nba` | `nba` | NBA stats, betting odds, predictions (requires approval) | 3 | Approval-required |
| `agency-finance` | `finance` | Financial data, analysis, recommendations | 3 | Approval-required |

### Defining New Agencies

```ts
AgencyRegistry.registerAgency({
  id: "agency-legal",
  name: "Legal Agency",
  domain: "legal",
  policies: {
    allowedCapabilities: ["contract-analysis", "source_grounding"],
    deniedCapabilities: ["code-execution"],
    maxRetries: 2,
    requiresApproval: true,
    dataClassification: "confidential",
  },
  providers: ["tavily"],
  metadata: { wave: 3, description: "Legal research" },
})
```

---

## KILOCLAW AGENTS

Agents are role-based specialists with prompts, permissions, and skills. Each agent has:
- `id`: Unique identifier (e.g., `general-manager`)
- `name`: Display name
- `primaryAgency`: Primary domain assignment
- `secondaryAgencies`: Optional secondary domains
- `capabilities`: List of capabilities it can perform
- `skills`: List of skills it uses
- `prompt`: Detailed system prompt
- `permission`: Permission config (default allows read, search, web tools; denies writes by default)
- `mode`: `"primary"` (root agent) or `"subagent"` (called by other agents)
- `constraints`: Execution constraints (timeouts, concurrency)

### Available Agents

#### General-Purpose Agents

**general-manager** (mode: primary)
- Orchestrates complex multi-phase development tasks
- Dispatches specialized subagents (coder, debugger, reviewer, architect)
- Capabilities: task-decomposition, agent-coordination, workflow-orchestration, parallel-dispatch, phase-management

**researcher** (mode: subagent)
- Web search using Tavily, Brave, DuckDuckGo
- Academic research via PubMed, arXiv, Semantic Scholar
- Fact-checking and source verification
- Capabilities: search, synthesis, information_gathering, web-search, academic-research, fact-checking

**coder** (mode: subagent)
- Code generation, modification, debugging
- Test-Driven Development (TDD) methodology
- Refactoring and code quality
- Capabilities: coding, debugging, refactoring, code-generation, code-modification, bug-fixing

**debugger** (mode: subagent)
- Systematic root-cause analysis using Four-Phase method:
  1. Observe: Gather evidence, reproduce issue
  2. Hypothesize: Form testable hypotheses
  3. Investigate: Test hypotheses systematically
  4. Resolve: Implement and verify fix
- Capabilities: debugging, root-cause-analysis, troubleshooting

**planner** (mode: subagent)
- Task breakdown and roadmapping
- Implementation planning with dependencies
- Risk identification and effort estimation
- Capabilities: task-planning, code-planning, roadmapping

**code-reviewer** (mode: subagent)
- Code quality assurance
- Security and performance analysis
- Adherence to coding standards
- Capabilities: code-review, quality-assurance

**system-analyst** (mode: subagent)
- Requirements analysis and decomposition
- Incident triage and prioritization
- Problem decomposition into phases
- Capabilities: requirements-analysis, incident-triage, problem-analysis, task-decomposition

**architect** (mode: subagent)
- Technical design and architecture decisions
- Technology selection and evaluation
- ADR (Architecture Decision Records) creation
- Capabilities: technical-design, architecture-decisions, system-design, technology-selection, code-review

**qa** (mode: subagent)
- Test design and quality assurance
- Test execution and validation
- Bug reporting with reproducible steps
- Verification-before-completion discipline
- Capabilities: test-design, quality-assurance, test-execution, verification, bug-reporting

#### Domain-Specific Agents

**analyst** (Knowledge Agency)
- Data analysis and comparison
- Objective evaluation of options
- Capability: data-analysis, comparison, evaluation

**educator** (Knowledge Agency)
- Clear explanations and teaching
- Concept summarization
- Audience-adapted learning
- Capabilities: explanation, summarization, teaching

**nutritionist** (Nutrition Agency)
- Nutritional content analysis
- Dietary recommendations
- Meal planning
- Capabilities: nutrition-analysis, food-analysis, dietary-assessment

**weather-current** (Weather Agency)
- Current weather conditions
- Real-time weather data

**forecaster** (Weather Agency)
- Weather forecasts
- Trend analysis

**gworkspace-operator** (Google Workspace Agency)
- Gmail operations (search, read, draft, send)
- Calendar management (list, create, update)
- Google Drive operations (search, list, read, share)
- Google Docs/Sheets operations (read, update)
- Capabilities: gmail.*, calendar.*, drive.*, docs.*, sheets.*

---

## AGENT PERMISSIONS

### Permission Models

**Default Permissions** (read-focused agents like researcher, code-reviewer):
```
Allowed: read, grep, glob, list, question, webfetch, websearch, codesearch, codebase_search
Denied: write, edit, bash, git commands
External directories: ask
```

**Development Permissions** (agents that write code: coder, debugger, architect, qa):
```
Allowed: all tools
Denied: none
Special: .env files require "ask" approval
External directories: ask
```

**Google Workspace Permissions** (gworkspace-operator):
```
Allowed: all (including dynamic MCP tool IDs with google-workspace_* prefix)
External directories: ask
```

### Defining New Agent Permissions

```ts
const customPermissions = PermissionNext.fromConfig({
  "*": "deny",
  read: "allow",
  grep: "allow",
  websearch: "allow",
  write: "ask",
  bash: {
    "git *": "allow",
    "bun run": "allow",
    "*": "deny",
  },
  external_directory: { "*": "ask" },
})
```

---

## REGISTERING NEW AGENTS

```ts
FlexibleAgentRegistry.registerAgent({
  id: "contract-reviewer",
  name: "Contract Reviewer",
  primaryAgency: "agency-legal",
  secondaryAgencies: ["agency-knowledge"],
  capabilities: ["contract-analysis", "risk-assessment"],
  skills: ["contract-parse", "clause-risk-check"],
  constraints: { timeoutMs: 45_000, maxConcurrentTasks: 2 },
  version: "1.0.0",
  description: "Analyzes contracts and flags risks",
  prompt: "Follow policy runtime, cite evidence, avoid assumptions",
  permission: PermissionNext.fromConfig({ "*": "deny", read: "allow", webfetch: "allow" }),
  mode: "subagent",
})
```

---

## FORK MERGE STRATEGY

Kilo is a fork of opencode. Minimize upstream merge conflicts:

1. **Prefer `kilocode` directories** for Kilo-specific code (`packages/opencode/src/kiloclaw/`, `packages/kilo-gateway/`)
2. **Minimize changes to shared files** — keep diffs small and isolated
3. **Use `kilocode_change` markers** for modifications to upstream files:
   - Single-line: `const value = 42 // kilocode_change`
   - Multi-line: `// kilocode_change start` / `// kilocode_change end`
4. **Do NOT use markers** in paths already containing `kilocode` in the name (they're already Kilo-specific)

---

## COMMIT CONVENTIONS

Use [Conventional Commits](https://www.conventionalcommits.org/) with scopes:

**Scopes**: `vscode`, `cli`, `agent-manager`, `sdk`, `ui`, `i18n`, `kilo-docs`, `gateway`, `telemetry`, `desktop`

Omit scope when spanning multiple packages.

**Examples**:
```
feat(cli): add OAuth flow for Google Workspace
fix(vscode): resolve extension activation delay
docs: update agency implementation guide
refactor: improve permission routing
```

---

## TYPESCRIPT CONFIGURATION

Root `tsconfig.json` extends `@tsconfig/bun` with:
- **Path aliases**:
  - `@/*` → `./packages/opencode/src/*`
  - `@kilocode/*` → `./packages/*/src`
  - `@/kiloclaw/*` → `./packages/opencode/src/kiloclaw/*`
- **Project references**: Each package is a separate project
- **JSX**: Set to `preserve` (processed by Vite/esbuild per-package)

Run `bun run typecheck` from root to validate all packages at once.

---

## CLAUDE CODE SUB-AGENTS

Claude Code provides specialized sub-agents for parallel work:

### Available Sub-Agents

- **general-purpose**: Full capabilities across all tools; default choice for complex tasks
- **Explore** (`subagent_type: "Explore"`): Fast pattern matching and file discovery
  - Use for codebase exploration, finding files by patterns
  - Faster than main context for broad searches
- **Plan** (`subagent_type: "Plan"`): Design implementation strategies
  - Use when you need to plan multi-step implementations
  - Returns step-by-step plans and identifies critical files
- **claude-code-guide** (`subagent_type: "claude-code-guide"`): Questions about Claude Code features
  - Use for Claude Code CLI, IDE integrations, MCP servers

### When to Use Sub-Agents

- **Explore**: When searching files by patterns (e.g., "find all src/**/*.tsx") or answering "how do API endpoints work?"
- **Plan**: When a task requires architectural decisions before implementation
- **general-purpose**: For complex tasks spanning multiple files/concerns, research + implementation
- **claude-code-guide**: For Claude Code-specific questions

### Using Sub-Agents Effectively

Delegate when:
- You need to search broadly across the codebase without blocking main context
- The task is independent and can run in parallel
- You want a second opinion on approach/architecture
- You need specialized tool access (MCP, browser, headless)

**Do NOT over-delegate**: Simple directed searches should use Glob/Grep directly.

---

## SPECIAL CONSIDERATIONS

### Agency-Specific Development

When working within a specific agency domain:

1. **Check registry**: See what agents/skills are already registered in that agency
2. **Follow the guide**: Reference `docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md`
3. **Test in context**: Use agency bootstrap setup to test new agents
4. **Observe telemetry**: Check correlation IDs and metrics in logs

### opencode Package Details

- **Entry point**: `src/index.ts`
- **Session/tool lifecycle**: `src/session/`
- **Agency system**: `src/kiloclaw/`
- **Tests compile to**: `out/` (not `dist/`)

### kilo-vscode Extension Details

- **Entry point**: `src/extension.ts`
- **LSP server**: `src/server.ts`
- **Dev mode**: `bun run --cwd packages/kilo-vscode extension`
- Must test in actual VS Code, not just build

### SDK Regeneration

After changing server endpoints or adding new capabilities:
1. Run `./script/generate.ts`
2. Do NOT manually edit `packages/sdk/js/src/gen/` (auto-generated)
3. Commit generated changes separately

---

## TROUBLESHOOTING DEVELOPMENT

### Type Checking Issues
```bash
# If tsgo timeouts on large projects:
bun run typecheck --timeout 300000  # Increase timeout

# Or check specific package:
bun run --cwd packages/opencode typecheck
```

### Tests Not Running
```bash
# Ensure you're in the right package:
bun run --cwd packages/opencode test

# Filter by test name:
bun run --cwd packages/opencode test -- --grep "pattern"

# Run single file:
bun run --cwd packages/opencode test test/tool/tool.test.ts
```

### Extension Not Loading
```bash
# Build the extension first:
bun run --cwd packages/kilo-vscode compile

# Then launch with:
bun run --cwd packages/kilo-vscode extension

# Or from root:
bun run extension
```

### Process Spawning Issues on Windows
Ensure all spawned processes use `windowsHide: true`. If a cmd.exe window flashes, use wrappers from `src/util/process.ts`.

---

## ADDITIONAL RESOURCES

- **AGENTS.md**: Original source document for build commands, code style, patterns, testing
- **docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md**: Mandatory reference for new agency features
- **packages/opencode/AGENTS.md**: Per-package specific guidance
- **packages/opencode/test/fixture/fixture.ts**: Test fixture utilities
- **packages/opencode/src/kiloclaw/agency/**: Complete agency system implementation

---

## PARALLEL TOOL USAGE

**Always use parallel tools when applicable.** Bun and Turbo both support high concurrency:
- Typechecking multiple packages in parallel
- Running tests across multiple packages
- Searching/reading independent files
- Building independent artifacts

This is critical for efficiency in this large monorepo.

---

## WORKTREE CONTEXTS

If you're running in a git worktree:
- All changes must stay in your current working directory
- Never modify files in the main repo checkout
- The worktree is automatically cleaned up if you make no changes
- Use `ExitWorktree` to exit safely (keep or remove the worktree)

---

## 🚨 CRITICAL REMINDER: DOCUMENTATION RULE

**EVERY time you create a document:**
1. Use **`.md` format ONLY** (never `.txt`, `.log`, `.md.txt`, etc.)
2. Save **INSIDE `docs/` or its subdirectories ONLY**
3. Never save documentation at root level or outside `docs/`

This is **NON-NEGOTIABLE**. Violating this will cause:
- Documentation fragmentation
- Loss of audit trail
- Difficulty finding analysis/decisions
- Project organization breakdown

**If you're about to write a document**, STOP and confirm:
- ✅ Is it a `.md` file? 
- ✅ Is it inside `docs/` or a subdirectory?
- ❌ Do NOT proceed if either answer is no
