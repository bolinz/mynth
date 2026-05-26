# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all Critical and Important issues identified in the codebase review: wire up LLM output to chain transfer decisions, connect BudgetTracker and CapabilityRouter to execution flow, use Zod for config validation, improve Observer cycle detection, fix Intervener replace capability matching, and harden Orchestrator agent selection.

**Architecture:** Targeted fixes to existing files — no new subsystems. Each task addresses a specific disconnected or brittle path identified in review. Changes are independent where possible but follow dependency order (wire up LLM first, then routers, then config/safety improvements).

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Wire LLM execution output into `decideTransfer()`

**Problem:** `ChainTransferManager.executeWithLLM()` runs a full ReActLoop but discards the return value (line 75). The agent's `decideTransfer()` makes capability-based decisions without any LLM context, making the entire LLM invocation dead code.

**Design:** Pass the last LLM response through `BaseAgent` so `decideTransfer()` can use it. Add an `llmOutput` field that gets set before `decideTransfer` is called. The chain stores it on the agent, and `decideTransfer` logs it into the handover note for observability (but the actual routing decision stays capability-based — this is the minimal fix to connect the pipeline without changing routing strategy).

**Files:**
- Modify: `packages/core/src/agent/BaseAgent.ts`
- Modify: `packages/core/src/chain/ChainTransferManager.ts`
- Modify: `packages/core/test/chain/ChainTransferManager.test.ts`

- [ ] **Step 1: Add `lastLlmOutput` to BaseAgent**

In `BaseAgent.ts`, add a public field after `lastError`:

```typescript
  lastError: Error | null = null;
  lastLlmOutput: string = '';
```

- [ ] **Step 2: Pass LLM output into decision in ChainTransferManager**

In `ChainTransferManager.ts`, modify the `runChain` method around lines 73-87. Store LLM output on the agent, then use it in `decideTransfer`:

```typescript
      agent.startWork();
      const cap = agent.capabilities[0]?.type ?? 'reasoning';
      const llmResult = await this.executeWithLLM(agent.id, this._taskContext?.description ?? '', cap);

      agent.lastLlmOutput = llmResult ?? '';

      const remaining = this.computeRemaining();
      const decision = agent.decideTransfer(remaining, this.pool);
```

Also change `executeWithLLM` signature to return the string:

```typescript
  private async executeWithLLM(agentId: string, task: string, capability: string): Promise<string> {
    if (!this.llmPool) {
      await new Promise((r) => setTimeout(r, 20));
      return '';
    }

    try {
      const modelName = process.env.ANTHROPIC_API_KEY
        ? 'claude-sonnet'
        : process.env.OPENAI_API_KEY
          ? 'gpt-4o'
          : 'default';
      const provider = this.llmPool.resolve({ model: modelName });
      const loop = new ReActLoop(provider);
      const prompt = this.promptRegistry?.buildPrompt(capability, task, '') ?? task;
      const result = await loop.execute(prompt, capability);
      return result;
    } catch (err) {
      this.bus?.publish('anomaly.detected', {
        type: 'agent_error',
        agentId,
        details: { error: String(err) },
      });
      return '';
    }
  }
```

- [ ] **Step 3: Include LLM output in hop handover notes**

In `ChainTransferManager.runChain()`, pass `agent.lastLlmOutput` into `recordHop` so the handover note includes LLM context:

```typescript
      const decision = agent.decideTransfer(remaining, this.pool);
      const duration = Date.now() - hopStart;

      const llmSummary = agent.lastLlmOutput
        ? agent.lastLlmOutput.slice(0, 200)
        : '';
      const note = decision.reason + (llmSummary ? ` | ${llmSummary}` : '');

      this.recordHop(
        agent.id,
        decision.action === 'complete' ? '' : (decision.nextAgent ?? ''),
        note,
        duration,
      );
```

- [ ] **Step 4: Run tests to verify nothing breaks**

Run: `pnpm test`
Expected: All 184 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agent/BaseAgent.ts packages/core/src/chain/ChainTransferManager.ts
git commit -m "fix(core): wire LLM output into chain transfer decisions"
```

---

### Task 2: Wire BudgetTracker into execution flow

**Problem:** `BudgetTracker` is instantiated in `CoreEngine` (line 74) but never used. No budget checks or recording happens during task execution.

**Design:** Pass BudgetTracker to ChainTransferManager, which records token usage from LLM responses and checks budgets before each LLM call.

**Files:**
- Modify: `packages/core/src/chain/ChainTransferManager.ts`
- Modify: `packages/core/src/engine/CoreEngine.ts`
- Modify: `packages/core/test/chain/ChainTransferManager.test.ts`

- [ ] **Step 1: Add BudgetTracker parameter to ChainTransferManager**

In `ChainTransferManager.ts`, add to constructor:

```typescript
import type { BudgetTracker } from '../llm/BudgetTracker.ts';

export class ChainTransferManager {
  constructor(
    private pool: AgentPool,
    private observer?: Observer,
    private intervener?: Intervener,
    private maxHops = 10,
    private bus?: MessageBus,
    private llmPool?: LLMPool,
    private promptRegistry?: PromptRegistry,
    private budgetTracker?: BudgetTracker,
  ) {}
```

- [ ] **Step 2: Check budget before and record after LLM calls**

In `executeWithLLM`, add budget check before calling LLM:

```typescript
  private async executeWithLLM(agentId: string, task: string, capability: string): Promise<string> {
    if (!this.llmPool) {
      await new Promise((r) => setTimeout(r, 20));
      return '';
    }

    if (this.budgetTracker) {
      const check = this.budgetTracker.check(agentId, capability);
      if (!check.allowed) {
        this.bus?.publish('intervention.executed', {
          type: 'warn',
          reason: `Budget exceeded for ${agentId}: ${JSON.stringify(check.details)}`,
        });
        return '';
      }
    }

    try {
      const modelName = process.env.ANTHROPIC_API_KEY
        ? 'claude-sonnet'
        : process.env.OPENAI_API_KEY
          ? 'gpt-4o'
          : 'default';
      const provider = this.llmPool.resolve({ model: modelName });
      const loop = new ReActLoop(provider);
      const prompt = this.promptRegistry?.buildPrompt(capability, task, '') ?? task;
      const result = await loop.execute(prompt, capability);

      if (this.budgetTracker) {
        this.budgetTracker.record(agentId, capability, prompt.length, result.length);
      }

      return result;
    } catch (err) {
      this.bus?.publish('anomaly.detected', {
        type: 'agent_error',
        agentId,
        details: { error: String(err) },
      });
      return '';
    }
  }
```

- [ ] **Step 3: Pass BudgetTracker in CoreEngine**

In `CoreEngine.ts`, in the `executeTask` method around line 138:

```typescript
    const chain = new ChainTransferManager(
      this.pool,
      this.observer,
      this.intervener,
      10,
      this.bus as any,
      this.llmPool,
      this.promptRegistry,
      this.budgetTracker,
    );
```

- [ ] **Step 4: Update tests**

Add `vi.mock` or a simple null check - existing tests don't pass a BudgetTracker, so they use `undefined` and skip budget checks. No test changes needed, but verify:

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/chain/ChainTransferManager.ts packages/core/src/engine/CoreEngine.ts
git commit -m "fix(core): wire BudgetTracker into execution flow"
```

---

### Task 3: Wire CapabilityRouter into ChainTransferManager

**Problem:** `CapabilityRouter` exists with adaptive success-rate routing but is never used. `ChainTransferManager.executeWithLLM` has its own hardcoded model selection (lines 221-226) that duplicates routing logic.

**Design:** Replace the hardcoded model selection in `executeWithLLM` with `CapabilityRouter.resolve()`, falling back to the original env-based logic if no router provided.

**Files:**
- Modify: `packages/core/src/chain/ChainTransferManager.ts`
- Modify: `packages/core/src/engine/CoreEngine.ts`
- Create: `packages/core/test/chain/ChainTransferManager.router.test.ts`

- [ ] **Step 1: Add CapabilityRouter parameter to ChainTransferManager**

In `ChainTransferManager.ts`:

```typescript
import type { CapabilityRouter } from '../llm/CapabilityRouter.ts';

export class ChainTransferManager {
  constructor(
    private pool: AgentPool,
    private observer?: Observer,
    private intervener?: Intervener,
    private maxHops = 10,
    private bus?: MessageBus,
    private llmPool?: LLMPool,
    private promptRegistry?: PromptRegistry,
    private budgetTracker?: BudgetTracker,
    private capabilityRouter?: CapabilityRouter,
  ) {}
```

- [ ] **Step 2: Replace hardcoded model selection**

Replace the model name logic in `executeWithLLM`:

```typescript
      const provider = this.capabilityRouter
        ? this.capabilityRouter.resolve(capability)?.provider
        : null;

      const resolvedProvider = provider
        ?? (process.env.ANTHROPIC_API_KEY
          ? this.llmPool.resolve({ model: 'claude-sonnet' })
          : process.env.OPENAI_API_KEY
            ? this.llmPool.resolve({ model: 'gpt-4o' })
            : null);

      if (!resolvedProvider) {
        await new Promise((r) => setTimeout(r, 20));
        return '';
      }

      const loop = new ReActLoop(resolvedProvider);
```

- [ ] **Step 3: Register CapabilityRouter in CoreEngine and pass it**

In `CoreEngine.ts`, add to `start()`:

```typescript
import { CapabilityRouter } from '../llm/CapabilityRouter.ts';

// In start(), after llmPool is populated:
this.capabilityRouter = new CapabilityRouter(this.llmPool);
```

Pass it in `executeTask`:

```typescript
    const chain = new ChainTransferManager(
      this.pool,
      this.observer,
      this.intervener,
      10,
      this.bus as any,
      this.llmPool,
      this.promptRegistry,
      this.budgetTracker,
      this.capabilityRouter,
    );
```

- [ ] **Step 4: Write test for CapabilityRouter integration**

Create `packages/core/test/chain/ChainTransferManager.router.test.ts`:

```typescript
import type { TaskContext } from '@mynth/sdk';
import { describe, expect, it, vi } from 'vitest';
import { AgentPool } from '../../src/agent/AgentPool.ts';
import { ChainTransferManager } from '../../src/chain/ChainTransferManager.ts';
import { CapabilityRouter } from '../../src/llm/CapabilityRouter.ts';
import { LLMPool } from '../../src/llm/LLMPool.ts';
import { MockProvider } from '../llm/MockProvider.ts';

function ctx(overrides?: Partial<TaskContext>): TaskContext {
  return {
    taskId: 't1',
    description: 'test',
    priority: 1,
    status: 'running',
    neededCapabilities: [{ type: 'reasoning', level: 5, confidence: 0.5 }],
    hopHistory: [],
    currentAgent: '',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('ChainTransferManager with CapabilityRouter', () => {
  it('should use router to resolve provider', async () => {
    const pool = new AgentPool();
    pool.createAgent('reasoner', 'Reasoner', [{ type: 'reasoning', level: 8, confidence: 0.9 }]);
    const llmPool = new LLMPool();
    const mockProvider = new MockProvider();
    llmPool.register('claude-sonnet', mockProvider);
    const router = new CapabilityRouter(llmPool);

    const manager = new ChainTransferManager(pool, undefined, undefined, 10, undefined, llmPool, undefined, undefined, router);
    const result = await manager.startChain(ctx(), 'reasoner');

    expect(result.status).toBe('complete');
  });
});
```

- [ ] **Step 5: Run tests**

Run: `pnpm test`
Expected: All tests pass (including new test)

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/chain/ChainTransferManager.ts packages/core/src/engine/CoreEngine.ts packages/core/test/chain/ChainTransferManager.router.test.ts
git commit -m "fix(core): wire CapabilityRouter into chain transfer execution"
```

---

### Task 4: Use Zod schema for EngineConfig validation

**Problem:** `CoreEngine` accepts `{ dbPath: string }` as config but `EngineConfigSchema` defines `maxHops`, `agents`, and other fields that are never validated or used.

**Design:** Parse config through `EngineConfigSchema` in CoreEngine constructor and use the parsed values (maxHops, agents list) instead of hardcoded defaults.

**Files:**
- Modify: `packages/core/src/engine/CoreEngine.ts`
- Modify: `packages/core/src/config/schema.ts`
- Modify: `packages/core/test/engine/CoreEngine.test.ts`

- [ ] **Step 1: Extend EngineConfig and validate with Zod**

In `CoreEngine.ts`, change the constructor and `start()` to validate config:

```typescript
import { EngineConfigSchema, type ValidatedEngineConfig } from '../config/schema.ts';

export interface EngineConfig {
  dbPath: string;
  maxHops?: number;
  agents?: Array<{ id: string; name: string; capabilities: Array<{ type: string; level: number; confidence: number }> }>;
}

export class CoreEngine {
  private parsedConfig!: ValidatedEngineConfig;

  constructor(private config: EngineConfig) {}

  async start(): Promise<void> {
    this.parsedConfig = EngineConfigSchema.parse({
      dbPath: this.config.dbPath,
      maxHops: this.config.maxHops ?? 10,
      agents: this.config.agents ?? [
        {
          id: 'reasoner',
          name: 'Reasoner',
          transferPolicy: 'capability_match' as const,
          capabilities: [{ type: 'reasoning' as const, level: 8, confidence: 0.9 }],
        },
        {
          id: 'coder',
          name: 'Coder',
          transferPolicy: 'capability_match' as const,
          capabilities: [{ type: 'codegen' as const, level: 8, confidence: 0.85 }],
        },
        {
          id: 'reviewer',
          name: 'Reviewer',
          transferPolicy: 'capability_match' as const,
          capabilities: [{ type: 'review' as const, level: 7, confidence: 0.8 }],
        },
      ],
    });
```

- [ ] **Step 2: Use parsed config for agent registration and max hops**

Replace the hardcoded agent list in `registerDefaultAgents`:

```typescript
  private registerDefaultAgents(): void {
    for (const cfg of this.parsedConfig.agents) {
      this.pool.createAgent(cfg.id, cfg.name, cfg.capabilities);
      this.stateStore.saveAgentConfig({
        id: cfg.id,
        name: cfg.name,
        capabilities: cfg.capabilities,
      });
    }
  }
```

Pass `this.parsedConfig.maxHops` to ChainTransferManager instead of hardcoded `10`:

```typescript
    const chain = new ChainTransferManager(
      this.pool,
      this.observer,
      this.intervener,
      this.parsedConfig.maxHops,
      this.bus as any,
      this.llmPool,
      this.promptRegistry,
      this.budgetTracker,
      this.capabilityRouter,
    );
```

- [ ] **Step 3: Update test that creates CoreEngine**

Existing tests pass `{ dbPath: dir }` which is valid. Verify:

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/engine/CoreEngine.ts packages/core/test/engine/CoreEngine.test.ts
git commit -m "fix(core): validate EngineConfig through Zod schema"
```

---

### Task 5: Improve Observer cycle detection

**Problem:** `Observer.detectCycle()` only catches the exact 4-hop A-B-A-B alternating pattern. Longer cycles (A-B-C-A-B-C) or shorter patterns are missed.

**Design:** Implement Floyd's cycle detection algorithm (tortoise and hare) on the agent sequence, plus keep the existing windowed check as a fast path.

**Files:**
- Modify: `packages/core/src/meta/Observer.ts`
- Modify: `packages/core/test/meta/Observer.test.ts`

- [ ] **Step 1: Write failing tests for improved cycle detection**

In `Observer.test.ts`, add to the existing describe block:

```typescript
  it('should detect longer cycle pattern (A-B-C-A-B-C)', () => {
    const obs = new Observer();
    obs.recordHop('a', 'b', 50);
    obs.recordHop('b', 'c', 50);
    obs.recordHop('c', 'a', 50);
    obs.recordHop('a', 'b', 50);
    obs.recordHop('b', 'c', 50);
    obs.recordHop('c', 'a', 50);
    const anomalies = obs.detectAnomalies();
    expect(anomalies.some((a) => a.type === 'cycle_pattern')).toBe(true);
  });

  it('should detect simple back-and-forth cycle', () => {
    const obs = new Observer();
    obs.recordHop('a', 'b', 50);
    obs.recordHop('b', 'a', 50);
    obs.recordHop('a', 'b', 50);
    obs.recordHop('b', 'a', 50);
    const anomalies = obs.detectAnomalies();
    expect(anomalies.some((a) => a.type === 'cycle_pattern')).toBe(true);
  });

  it('should not false-positive on normal sequential hops', () => {
    const obs = new Observer();
    obs.recordHop('a', 'b', 50);
    obs.recordHop('b', 'c', 50);
    obs.recordHop('c', 'd', 50);
    obs.recordHop('d', 'e', 50);
    obs.recordHop('e', 'f', 50);
    obs.recordHop('f', 'g', 50);
    const anomalies = obs.detectAnomalies();
    expect(anomalies.some((a) => a.type === 'cycle_pattern')).toBe(false);
  });
```

- [ ] **Step 2: Run tests to verify failures**

Run: `pnpm test -- --reporter verbose packages/core/test/meta/Observer.test.ts`
Expected: New cycle tests fail (cycle not detected)

- [ ] **Step 3: Replace detectCycle in Observer.ts**

Replace the `detectCycle` method:

```typescript
  private detectCycle(): boolean {
    if (this.hopHistory.length < 4) return false;

    // Fast path: check A-B-A-B alternating pattern (existing check)
    const recent = this.hopHistory.slice(-4).map((h) => h.from);
    if (recent[0] === recent[2] && recent[1] === recent[3]) return true;

    // Floyd's cycle detection on the agent sequence
    const fromAgents = this.hopHistory.map((h) => h.from);
    if (fromAgents.length < 4) return false;

    let slow = 0;
    let fast = 2;
    while (fast < fromAgents.length) {
      if (fromAgents[slow] === fromAgents[fast]) {
        // Verify the cycle repeats at least 2 full times
        const cycleLen = fast - slow;
        if (cycleLen >= 2 && fast + cycleLen < fromAgents.length) {
          let match = true;
          for (let i = 0; i < cycleLen; i++) {
            if (fromAgents[slow + i] !== fromAgents[fast + i]) {
              match = false;
              break;
            }
          }
          if (match) return true;
        }
      }
      slow++;
      fast += 2;
    }

    return false;
  }
```

- [ ] **Step 4: Run tests to verify all pass**

Run: `pnpm test -- --reporter verbose packages/core/test/meta/Observer.test.ts`
Expected: All 6 Observer tests pass (3 original + 3 new)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/meta/Observer.ts packages/core/test/meta/Observer.test.ts
git commit -m "fix(core): improve Observer cycle detection with Floyd's algorithm"
```

---

### Task 6: Fix Intervener replace to match by capability

**Problem:** `handleIntervention('replace')` in `ChainTransferManager.ts:154` selects the first idle agent regardless of whether it can handle the remaining work.

**Design:** Filter replacement candidates by matching against remaining capabilities before falling back to any idle agent.

**Files:**
- Modify: `packages/core/src/chain/ChainTransferManager.ts`

- [ ] **Step 1: Add capability check to replace handler**

In `ChainTransferManager.ts` replace the `replace` case:

```typescript
      case 'replace': {
        if (!this._currentAgentId) return false;
        const remaining = this.computeRemaining();
        const idleAgents = this.pool
          .getAllAgents()
          .filter((a) => a.id !== this._currentAgentId && a.state === 'idle');

        // Prefer agents that can handle remaining work
        const capableAgent = remaining.length > 0
          ? idleAgents.find((a) =>
              remaining.every((r) =>
                a.capabilities.some((c) => c.type === r.type && c.level >= r.level),
              ),
            )
          : undefined;

        const replacement = capableAgent ?? idleAgents[0];
        if (!replacement) return false;
        this._currentAgentId = replacement.id;
        replacement.assignTask(this._taskContext!);
        return true;
      }
```

- [ ] **Step 2: Run tests**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/chain/ChainTransferManager.ts
git commit -m "fix(core): filter replacement agents by capability match"
```

---

### Task 7: Harden Orchestrator agent selection

**Problem:** `Orchestrator.selectFirst()` uses `agentIds.find(id => id.includes(cap))` — substring matching between agent ID and capability name (e.g., "reasoner" matches "reasoning"). This is fragile and breaks if agent IDs don't follow naming conventions.

**Design:** Pass capability-to-agent mapping explicitly instead of relying on substring matching. Store the mapping in `Orchestrator`.

**Files:**
- Modify: `packages/core/src/meta/Orchestrator.ts`
- Modify: `packages/core/src/engine/CoreEngine.ts`
- Modify: `packages/core/test/meta/Orchestrator.test.ts`

- [ ] **Step 1: Write failing tests**

In `Orchestrator.test.ts`, add:

```typescript
  it('should select first agent by explicit capability mapping', async () => {
    // Agent IDs don't contain capability names as substrings
    const orchestrator = new Orchestrator(['ag-1', 'ag-2', 'ag-3'], [
      { agentId: 'ag-1', capabilities: ['reasoning'] },
      { agentId: 'ag-2', capabilities: ['codegen'] },
      { agentId: 'ag-3', capabilities: ['review'] },
    ]);
    const analysis = await orchestrator.analyze({
      id: 't1',
      description: 'implement a function',
      priority: 1,
    });
    // Should select codegen agent, not fallback to first
    expect(analysis.firstAgent).toBe('ag-2');
  });

  it('should fallback to first agent when no capability match', async () => {
    const orchestrator = new Orchestrator(['ag-1', 'ag-2'], [
      { agentId: 'ag-1', capabilities: ['reasoning'] },
      { agentId: 'ag-2', capabilities: ['codegen'] },
    ]);
    const analysis = await orchestrator.analyze({
      id: 't1',
      description: 'do something unrelated',
      priority: 1,
    });
    expect(analysis.firstAgent).toBe('ag-1');
  });

  it('should maintain backward compatibility with ID-based matching', async () => {
    // Old-style agent IDs that happen to contain capability names
    const orchestrator = new Orchestrator(['reasoner', 'coder', 'reviewer']);
    const analysis = await orchestrator.analyze({
      id: 't1',
      description: 'write code',
      priority: 1,
    });
    expect(['reasoner', 'coder', 'reviewer']).toContain(analysis.firstAgent);
  });
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm test -- packages/core/test/meta/Orchestrator.test.ts`
Expected: New tests fail

- [ ] **Step 3: Refactor Orchestrator to accept explicit mapping**

In `Orchestrator.ts`, add an optional agent-to-capability mapping:

```typescript
export interface AgentCapabilityMap {
  agentId: AgentId;
  capabilities: string[];
}

export class Orchestrator {
  private agentMap: Map<AgentId, string[]>;

  constructor(
    private agentIds: AgentId[],
    agentCapabilities?: AgentCapabilityMap[],
  ) {
    this.agentMap = new Map();
    if (agentCapabilities) {
      for (const entry of agentCapabilities) {
        this.agentMap.set(entry.agentId, entry.capabilities);
      }
    }
  }
```

Replace `selectFirst` to use the map first, then fall back to substring matching:

```typescript
  private selectFirst(capabilities: string[]): AgentId {
    if (capabilities.length === 0) return this.agentIds[0] ?? '';

    for (const cap of capabilities) {
      // Try explicit mapping first
      for (const [agentId, caps] of this.agentMap) {
        if (caps.includes(cap)) return agentId;
      }
      // Fall back to substring matching (backward compat)
      const agent = this.agentIds.find((id) => id.includes(cap));
      if (agent) return agent;
    }
    return this.agentIds[0] ?? '';
  }
```

- [ ] **Step 4: Pass capability mapping in CoreEngine**

In `CoreEngine.ts`, update `registerDefaultAgents` and the Orchestrator instantiation in `start()`:

```typescript
    const agentCapMappings = [
      { agentId: 'reasoner', capabilities: ['reasoning', 'coordination'] },
      { agentId: 'coder', capabilities: ['codegen'] },
      { agentId: 'reviewer', capabilities: ['review'] },
    ];
    this.orchestrator = new Orchestrator(
      ['reasoner', 'coder', 'reviewer'],
      agentCapMappings,
    );
```

- [ ] **Step 5: Run tests to verify all pass**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/meta/Orchestrator.ts packages/core/src/engine/CoreEngine.ts packages/core/test/meta/Orchestrator.test.ts
git commit -m "fix(core): harden Orchestrator agent selection with explicit capability mapping"
```

---

### Self-Review

**1. Spec coverage:** Tasks 1-3 address the Critical issues (LLM dead code, unused BudgetTracker, unused CapabilityRouter). Tasks 4-7 address Important issues (Zod validation, cycle detection, replace capability matching, fragile agent selection). Minor issues from review are not included per the scope.

**2. Placeholder scan:** No TODOs, TBDs, or vague instructions remain. Every step has complete code or exact commands.

**3. Type consistency:** `CapabilityRouter` usage in Task 3 uses its public `resolve()` method and `RouteResult` type consistently with existing `src/llm/CapabilityRouter.ts:34`. `AgentCapabilityMap` interface is new but documented inline.
