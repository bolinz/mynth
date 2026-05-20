# AGENTS.md — mynth

Implements the design from https://github.com/bolinz/agent-design.git. An AI Agent collaboration system using **chain transfer + meta-layer intervention**.

## Design reference

Design docs are in `docs/agent-design/` (git submodule).
Key docs:
- `docs/agent-design/docs/architecture/overview.md` — architecture overview
- `docs/agent-design/docs/architecture/agent-model.md` — agent model, interfaces
- `docs/agent-design/docs/architecture/collaboration.md` — chain transfer protocol
- `docs/agent-design/docs/architecture/single-process-architecture.md` — local dev architecture
- `docs/agent-design/docs/architecture/tech-stack.md` — tech stack, project structure, implementation order

## Tech stack (from design docs)

- **Language/Runtime**: TypeScript, Node.js
- **Monorepo**: Turborepo + pnpm workspaces
- **Testing**: Vitest (unit + integration + bench), Playwright (E2E)
- **Lint/Format**: Biome (no ESLint/Prettier)
- **Persistence**: LevelDB (in-proc), MemoryQueue (self-built)
- **Vector store**: In-memory + LevelDB, brute-force cosine search (<10K docs)
- **Config validation**: Zod
- **Logging**: Pino

## Project structure (planned)

```
packages/
├── core/         — agent framework, message bus, persistence, vector, scheduler, memory, meta layer
├── sdk/          — client SDK, shared types
├── cli/          — CLI + TUI (agent run, status, logs, visualize)
└── examples/     — simple-agent, collaboration
```

## Implementation order

Follow this dependency order:
1. `packages/sdk/types` — base types (agent, task, message interfaces)
2. `packages/core/persistence` — LevelDB adapter
3. `packages/core/message-bus` — MemoryQueue + persistence
4. `packages/core/vector` — VectorStore + simple ANN
5. `packages/core/agent` — Agent base class, state machine, lifecycle
6. `packages/core/agent` — AgentPool (pooling, create, destroy)
7. `packages/core/scheduler` — task queue, priority, scheduling
8. `packages/core/memory` — GlobalMemory, Checkpoint
9. `packages/core/meta` — Orchestrator, Observer, Guard, Intervener
10. `packages/examples` — simple example, collaboration example

## Architecture highlights

- **Chain transfer**: Orchestrator initializes the chain, then each agent autonomously decides the next. No central coordinator during execution.
- **Meta layer**: Observer monitors chain state → Intervener acts on anomalies (replace/rollback/reroute/terminate).
- **Virtual SubAgent**: Parent agent creates in-process subagents for parallel execution, reducing IPC overhead.
- **Memory**: Agent private memory (L1 in-proc → L2 LevelDB → L3 Memory Gateway backup). GlobalMemory via Memory Gateway (single write entry, Observer validates).
- **Deployment**: Single process (local dev) or multi-process (Entry → Orchestrator, Memory Gateway, Guard, Intervener, APM → Physical Agents).

## Commands (from design docs)

```bash
# Monorepo
pnpm install
pnpm run build          # Turborepo build all packages
pnpm run dev            # Dev mode with Turborepo
pnpm test               # Vitest
pnpm run lint           # Biome

# CLI (packages/cli)
agent init              # Initialize project
agent run "task"        # Run task
agent status            # System status
agent list              # List tasks
agent logs <id>         # View logs
agent tui               # Launch TUI interface
agent ui                # Launch Web UI (http://localhost:3000)
```

## Testing

- Unit tests: `**/*.test.ts` (Vitest)
- Integration tests: `**/*.integration.test.ts`
- Coverage: v8 provider, threshold 80% branches / 85% lines
- Performance bench: Vitest bench (chain transfer <100ms/hop, message bus >10K msg/s)
- Agent state transitions are a high-value unit test target

## Important constraints

- Do NOT add external deps for message queue / vector DB / cache (self-built: MemoryQueue + LevelDB + in-memory vectors)
- The design is documented in Chinese — keep key terminology consistent (Orchestrator 编排者, Observer 观察者, Guard 权限管理者, Intervener 干预者)
- Agent capabilities: reasoning, codegen, review, search, plan, memory, math, creative, critique, synthesis, coordination
