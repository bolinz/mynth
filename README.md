# mynth

**mynth** (Mind + Synth) — a synthetic thought network. An AI Agent collaboration system using **chain transfer + meta-layer intervention**.

Agents autonomously pass tasks along a chain, each deciding the next. A meta layer (Observer + Intervener) monitors for anomalies and intervenes automatically. Agents execute via real LLM calls (Anthropic/OpenAI) with retry, fallback, and circuit-breaking.

Built following the [agent-design](https://github.com/bolinz/agent-design.git) architecture.

## Quick start

```bash
pnpm install
pnpm run build

# Run a task (simulated — no API key needed)
pnpm --filter @mynth/cli exec mynth run "implement a login form"

# Run with LLM (requires API key)
export ANTHROPIC_API_KEY=sk-...   # or OPENAI_API_KEY=sk-...
pnpm --filter @mynth/cli exec mynth run "write a REST API"
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
  Orchestrator · Observer · Guard · Intervener · DegradationMonitor
                         ↓
    Agent A ──→ Agent B ──→ Agent C ──→ ...  (Chain transfer)
       │            │            │
       └── LLM (Anthropic/OpenAI) + ReAct Loop ──┘
                         ↓
            MessageBus (pub/sub + point-to-point)
                         ↓
   Memory (PrivateMemory · GlobalMemory · CheckpointManager)
                         ↓
               StateStore (LevelDB)
```

- **Chain transfer**: Orchestrator infers capabilities from task description (40+ keywords → 8 capability types). Each agent autonomously decides the next via `decideTransfer()`.
- **LLM integration**: Anthropic and OpenAI providers with retry, cross-provider fallback, and circuit-breaking. ReAct loop (Think-Act-Observe) replaces simulated work. BudgetTracker for token cost control.
- **Meta layer**: Observer monitors hop metrics and error rates. Intervener acts on anomalies — `warn`, `pause`, `replace`, `reroute`, `rollback`, `terminate`. DegradationMonitor tracks LLM/memory/messaging/agent-pool health with auto-recovery.
- **MessageBus**: Unified pub/sub (8 event topics) + point-to-point messaging, wiring all components.
- **Virtual SubAgent**: In-process child agents with pool management and `Promise.allSettled` parallel execution.
- **Persistence**: StateStore persists hop history, tasks, and agent configs to LevelDB, surviving restart. BaseAgent has PrivateMemory with L1/L2 tiers and time-decay forgetting.

## Packages

| Package | Description |
|---------|-------------|
| `@mynth/sdk` | Shared types + HTTP client |
| `@mynth/core` | Persistence, message-bus, vector, agent, scheduler, memory, meta, chain, engine, LLM |
| `@mynth/cli` | CLI + TUI + Web UI |
| `@mynth/examples` | Example applications |

## Development

```bash
pnpm install              # Install dependencies
pnpm run build            # Build all packages
pnpm test                 # 147 tests
pnpm test bench           # Performance benchmarks
pnpm run lint             # Biome check
```

## Benchmarks

| Metric | Result | Target |
|--------|--------|--------|
| Chain transfer (single hop) | 21ms | <100ms |
| Message queue throughput | 520K msg/s | >10K msg/s |
| Task scheduling | 6ms/1K tasks | <10ms |
| Vector search (10K × 128d) | 62ms | Phase 1 OK |

## Tech stack

- **Language**: TypeScript (ES2022)
- **Monorepo**: Turborepo + pnpm workspaces
- **Testing**: Vitest (unit + bench)
- **Linting**: Biome
- **Persistence**: LevelDB (`level` npm)
- **LLM**: Anthropic / OpenAI via fetch
- **TUI**: neo-blessed
- **Web UI**: Node.js HTTP + Server-Sent Events
- **CI**: GitHub Actions

## Design reference

Design docs are in `docs/agent-design/` (git submodule).

## License

MIT
