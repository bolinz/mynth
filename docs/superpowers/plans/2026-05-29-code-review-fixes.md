# Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical and medium-severity bugs found in the comprehensive code review (14 categories, ~25 bugs)

**Architecture:** Each task is independent and can be fixed in isolation with its own test. Fixes touch persistence, engine, chain, agent, meta, LLM, memory, scheduler, message-bus, and vector subsystems.

**Tech Stack:** TypeScript, Vitest, LevelDB

---

### Task 1: LevelDBAdapter double-encoding fix

**Bug:** `valueEncoding: 'json'` conflicts with manual `JSON.stringify`/`JSON.parse`. String values lose type fidelity. Fix: switch to `valueEncoding: 'utf8'` (default) and keep manual JSON handling.

**Files:**
- Modify: `packages/core/src/persistence/LevelDBAdapter.ts`

- [ ] **Step 1: Fix valueEncoding and remove redundant stringify/parse**

```ts
// Current (buggy):
private db!: Level<string, string>;
// ...
await this.db.open({ valueEncoding: 'json' });
// ...
await this.db.put(key, JSON.stringify(value));
const raw = await this.db.get(key);
return raw ? JSON.parse(raw as string) : null;

// Fixed:
private db!: Level<string, string>;
// ...
await this.db.open(); // default utf8 encoding
// ...
await this.db.put(key, JSON.stringify(value));
const raw = await this.db.get(key);
return raw ? JSON.parse(raw as string) : null;
```

- [ ] **Step 2: Fix `range()` to return parsed values**

```ts
async range(start: string, end: string): Promise<Array<[string, unknown]>> {
  const results: Array<[string, unknown]> = [];
  for await (const [key, value] of this.db.iterator({ gte: start, lte: end })) {
    results.push([key, JSON.parse(value as string)]);
  }
  return results;
}
```

- [ ] **Step 3: Fix error code check**

```ts
// Current: (err as { code: string }).code === 'LEVEL_NOT_FOUND'
// Fixed: check for 'LEVEL_NOT_FOUND' (level package error code)
```

- [ ] **Step 4: Run tests to verify**

Run: `pnpm test --reporter=verbose | grep -E "LevelDB|StateStore|PrivateMemory"` — all pass

### Task 2: GracefulShutdown drain fix

**Bug:** Drain loop sleeps blindly without checking if tasks actually complete. Replace with actual task completion tracking.

**Files:**
- Modify: `packages/core/src/engine/GracefulShutdown.ts`
- Modify: `packages/core/src/scheduler/Scheduler.ts`

- [ ] **Step 1: Add drain-aware API to Scheduler**

```ts
// In Scheduler.ts, add:
private draining = false;

isDraining(): boolean {
  return this.draining;
}

setDraining(v: boolean): void {
  this.draining = v;
}

async waitForEmpty(timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const running = Array.from(this.tasks.values()).filter(
      (t) => t.status === 'running' || t.status === 'queued'
    );
    if (running.length === 0) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
```

- [ ] **Step 2: Fix GracefulShutdown.shutdown()**

```ts
async shutdown(): Promise<void> {
  if (this.isDraining()) return;
  this.draining = true;

  const running = this.scheduler
    .getAllTasks()
    .filter((t) => t.status === 'running' || t.status === 'queued');

  if (running.length > 0) {
    this.scheduler.setDraining(true);
    const drained = await this.scheduler.waitForEmpty(this.drainTimeout);
    if (!drained) {
      console.warn(`[GracefulShutdown] ${running.length} tasks still running after drain timeout, forcing close`);
    }
  }

  await this.memory?.shutdown?.();
  await this.db.close();
}
```

- [ ] **Step 3: Write test for drain behavior**

```ts
it('should wait for tasks to complete during drain', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mynth-drain-'));
  try {
    const engine = new CoreEngine({ dbPath: dir, maxHops: 3 });
    await engine.start();
    engine.executeTask('quick task'); // fire and forget
    const t0 = Date.now();
    await engine.stop();
    expect(Date.now() - t0).toBeGreaterThan(100); // waited for task
    expect(engine.isRunning()).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 4: Run test**

Run: `pnpm test --reporter=verbose | grep GracefulShutdown` — pass

### Task 3: CoreEngine critical bugs

**Files:**
- Modify: `packages/core/src/engine/CoreEngine.ts`

- [ ] **Step 1: Move rendererRegistry init before PromptRegistry**

```ts
// Move this BEFORE this.promptRegistry = new PromptRegistry(this.rendererRegistry);
this.rendererRegistry = new RendererRegistry();
this.rendererRegistry.register(markdownRenderer);
// ... all 7 renderers ...
// THEN:
this.promptRegistry = new PromptRegistry(this.rendererRegistry);
```

- [ ] **Step 2: Fix tree status mapping (completed tasks)**

```ts
// Line 251 change:
this.scheduler.tree.updateStatus(taskId, result.status === 'complete' ? 'completed' : 'failed');
```

- [ ] **Step 3: Fix task ID collision — add random suffix**

```ts
// Line 196 change:
const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
```

- [ ] **Step 4: Add try/catch to executeTask for zombie task prevention**

```ts
async executeTask(description: string): Promise<TaskResult> {
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    // ... existing code ...
    return { taskId, status: result.status, hops: result.hopCount };
  } catch (err) {
    this.scheduler.updateStatus(taskId, 'failed');
    await this.stateStore.saveTask({
      taskId, description, status: 'failed', hops: 0, createdAt: Date.now(),
    });
    throw err;
  }
}
```

- [ ] **Step 5: Run existing tests**

Run: `pnpm test` — all pass

### Task 4: ChainTransferManager capability satisfaction fix

**Bug:** All agent capabilities are marked satisfied if any one matches. Fix: only mark the specific capability type that was needed.

**Files:**
- Modify: `packages/core/src/chain/ChainTransferManager.ts`

- [ ] **Step 1: Fix the capability satisfaction logic**

```ts
// Lines 130-133 change from:
for (const cap of agent.capabilities) {
  if (this._taskContext?.neededCapabilities.some((c) => c.type === cap.type)) {
    this.satisfiedTypes.add(cap.type);
  }
}

// To:
for (const cap of agent.capabilities) {
  if (this._taskContext?.neededCapabilities.some((c) => c.type === cap.type)) {
    // Only mark the matching capability type, not all agent capabilities
    this.satisfiedTypes.add(cap.type);
    break; // Found the needed one, don't mark extra capabilities
  }
}
```

Wait — the current code adds `cap.type` for EVERY cap that matches ANY needed capability. If agent has [reasoning, codegen] and need is [codegen], both 'reasoning' and 'codegen' get added to satisfiedTypes because reasoning matches... no, 'reasoning' doesn't match needed c.type === 'codegen'.

Let me re-think. The loop is:
```ts
for (const cap of agent.capabilities) {        // all agent capabilities
  if (this._taskContext?.neededCapabilities      // all needed caps
    .some((c) => c.type === cap.type)) {         // does any needed match this cap?
    this.satisfiedTypes.add(cap.type);            // if yes, mark this cap as satisfied
  }
}
```

If agent has [reasoning, codegen] and needed is [codegen, review]:
- cap=reasoning: needed has ['codegen','review'], none === 'reasoning' → skip
- cap=codegen: needed has codegen → add 'codegen'
→ Result: satisfiedTypes = ['codegen'] ✓

If agent has [codegen, review] and needed is [codegen]:
- cap=codegen: needed has codegen → add 'codegen'
- cap=review: needed has codegen, not 'review' → skip
→ Result: satisfiedTypes = ['codegen'] ✓

So the current code is actually correct for the typical case. The bug report says "所有的能力都被标记为已满足" but that's only true if ALL agent capabilities appear in the needed capabilities list.

Wait, let me re-examine. The bug description says:
> 当前 agent 的所有能力都被标记为已满足，只要它们中的任何一个与实际需要的能力匹配

But looking at the code, it checks EACH capability type against neededCapabilities. If agent has [A, B] and needed is [A], then:
- cap A: needed.some(c => c.type === 'A') → true → add 'A'
- cap B: needed.some(c => c.type === 'B') → false → skip

Only 'A' is added. So the bug is less severe than reported for this specific pattern.

BUT — the issue is different. The loop marks `satisfiedTypes` and `break` should be added after finding a match because once we've matched the needed capability type, we don't need to continue checking other agent capabilities for the same need. More importantly, the `break` prevents marking unrelated capabilities IF they happen to match other needed caps.

Actually, looking more carefully: the bug is that without `break`, if agent has [A, B] and needed is [A, B], then BOTH get satisfied. But ideally, only the capability type that the agent was specifically acquired for should be satisfied. The ReActLoop/LLM execution is per-capability.

So the fix should be: track which capability was the primary one for this hop, and only mark that one.

Let me simplify: just add the specific capability that was used for this hop (line 83 in the current code):

```ts
const cap = agent.capabilities[0]?.type ?? 'reasoning';
```

This is the capability used for this hop. Mark only that one:

```ts
this.satisfiedTypes.add(cap);
```

This is the simplest correct fix.

- [ ] **Step 1: Fix capability satisfaction**

```ts
// Change lines 130-133 from:
for (const cap of agent.capabilities) {
  if (this._taskContext?.neededCapabilities.some((c) => c.type === cap.type)) {
    this.satisfiedTypes.add(cap.type);
  }
}

// To (use the cap already determined on line 83):
this.satisfiedTypes.add(cap);
```

- [ ] **Step 2: Write test**

```ts
it('should only mark the used capability as satisfied', async () => {
  const pool = new AgentPool();
  pool.createAgent('dual', 'Dual', [
    { type: 'reasoning', level: 8, confidence: 0.9 },
    { type: 'codegen', level: 8, confidence: 0.85 },
  ]);
  const manager = new ChainTransferManager(pool);
  const result = await manager.startChain({
    taskId: 't1', description: 'build', priority: 1, status: 'running',
    neededCapabilities: [
      { type: 'reasoning', level: 5, confidence: 0.5 },
      { type: 'codegen', level: 5, confidence: 0.5 },
    ],
    hopHistory: [], currentAgent: '',
    createdAt: Date.now(),
  }, 'dual');
  // Reasoning should be satisfied, codegen should still be needed
  expect(result.hopCount).toBe(1); // Only 1 hop: dual satisfied reasoning
  // The chain completes because reasoning is satisfied, codegen remains unsatisfied
  // Agent might transfer to complete or escalate depending on decideTransfer
});
```

### Task 5: Orchestrator neededCapabilities propagation

**Bug:** `initializeChain()` sets `neededCapabilities: []` instead of using the analysis results.

**Files:**
- Modify: `packages/core/src/meta/Orchestrator.ts`

- [ ] **Step 1: Fix initializeChain to accept and propagate capabilities**

```ts
// Change the method signature and implementation:
async initializeChain(
  task: Partial<Task> & { id: string; description: string; priority: number },
  firstAgentId: string,
  capabilities?: CapabilityType[],  // NEW: accept capabilities from analyze()
): Promise<TaskContext> {
  return {
    taskId: task.id,
    description: task.description,
    priority: task.priority,
    status: 'running',
    neededCapabilities: (capabilities ?? []).map((name) => ({
      type: name as CapabilityType,
      level: 5,
      confidence: 0.5,
    })),
    hopHistory: [],
    currentAgent: firstAgentId,
    createdAt: Date.now(),
  };
}
```

- [ ] **Step 2: Update CoreEngine.executeTask to pass capabilities**

```ts
// Line 221-229 change:
const taskContext = await this.orchestrator.initializeChain(
  {
    id: taskId,
    description,
    priority: 1,
    constraints: { requiredCapabilities: [], forbiddenAgents: [], maxHops: 10 },
  },
  analysis.firstAgent,
  analysis.capabilities,  // NEW: pass inferred capabilities
);
// Remove the old override (lines 230-234):
// taskContext.neededCapabilities = analysis.capabilities.map(...); ← DELETE
```

- [ ] **Step 3: Run tests**

Run: `pnpm test` — verify chain tests pass with real capabilities

### Task 6: BaseAgent checkpoint context fix

**Bug:** Checkpoints are saved with `context: {} as any`, losing task state.

**Files:**
- Modify: `packages/core/src/agent/BaseAgent.ts`

- [ ] **Step 1: Pass real context to checkpoints**

```ts
// Find three instances of `checkpoint` method calls and fix them.
// Example fix:
const cp = await this.checkpoint(this.context ?? {});
```

Note: this requires `this.context` to be properly stored. Add context tracking to BaseAgent:

```ts
private context: TaskContext | null = null;

assignTask(task: TaskContext): void {
  this.context = task;
  // ... existing logic ...
}

complete(): void {
  this.context = null;
  // ... existing logic ...
}
```

- [ ] **Step 1: Add context field and update checkpoint calls**

```ts
// In BaseAgent.ts:

// Add field: private context: TaskContext | null = null;

// In assignTask: this.context = task;
// In complete: this.context = null;
// In decideTransfer checkpoint call: const cp = await this.checkpoint(this.context ?? {});
// In handleError checkpoint call: const cp = await this.checkpoint(this.context ?? {});
```

### Task 7: Intervener empty agent ID fix

**Bug:** `replace` and `reroute` actions return empty agent IDs.

**Files:**
- Modify: `packages/core/src/meta/Intervener.ts`

- [ ] **Step 1: Fix action to not include empty IDs (they are unused)**

Remove `newAgent: ''` and `newStart: ''` from the action objects — the ChainTransferManager decides which agent to use based on pool state, not from the intervention action.

```ts
// Change from:
{ type: 'replace' as const, newAgent: '' }
{ type: 'reroute' as const, newStart: '' }

// To:
{ type: 'replace' as const }
{ type: 'reroute' as const }
```

### Task 8: StateStore atomic operations

**Bug:** `saveHop`, `saveTask`, `saveAgentConfig` do sequential put calls without batch.

**Files:**
- Modify: `packages/core/src/persistence/StateStore.ts`

- [ ] **Step 1: Add `batch()` to `Persistence` interface and implement in `LevelDBAdapter`**

```ts
// In Persistence.ts:
batch(operations: Array<{ type: 'put' | 'del'; key: string; value?: unknown }>): Promise<void>;

// In LevelDBAdapter.ts:
async batch(operations: Array<{ type: 'put' | 'del'; key: string; value?: unknown }>): Promise<void> {
  const batch = this.db.batch();
  for (const op of operations) {
    if (op.type === 'put') {
      batch.put(op.key, JSON.stringify(op.value));
    } else {
      batch.del(op.key);
    }
  }
  await batch.write();
}
```

- [ ] **Step 2: Use batch in StateStore**

```ts
async saveHop(taskId: string, hop: HopRecord): Promise<void> {
  const key = this.k(`state:hop:${taskId}:${Date.now()}_${Math.random().toString(36).slice(2, 4)}`);
  const index = await this.getHopIndex(taskId);
  index.push(key);
  await this.db.batch([
    { type: 'put', key, value: hop },
    { type: 'put', key: this.k(`state:index:hop:${taskId}`), value: index },
  ]);
}
```

### Task 9: LLM provider finish-reason mapping fix

**Files:**
- Modify: `packages/core/src/llm/AnthropicProvider.ts`
- Modify: `packages/core/src/llm/OpenAIProvider.ts`

- [ ] **Step 1: Fix Anthropic finish-reason**

```ts
// Current: stop_reason === 'end_turn' → 'stop'
// Add: stop_reason === 'stop_sequence' → 'stop'
const finishReason =
  stop_reason === 'end_turn' || stop_reason === 'stop_sequence'
    ? 'stop'
    : 'length';
```

- [ ] **Step 2: Fix OpenAI finish-reason**

```ts
// Current: only checks for 'stop'
// Add: 'content_filter', 'tool_calls' handling
const finishReason =
  finish === 'stop' || finish === 'tool_calls'
    ? 'stop'
    : 'length';
```

- [ ] **Step 3: Fix streaming error resource leak in both providers**

Wrap the error path to drain the response body:

```ts
if (!res.ok) {
  const text = await res.text(); // drain body
  throw new Error(`HTTP ${res.status}: ${text}`);
}
```

### Task 10: TaskTreeManager childIds safety

**Bug:** `childIds!` non-null assertion can crash if parent task lacks childIds.

**Files:**
- Modify: `packages/core/src/scheduler/TaskTreeManager.ts`

- [ ] **Step 1: Fix all childIds! accesses with default empty array**

```ts
// Line 55-56 change:
if (input.parentId) {
  const parent = this.tasks.get(input.parentId);
  if (parent) {
    parent.childIds = parent.childIds ?? [];
    if (!parent.childIds.includes(task.id)) {
      parent.childIds.push(task.id);
    }
  }
}
```

Also fix the other childIds! occurrences in the file.

- [ ] **Step 2: Remove all 'archived' as any and 'paused' as any casts**

Replace with proper TaskStatus type extensions or add 'archived' to the union.

### Task 11: VectorStore rebuild fix

**Bug:** `add()` sets `needsRebuild = true` but never calls `rebuildIVF()`.

**Files:**
- Modify: `packages/core/src/vector/VectorStore.ts`

- [ ] **Step 1: Fix add() to trigger rebuild**

```ts
async add(id: string, vector: number[]): Promise<void> {
  this.validateVector(vector);
  this.items.set(id, vector);
  this.updateNorm(id, vector);
  if (this.items.size >= this.rebuildThreshold) {
    await this.rebuildIVF();
  }
}
```

### Task 12: MemoryQueue backpressure wiring

**Bug:** `MessageBus.send()` discards the backpressure return value from `enqueue()`.

**Files:**
- Modify: `packages/core/src/message-bus/MessageBus.ts`
- Modify: `packages/core/src/chain/ChainTransferManager.ts` (one usage)

- [ ] **Step 1: Log backpressure when queue is critical**

```ts
// In MessageBus.send():
async send(to: string, message: Omit<QueueMessage, 'timestamp'>): Promise<BackpressureStatus | null> {
  return this.queue.enqueue({ ...message, timestamp: Date.now() });
}
```

Note: changing return type requires updating callers. For minimal fix, just log on critical:

```ts
send(to: string, message: Omit<QueueMessage, 'timestamp'>): void {
  const promise = this.queue.enqueue({ ...message, timestamp: Date.now() });
  // Fire and forget backpressure check
  promise.then((status) => {
    if (status && status.severity === 'critical') {
      console.warn(`[Backpressure] Queue critical: depth ${status.queueDepth}/${status.maxCapacity}`);
    }
  });
}
```

### Task 13: Memory leak mitigations

**Files:**
- Modify: `packages/core/src/meta/Observer.ts` — add hopHistory max size
- Modify: `packages/core/src/meta/Tracer.ts` — add spans max size
- Modify: `packages/core/src/meta/HITLManager.ts` — prune old requests
- Modify: `packages/core/src/meta/InteractionManager.ts` — prune old interactions
- Modify: `packages/core/src/message-bus/EventBus.ts` — isolate handler exceptions

- [ ] **Step 1: Add max sizes to growing collections**

```ts
// Observer: limit hopHistory to 10000
recordHop(...): void {
  this.hopHistory.push({...});
  if (this.hopHistory.length > 10000) this.hopHistory.shift();
}

// Tracer: limit spans to 5000
startSpan(...): Span {
  if (this.spans.size > 5000) {
    const oldest = [...this.spans.keys()].sort()[0];
    this.spans.delete(oldest);
  }
  // ...
}
```

- [ ] **Step 2: Wrap EventBus handler calls in try-catch**

```ts
publish<T extends EventPayload>(topic: EventTopic, payload: T): void {
  const handlers = this.handlers.get(topic);
  if (!handlers) return;
  for (const handler of handlers) {
    try {
      handler(topic, payload);
    } catch (err) {
      console.error(`[EventBus] Handler error on ${topic}:`, err);
    }
  }
}
```

### Task 14: Write integration tests for fixes

**Files:**
- Add to: `packages/core/test/integration/`

- [ ] **Step 1: Test graceful shutdown drain**

Add to existing core-engine.integration.test.ts or create new file.

- [ ] **Step 2: Test LevelDBAdapter with string values**

```ts
it('should preserve string types through LevelDB', async () => {
  const dir = mkdtempSync(...);
  const db = new LevelDBAdapter(dir);
  await db.open();
  await db.put('str', JSON.stringify('hello'));
  const val = await db.get('str');
  expect(JSON.parse(val as string)).toBe('hello');
  await db.close();
  rmSync(dir, ...);
});
```

- [ ] **Step 3: Run full test suite**

Run: `pnpm test` — all 400+ tests pass

### Task 15: Final cleanup

- [ ] **Step 1: Run lint**

Run: `pnpm run lint` — clean

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "fix: code review fixes - LevelDB encoding, GracefulShutdown drain, CoreEngine status/ID/registry, ChainTransferManager caps, Orchestrator neededCaps, BaseAgent context, LLM finishReason, TaskTree childIds, VectorStore rebuild, EventBus isolation, memory leak limits"
```

- [ ] **Step 3: Push**

```bash
git push origin main
```
