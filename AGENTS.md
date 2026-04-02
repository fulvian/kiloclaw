# AGENTS.md

Kilo CLI is an open source AI coding agent that generates code from natural language, automates tasks, and supports 500+ AI models.

- **ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE**
- The default branch is `main`
- Prefer automation: execute requested actions without confirmation unless blocked by missing info or safety/irreversibility
- You may be running in a git worktree. All changes must be in your current working directory — never modify files in the main repo checkout

## Build / Lint / Test Commands

### Root level

```bash
bun run dev              # Dev mode (runs opencode package)
bun run typecheck        # Typecheck all packages (uses tsgo, not tsc)
bun run extension        # Build + launch VS Code with extension in dev mode
```

### packages/opencode (core CLI)

```bash
bun run --cwd packages/opencode dev
bun run --cwd packages/opencode --conditions=browser src/index.ts    # Direct run
bun run --cwd packages/opencode typecheck    # tsgo --noEmit
bun run --cwd packages/opencode test         # All tests
bun run --cwd packages/opencode test test/tool/tool.test.ts  # Single test (from package dir)
bun run --cwd packages/opencode test test/scheduler.test.ts -- --grep "test name"  # Single test with grep
```

### packages/kilo-vscode (VS Code extension)

```bash
bun run --cwd packages/kilo-vscode compile       # Typecheck + lint + build
bun run --cwd packages/kilo-vscode watch         # Watch mode (esbuild + tsc)
bun run --cwd packages/kilo-vscode test          # Run tests
bun run --cwd packages/kilo-vscode lint          # ESLint on src/
bun run --cwd packages/kilo-vscode format        # Format before committing
bun run --cwd packages/kilo-vscode extension     # Build + launch VS Code dev mode
bun script/local-bin.ts                          # Build CLI binary to bin/kilo
```

### SDK regeneration

```bash
./script/generate.ts   # Regenerate packages/sdk/js/ after changing server endpoints
```

### Other packages

```bash
bun run --cwd packages/kilo-vscode knip              # Check unused exports
bun script/extract-source-links.ts                    # Update source-links.md after URL changes
bun run --cwd packages/kilo-vscode check-kilocode-change  # Verify no kilocode_change markers in wrong places
```

## Monorepo Structure

| Package                    | Name                       | Purpose                                     |
| -------------------------- | -------------------------- | ------------------------------------------- |
| `packages/opencode/`       | `@kilocode/cli`            | Core CLI — agents, tools, sessions          |
| `packages/sdk/js/`         | `@kilocode/sdk`            | Auto-generated SDK (do not edit `src/gen/`) |
| `packages/kilo-vscode/`    | `kilo-code`                | VS Code extension + Agent Manager           |
| `packages/kilo-gateway/`   | `@kilocode/kilo-gateway`   | Auth, provider routing                      |
| `packages/kilo-telemetry/` | `@kilocode/kilo-telemetry` | PostHog + OpenTelemetry                     |
| `packages/kilo-ui/`        | `@kilocode/kilo-ui`        | SolidJS component library                   |
| `packages/plugin/`         | `@kilocode/plugin`         | Plugin/tool interface definitions           |
| `packages/util/`           | `@opencode-ai/util`        | Shared utilities                            |

## Code Style Guidelines

### Naming — MANDATORY

- **Prefer single-word names**: `pid`, `cfg`, `err`, `opts`, `dir`, `root`, `child`, `state`, `timeout`
- Multi-word names only when a single word is ambiguous
- Do NOT introduce new camelCase compounds when a short single-word alternative exists
- Before finishing edits, review touched lines and shorten newly introduced identifiers

### Imports

- Use path aliases where configured: `@/*` maps to `./src/*`
- Prefer absolute imports via aliases over relative paths in deep files
- Named imports preferred: `import { Foo } from "bar"` not `import bar from "bar"`

### Types

- Avoid `any` type
- Rely on type inference; avoid explicit type annotations unless necessary for exports
- Use Zod schemas for input validation (see `fn()` pattern below)

### Control Flow

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

## Key Patterns (opencode package)

- **`namespace` modules**: Code organized as TypeScript namespaces, not classes
  ```ts
  export namespace Session {
    export const Info = z.object({ ... })
    export type Info = z.infer<typeof Info>
    export const create = fn(z.object({ ... }), async (input) => { ... })
  }
  ```
- **`Instance.state(init, dispose?)`**: Per-project lazy singleton tied to AsyncLocalStorage
- **`fn(schema, callback)`**: Wraps functions with Zod input validation
- **`Tool.define(id, init)`**: All tools follow `{ description, parameters, execute }` pattern
- **`BusEvent.define(type, schema)` + `Bus.publish()`**: In-process pub/sub
- **`Log.create({ service: "name" })`**: Logging pattern

## Windows Process Spawning

Any `spawn`/`execFile`/`exec` call without `windowsHide: true` flashes a cmd.exe window. Use wrappers from `src/util/process.ts` which enforce `windowsHide: true` automatically.

## Testing

- **No mocks** — test actual implementation, not duplicated logic
- Use the `tmpdir` fixture from `packages/opencode/test/fixture/fixture.ts` for temporary directories
- Tests compile to `out/` (not `dist/`)

## Commit Conventions

[Conventional Commits](https://www.conventionalcommits.org/) with scopes: `vscode`, `cli`, `agent-manager`, `sdk`, `ui`, `i18n`, `kilo-docs`, `gateway`, `telemetry`, `desktop`. Omit scope when spanning multiple packages.

## Fork Merge Process

Kilo CLI is a fork of [opencode](https://github.com/anomalyco/opencode). Minimize conflicts by:

1. **Prefer `kilocode` directories** for Kilo-specific code (`packages/opencode/src/kilocode/`, `packages/kilo-gateway/`)
2. **Minimize changes to shared files** — keep diff small and isolated
3. **Use `kilocode_change` markers** for Kilo-specific modifications to upstream files
4. **Do NOT use markers** in paths containing `kilocode` in the name (already Kilo-specific)

```ts
// kilocode_change - single line
const value = 42 // kilocode_change

// kilocode_change start / kilocode_change end - multi-line
// kilocode_change start
const foo = 1
const bar = 2
// kilocode_change end
```
