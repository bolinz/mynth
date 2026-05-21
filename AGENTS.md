# AGENTS.md — mynth

Implements the design from [agent-design](https://github.com/bolinz/agent-design.git). An AI Agent collaboration system using **chain transfer + meta-layer intervention**.

## Design reference

Design docs are in `docs/agent-design/` (git submodule).

## Tech stack

- **Language/Runtime**: TypeScript, Node.js
- **Monorepo**: Turborepo + pnpm workspaces
- **Testing**: Vitest
- **Lint/Format**: Biome
- **Persistence**: LevelDB (`level` npm), self-built MemoryQueue + in-memory vectors

## Project structure

```
docs/agent-design/    — design docs (submodule)
packages/
├── sdk/              — shared types + HttpClient
├── core/             — all subsystems (persistence, message-bus, vector,
│                       agent, scheduler, memory, meta, chain, engine)
├── cli/              — mynth CLI (run/status/list/history/tui/ui)
└── examples/         — simple-agent, collaboration
```

## Commands

```bash
pnpm install              # Install
pnpm run build            # Turborepo build all
pnpm test                 # Vitest
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
- **Meta layer**: Observer monitors hops → Intervener acts on anomalies (warn/pause/replace/reroute/rollback/terminate)
- **EventBus**: Pub/sub event system, 8 topics, wired into Agent/ChainTransfer/CoreEngine
- **Virtual SubAgent**: `SubAgentPool` manages in-process child agents, `executeParallel()` via `Promise.allSettled`
- **Persistence**: StateStore saves hops/tasks/agents to LevelDB, survives restart
- **Orchestrator**: 40+ keywords → 8 capability types, always includes reasoning

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

106 tests across 17 files. Run `pnpm test`.

## Key constraints

- No external deps for message queue / vector DB (self-built)
- Chinese terminology in design docs: Orchestrator=编排者, Observer=观察者, Guard=权限管理者, Intervener=干预者
- Agent capabilities: reasoning, codegen, review, search, plan, memory, math, creative, critique, synthesis, coordination
