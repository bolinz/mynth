# mynth

**mynth** (Mind + Synth) — a synthetic thought network. An AI Agent collaboration system using **chain transfer + meta-layer intervention** with a **hierarchical task tree**.

Agents autonomously pass tasks along a chain, each deciding the next. A meta layer monitors for anomalies and intervenes automatically. Tasks are organized in a Mission → Quest → Task tree with progress tracking, interrupt/resume, and deviation detection. Agents execute via real LLM calls (Anthropic/OpenAI) with retry, fallback, and circuit-breaking.

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
mynth tui                 # Terminal UI (press t for tree panel)
mynth ui                  # Web UI (http://localhost:3000, /tree for task tree)
mynth trace <taskId>      # Distributed tracing
mynth approve <taskId>    # HITL approval
```

## Architecture

```
                    Meta Layer
  Orchestrator · Observer · Guard · Intervener · DegradationMonitor · HITLManager
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
                         ↓
            Task Tree (Mission/Quest/Task/Urgent/SideQuest)
```

- **Chain transfer**: Orchestrator infers capabilities from task description (40+ keywords → 8 capability types). Each agent autonomously decides the next via `decideTransfer()`.
- **LLM integration**: Anthropic and OpenAI providers with retry, cross-provider fallback, and circuit-breaking. ReAct loop (Think-Act-Observe) replaces simulated work. BudgetTracker for token cost control.
- **Meta layer**: Observer monitors hop metrics and error rates. Intervener acts on anomalies — `warn`, `pause`, `replace`, `reroute`, `rollback`, `terminate`. DegradationMonitor tracks LLM/memory/messaging/agent-pool health with auto-recovery. Guard enforces permissions. HITLManager supports human-in-the-loop approval workflows.
- **Task tree**: Hierarchical task decomposition with Mission/Quest/Task/Urgent/SideQuest types. Zero-cost progress (leaf = -1, parent = child ratio). Interrupt/resume with context snapshot. Deviation detection via Jaccard similarity on inferred capabilities.
- **MessageBus**: Unified pub/sub (8 event topics) + point-to-point messaging, wiring all components.
- **Virtual SubAgent**: In-process child agents with pool management and `Promise.allSettled` parallel execution.
- **Persistence**: StateStore persists hop history, tasks, and agent configs to LevelDB, surviving restart. BaseAgent has PrivateMemory with L1/L2/L3 tiers (L3 backup to GlobalMemory), time-decay forgetting, and WAL for crash recovery.
- **Multi-tenant**: TenantContext prefixes all StateStore keys for full data isolation.
- **Interaction protocol**: 7 built-in renderers (markdown, table, cards, diff, flowchart, chart, raw_html) for agent responses. InteractionManager for structured agent↔user dialogs.
- **Distributed tracing**: Tracer with span/parent spans, CLI trace command for hop-level inspection.
- **Resilience**: Backpressure in MessageBus, deadlock detection in Observer, ConfigManager validation/snapshots, GracefulShutdown with drain mode.
- **Warm pool**: Three-tier (hot/warm/cold) agent pool with prefer-hot acquire and idle eviction.

## Packages

| Package | Description |
|---------|-------------|
| `@mynth/sdk` | Shared types + HTTP client |
| `@mynth/core` | Persistence, message-bus, vector, agent, scheduler, memory, meta, chain, engine, LLM, renderers |
| `@mynth/cli` | CLI + TUI + Web UI |
| `@mynth/examples` | Example applications |

## Development

```bash
pnpm install              # Install dependencies
pnpm run build            # Build all packages
pnpm test                 # 282 tests (unit + integration)
pnpm bench                # Performance benchmarks (4 bench suites)
pnpm run lint             # Biome check
```

## Benchmarks

| Metric | Result | Target |
|--------|--------|--------|
| Chain transfer (single hop) | 21ms | <100ms |
| Message queue throughput | 520K msg/s | >10K msg/s |
| Task scheduling | 6ms/1K tasks | <10ms |
| Vector search (10K × 128d) | 62ms | Phase 1 OK |

## Testing

| Layer | Count | Scope |
|-------|-------|-------|
| Unit tests | 272 | Per-module with real object composition |
| Integration tests | 10 | Cross-component flows (engine lifecycle, memory consistency, multi-tenant) |
| Benchmarks | 4 | Key path performance (chain, queue, scheduler, vector) |

## Tech stack

- **Language**: TypeScript (ES2022)
- **Monorepo**: Turborepo + pnpm workspaces
- **Testing**: Vitest (unit + integration + bench)
- **Linting**: Biome
- **Persistence**: LevelDB (`level` npm)
- **LLM**: Anthropic / OpenAI via fetch
- **TUI**: neo-blessed
- **Web UI**: Node.js HTTP + Server-Sent Events
- **CI**: GitHub Actions (build + test + lint + coverage)

## Design reference

Design docs are in `docs/agent-design/` (git submodule).

## License

MIT
