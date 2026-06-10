# AGENTS.md — mynth

Implements the design from [agent-design](https://github.com/bolinz/agent-design.git). An AI Agent collaboration system using **chain transfer + meta-layer intervention**.

## Design reference

Design docs are in `docs/agent-design/` (git submodule).

## Tech stack

- **Language/Runtime**: TypeScript, Node.js
- **Monorepo**: Turborepo + pnpm workspaces
- **Testing**: Vitest (184 tests, 35 test files, + bench)
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
pnpm test                 # Vitest (184 tests)
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
main             稳定发布线，始终可部署
  └── feat/*     新功能    → PR → main（合并后删除远端分支）
  └── fix/*      修复      → PR → main（合并后删除远端分支）
  └── refactor/* 重构      → PR → main
  └── docs/*     文档      → 可直接提交 main
```

**Commit 格式**: `type(scope): description` — 如 `feat(core): add chain transfer manager`

**清理**: 合并后删除远端分支 (`git push origin --delete <branch>`)

## Release 流程

```
1. pnpm version minor|patch   # bump version + git tag
2. 更新 CHANGELOG.md（按 keepachangelog 格式）
3. git push && git push --tags
4. CI Release workflow 自动: GitHub Release
```

已有 workflow: `.github/workflows/release.yml` — tag 推送触发，自动构建测试 + 生成 release notes

**版本**: `v0.y.z` — 功能累积后 `minor`，hotfix 用 `patch`

## PR 规范

- 所有 feat/fix/refactor 必须通过 PR 合入 main
- 使用 `.github/PULL_REQUEST_TEMPLATE.md`

**Submodule 更新**: `cd docs/agent-design && git pull && cd ../.. && git add docs/agent-design && git commit -m "chore: update agent-design submodule"`

## Testing

184 tests across 35 files. Run `pnpm test`.

## Key constraints

- No external deps for message queue / vector DB (self-built)
- Chinese terminology in design docs: Orchestrator=编排者, Observer=观察者, Guard=权限管理者, Intervener=干预者
- Agent capabilities: reasoning, codegen, review, search, plan, memory, math, creative, critique, synthesis, coordination
