# mynth

**mynth** (Mind + Synth) — a synthetic thought network. An AI Agent collaboration system using **chain transfer + meta-layer intervention**.

Agents autonomously pass tasks along a chain, each deciding the next. A meta layer (Observer + Intervener) monitors for anomalies and intervenes automatically.

Built following the [agent-design](https://github.com/bolinz/agent-design.git) architecture.

## Quick start

```bash
# Install
pnpm install

# Run a task
pnpm --filter @mynth/examples simple

# Or use the CLI
pnpm --filter @mynth/cli exec mynth run "implement a login form"
```

## CLI

```bash
mynth run "task"          # Run chain transfer
mynth status              # Agent pool status
mynth list                # List tasks
mynth history             # Persisted task history
mynth tui                 # Terminal UI
mynth ui                  # Web UI (http://localhost:3000)
```

## Architecture

```
                    Meta Layer
  Orchestrator · Observer · Guard · Intervener
                         ↓
    Agent A ──→ Agent B ──→ Agent C ──→ ...  (Chain transfer)
                         ↓
               EventBus + MessageBus
                         ↓
               StateStore (LevelDB)
```

- **Chain transfer**: Orchestrator infers capabilities from task description (40+ keywords, 8 capability types). Each agent autonomously decides the next via `decideTransfer()`.
- **Meta layer**: Observer monitors hop metrics. Intervener acts on anomalies — `warn`, `pause`, `replace`, `reroute`, `rollback`, `terminate`.
- **MessageBus**: Unified pub/sub + point-to-point messaging, wiring all components.
- **Virtual SubAgent**: In-process child agents with pool management and parallel execution.
- **Persistence**: StateStore persists hop history, tasks, and agent configs to LevelDB, surviving restart.

## Packages

| Package | Description |
|---------|-------------|
| `@mynth/sdk` | Shared types + HTTP client |
| `@mynth/core` | All subsystems: persistence, message-bus, vector, agent, scheduler, memory, meta, chain, engine |
| `@mynth/cli` | CLI + TUI + Web UI |
| `@mynth/examples` | Example applications |

## Development

```bash
pnpm install              # Install dependencies
pnpm run build            # Build all packages
pnpm test                 # Run tests
pnpm run lint             # Check code style
pnpm run lint:fix         # Auto-fix code style
```

## Tech stack

- **Language**: TypeScript (ES2022)
- **Monorepo**: Turborepo + pnpm workspaces
- **Testing**: Vitest
- **Linting**: Biome (no ESLint/Prettier)
- **Persistence**: LevelDB via `level` npm package
- **TUI**: neo-blessed
- **Web UI**: Node.js HTTP + Server-Sent Events (zero framework deps)

## Design reference

Design docs are in `docs/agent-design/` (git submodule). Key documents:

- `docs/agent-design/docs/architecture/overview.md`
- `docs/agent-design/docs/architecture/agent-model.md`
- `docs/agent-design/docs/architecture/collaboration.md`

## License

MIT
