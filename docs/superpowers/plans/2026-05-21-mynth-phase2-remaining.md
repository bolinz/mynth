# Mynth Remaining Design Gaps — Phase 2 Development Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Current state:** 147 tests | 109 source files | v0.1.0 tagged. Phase 1 (core architecture) complete.

---

## Priority Summary

| Pri | Task | Effort | Impact |
|-----|------|--------|--------|
| P0 | CLI: init + logs + stop/pause/resume | M | 直接可用性 |
| P1 | Web UI: interactive controls + task detail | M | 可视化体验 |
| P2 | Zod config validation + hot reload | S | 工程健壮性 |
| P3 | MemoryGateway + Skills distillation | L | 架构完整性 |
| P4 | CapabilityRouter + BudgetTracker upgrade | M | LLM 使用质量 |
| P5 | Consensus + Deadlock + Verify | L | 多 Agent 协作 |

---

### Task 1 (P0): CLI Command Completeness

**Goal:** Add missing CLI commands for daily use.

**Commands to implement:**
- `mynth init` — interactive project scaffolding (prompts for project name, LLM provider)
- `mynth logs <id>` — view task log from persisted StateStore (hop history, timestamps)
- `mynth stop <id>` — cancel a running task via Scheduler
- `mynth pause <id>` / `mynth resume <id>` — pause/resume task
- `mynth rollback <id> --checkpoint <id>` — rollback to checkpoint
- `mynth checkpoints <id>` — list checkpoints for a task

**Files:**
- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/src/commands/logs.ts`
- Create: `packages/cli/src/commands/stop.ts`
- Modify: `packages/cli/src/index.ts` — register new commands

**Test plan:**
- `mynth init` prompts and writes config
- `mynth logs task_xxx` reads from StateStore
- `mynth stop task_xxx` cancels running task

---

### Task 2 (P1): Web UI Interactive Controls

**Goal:** Add interactive task controls and detailed views.

**Features:**
- **Pause/Resume buttons** — send pause/resume commands to engine
- **Rollback button** — show checkpoint list, allow rollback
- **Stop button** — cancel running task
- **Task detail panel** — show hop history with timestamps, partial results
- **Checkpoint viewer** — list and inspect checkpoints

**Server endpoints to add:**
- `POST /pause` — pause current task
- `POST /resume` — resume paused task
- `POST /rollback` — rollback to checkpoint
- `GET /checkpoints/:taskId` — list checkpoints

**Files:**
- Modify: `packages/cli/src/web/server.ts` — add endpoints
- Modify: `packages/cli/src/web/index.html` — add controls

---

### Task 3 (P2): Zod Config Validation

**Goal:** Runtime schema validation for engine configuration.

**Files:**
- Create: `packages/core/src/config/schema.ts` — Zod schemas for AgentConfig, LLMConfig, EngineConfig
- Create: `packages/core/src/config/ConfigManager.ts` — load/validate/merge with env override
- Modify: `packages/core/src/engine/CoreEngine.ts` — validate config on start
- Create: `packages/core/test/config/schema.test.ts`

**Schema:**
```typescript
export const EngineConfigSchema = z.object({
  dbPath: z.string(),
  agents: z.array(z.object({
    id: z.string(),
    name: z.string(),
    capabilities: z.array(z.object({
      type: z.enum(['reasoning','codegen','review','search','plan','memory','math','creative','critique','synthesis','coordination']),
      level: z.number().min(0).max(10),
      confidence: z.number().min(0).max(1),
    })),
  })),
  maxHops: z.number().min(1).max(100).default(10),
});
```

---

### Task 4 (P3): MemoryGateway

**Goal:** Single write entry point for GlobalMemory with validation and contribution tracking.

**Files:**
- Create: `packages/core/src/memory/MemoryGateway.ts`
- Create: `packages/core/test/memory/MemoryGateway.test.ts`

**Features:**
- Sole write interface — agents write through gateway, not directly
- Validation — format check, dedup detection
- Contribution tracking — record source agent and timestamp
- Skills trigger — when 50+ similar patterns detected, trigger distillation

---

### Task 5 (P4): CapabilityRouter + BudgetTracker Upgrade

**Goal:** Route LLM calls by capability type, add multi-level budgets.

**Files:**
- Create: `packages/core/src/llm/CapabilityRouter.ts`
- Modify: `packages/core/src/llm/BudgetTracker.ts` — add perGlobal/perUser limits

**CapabilityRouter:**
- Route by CapabilityType → provider name
- Learn from history (success rate → adjust weight)
- Per-agent routing config

**BudgetTracker upgrade:**
- `perAgentTask`: token limit per agent per task
- `perTask`: total limit per task
- `perUser`: daily/monthly limits
- `onExceed`: reject | downgrade | warn

---

### Task 6 (P5): Consensus + Conflict Resolution

**Goal:** Formal consensus tracking in chain transfer.

**Files:**
- Create: `packages/core/src/chain/Consensus.ts`
- Create: `packages/core/test/chain/Consensus.test.ts`

**Features:**
- `ConsensusInChain.update(partialResult)` — each hop updates consensus
- `ConsensusInChain.confirmFinal()` — last agent confirms
- Divergence recording — track when agents disagree
- Conflict resolution table (as defined in design)

---

## Remaining if time permits

| Item | Status |
|------|--------|
| Config hot reload (FSWatcher + Zod) | nice-to-have |
| `mynth visualize <id>` chain graph | nice-to-have |
| `mynth shell` interactive REPL mode | nice-to-have |
| PathPredictor for warm pool | nice-to-have |
| MetaAgentSelfHealing health loop | nice-to-have |
| Web UI Settings + New Task pages | nice-to-have |
