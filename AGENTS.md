# AGENTS.md — mynth

Implements the design from [agent-design](https://github.com/bolinz/agent-design.git). An AI Agent collaboration system using **chain transfer + meta-layer intervention**.

## Design reference

Design docs are in `docs/agent-design/` (git submodule).

## Tech stack

- **Language/Runtime**: TypeScript, Node.js
- **Monorepo**: Turborepo + pnpm workspaces
- **Testing**: Vitest (147 tests, 19 test files, + bench)
- **Lint/Format**: Biome
- **Persistence**: LevelDB (`level` npm), self-built MemoryQueue + in-memory vectors
- **CI**: GitHub Actions (build + test + lint on push/PR to main)

## Project structure

```
docs/agent-design/    — design docs (submodule)
packages/
├── sdk/              — shared types + HttpClient
├── core/             — all subsystems (persistence, message-bus, vector,
│                       agent, scheduler, memory, meta, chain, engine, llm, prompt)
├── cli/              — mynth CLI (run/status/list/history/tui/ui)
└── examples/         — simple-agent, collaboration
```

## Commands

```bash
pnpm install              # Install
pnpm run build            # Turborepo build all
pnpm test                 # Vitest (147 tests)
pnpm run lint             # Biome check

mynth run "task"          # Run chain transfer
mynth status              # Agent pool status
mynth list                # List tasks
mynth history             # Persisted task history
mynth tui                 # Terminal UI
mynth ui                  # Web UI (http://localhost:3000)
```

## Architecture

- **Chain transfer**: Orchestrator infers capabilities from task → ChainTransferManager runs autonomous agent chain → each agent decides next via `decideTransfer()`
- **Meta layer**: Observer monitors hops → Intervener acts on anomalies (warn/pause/replace/reroute/rollback/terminate) → DegradationMonitor tracks health (llm/memory/messaging/agent_pool)
- **LLM**: AnthropicProvider + OpenAIProvider → RetryProvider → FallbackProvider → CircuitBreaker. ReActLoop (Think-Act-Observe) for agent execution. BudgetTracker for token cost control.
- **EventBus**: Pub/sub event system, 8 topics, wrapped into MessageBus with MemoryQueue point-to-point
- **Virtual SubAgent**: `SubAgentPool` manages in-process child agents, `executeParallel()` via `Promise.allSettled`
- **Persistence**: StateStore saves hops/tasks/agents to LevelDB, survives restart. BaseAgent has PrivateMemory with L1/L2 tiers
- **Orchestrator**: 40+ keywords → 8 capability types, always includes reasoning
- **Graceful shutdown**: Drain mode, waits for running tasks with timeout before closing DB
- **Warm pool**: Three-tier (hot/warm/cold) agent pool with prefer-hot acquire and idle eviction

## Git workflow

```
main (稳定)
  └── feat/*     新功能    → PR merge 回 main
  └── fix/*      修复      → PR merge 回 main
  └── refactor/* 重构      → PR merge 回 main
  └── docs/*     文档      → 可直接提交 main
```

**Commit 格式**: `type(scope): description` — 如 `feat(core): add chain transfer manager`

**版本**: milestone 后 `git tag v0.y.z`

**Submodule 更新**: `cd docs/agent-design && git pull && cd ../.. && git add docs/agent-design && git commit -m "chore: update agent-design submodule"`

## Testing

147 tests across 19 files. Run `pnpm test`.

## Key constraints

- No external deps for message queue / vector DB (self-built)
- Chinese terminology in design docs: Orchestrator=编排者, Observer=观察者, Guard=权限管理者, Intervener=干预者
- Agent capabilities: reasoning, codegen, review, search, plan, memory, math, creative, critique, synthesis, coordination
