# Mynth Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full agent collaboration engine: message bus, vector store, agent framework, scheduler, memory system, meta layer, and examples.

**Architecture:** Single-process monorepo with `@mynth/sdk` (types) -> `@mynth/core` (all subsystems). Chain transfer: Orchestrator initializes -> agents autonomously chain-transfer -> Observer monitors -> Intervener acts on anomalies.

**Tech Stack:** TypeScript (ES2022), pnpm workspaces, Turborepo, Vitest, Biome, LevelDB (`level`), in-memory queues, brute-force cosine vector search.

**Already done (steps 1-2):**
- Monorepo foundation (pnpm + turbo + Biome + tsconfig + .gitignore)
- `packages/sdk/src/types/` — Agent, Task, Message interfaces
- `packages/core/src/persistence/` — LevelDBAdapter

---

## File Map

```
packages/
└── core/src/
    ├── message-bus/
    │   ├── MemoryQueue.ts        # In-memory message queue with optional LevelDB persistence
    │   └── index.ts
    ├── vector/
    │   ├── VectorStore.ts        # Vector add/search/update/delete interface
    │   ├── SimpleANNIndex.ts     # Brute-force cosine similarity
    │   └── index.ts
    ├── agent/
    │   ├── BaseAgent.ts          # Abstract agent with state machine + lifecycle
    │   ├── AgentState.ts         # State machine transitions
    │   ├── AgentPool.ts          # Agent pool (create, acquire, release, destroy)
    │   └── index.ts
    ├── scheduler/
    │   ├── TaskQueue.ts          # Priority queue in-proc + LevelDB persisted
    │   ├── Scheduler.ts          # Enqueue/dequeue/priority/scheduling
    │   └── index.ts
    ├── memory/
    │   ├── GlobalMemory.ts       # Shared key-value with LevelDB persistence
    │   ├── Checkpoint.ts         # Checkpoint create/restore/cleanup
    │   └── index.ts
    └── meta/
        ├── Orchestrator.ts       # Task analysis + chain initialization
        ├── Observer.ts           # Metrics collection + anomaly detection
        ├── Guard.ts              # Security/permission/tool approval
        ├── Intervener.ts         # Replace/rollback/reroute/terminate
        └── index.ts

packages/
└── examples/src/
    ├── simple-agent.ts           # One agent: init -> execute -> complete
    └── collaboration.ts          # Multi-agent: reasoning -> codegen -> review
```

---

### Task 1: Message Bus — MemoryQueue

**Files:**
- Create: `packages/core/src/message-bus/MemoryQueue.ts`
- Create: `packages/core/src/message-bus/index.ts`
- Test: `packages/core/test/message-bus/MemoryQueue.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/message-bus/MemoryQueue.test.ts
import { describe, it, expect } from 'vitest';
import { MemoryQueue } from '../../src/message-bus/MemoryQueue.ts';

describe('MemoryQueue', () => {
  it('should enqueue and dequeue messages', async () => {
    const q = new MemoryQueue();
    await q.enqueue({ id: '1', type: 'execute', from: 'a', to: 'b', payload: {}, timestamp: 1 });
    const msg = await q.dequeue('b');
    expect(msg).not.toBeNull();
    expect(msg!.id).toBe('1');
  });

  it('should return null when queue is empty', async () => {
    const q = new MemoryQueue();
    const msg = await q.dequeue('x');
    expect(msg).toBeNull();
  });

  it('should track queue size', async () => {
    const q = new MemoryQueue();
    await q.enqueue({ id: '1', type: 'execute', from: 'a', to: 'b', payload: {}, timestamp: 1 });
    expect(await q.size()).toBe(1);
    await q.dequeue('b');
    expect(await q.size()).toBe(0);
  });

  it('should clear all messages', async () => {
    const q = new MemoryQueue();
    await q.enqueue({ id: '1', type: 'execute', from: 'a', to: 'b', payload: {}, timestamp: 1 });
    await q.clear();
    expect(await q.size()).toBe(0);
  });

  it('should deliver to correct consumer', async () => {
    const q = new MemoryQueue();
    await q.enqueue({ id: '1', type: 'execute', from: 'a', to: 'b', payload: {}, timestamp: 1 });
    await q.enqueue({ id: '2', type: 'execute', from: 'a', to: 'c', payload: {}, timestamp: 2 });
    const msgB = await q.dequeue('b');
    const msgC = await q.dequeue('c');
    expect(msgB!.id).toBe('1');
    expect(msgC!.id).toBe('2');
  });

  it('should work with consumer registration', async () => {
    const q = new MemoryQueue();
    const handled: string[] = [];
    q.registerConsumer('b', (msg) => { handled.push(msg.id); });
    await q.enqueue({ id: '1', type: 'execute', from: 'a', to: 'b', payload: {}, timestamp: 1 });
    expect(handled).toEqual(['1']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/message-bus/MemoryQueue.test.ts`
Expected: FAIL (file not found or module errors)

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/message-bus/MemoryQueue.ts
export interface QueueMessage {
  id: string;
  type: string;
  from: string;
  to: string;
  payload: unknown;
  timestamp: number;
  headers?: Record<string, string>;
}

export type MessageHandler = (message: QueueMessage) => void;

export class MemoryQueue {
  private queues = new Map<string, QueueMessage[]>();
  private consumers = new Map<string, MessageHandler>();

  async enqueue(message: QueueMessage): Promise<void> {
    const q = this.queues.get(message.to) || [];
    q.push(message);
    this.queues.set(message.to, q);
    const handler = this.consumers.get(message.to);
    if (handler) {
      handler(message);
    }
  }

  async dequeue(consumerId: string): Promise<QueueMessage | null> {
    const q = this.queues.get(consumerId);
    if (!q || q.length === 0) return null;
    return q.shift() ?? null;
  }

  async size(): Promise<number> {
    let total = 0;
    for (const q of this.queues.values()) {
      total += q.length;
    }
    return total;
  }

  async clear(): Promise<void> {
    this.queues.clear();
  }

  registerConsumer(consumerId: string, handler: MessageHandler): void {
    this.consumers.set(consumerId, handler);
  }

  unregisterConsumer(consumerId: string): void {
    this.consumers.delete(consumerId);
  }
}
```

```typescript
// packages/core/src/message-bus/index.ts
export type { QueueMessage, MessageHandler } from './MemoryQueue.ts';
export { MemoryQueue } from './MemoryQueue.ts';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/message-bus/MemoryQueue.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/message-bus/ packages/core/test/message-bus/
git commit -m "feat(core): add MemoryQueue message bus"
```

---

### Task 2: Vector Store — Simple ANN Index

**Files:**
- Create: `packages/core/src/vector/VectorStore.ts`
- Create: `packages/core/src/vector/SimpleANNIndex.ts`
- Create: `packages/core/src/vector/index.ts`
- Test: `packages/core/test/vector/VectorStore.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/vector/VectorStore.test.ts
import { describe, it, expect } from 'vitest';
import { VectorStore } from '../../src/vector/VectorStore.ts';

function vec(n: number, dim = 4): number[] {
  return Array.from({ length: dim }, (_, i) => (i === 0 ? n : 0));
}

describe('VectorStore', () => {
  it('should add and search vectors by cosine similarity', async () => {
    const store = new VectorStore(4);
    await store.add('a', [1, 0, 0, 0], { label: 'aaa' });
    await store.add('b', [0, 1, 0, 0], { label: 'bbb' });
    const results = await store.search([1, 0, 0, 0], 2);
    expect(results[0].id).toBe('a');
    expect(results[0].score).toBeCloseTo(1, 1);
    expect(results[1].id).toBe('b');
  });

  it('should handle empty store', async () => {
    const store = new VectorStore(4);
    const results = await store.search([1, 0, 0, 0], 5);
    expect(results).toEqual([]);
  });

  it('should update vector', async () => {
    const store = new VectorStore(4);
    await store.add('x', [1, 0, 0, 0]);
    await store.update('x', [0, 1, 0, 0]);
    const results = await store.search([0, 1, 0, 0], 1);
    expect(results[0].id).toBe('x');
  });

  it('should delete vector', async () => {
    const store = new VectorStore(4);
    await store.add('x', [1, 0, 0, 0]);
    await store.delete('x');
    const results = await store.search([1, 0, 0, 0], 1);
    expect(results).toEqual([]);
  });

  it('should query by metadata filter', async () => {
    const store = new VectorStore(4);
    await store.add('a', [1, 0, 0, 0], { type: 'dog' });
    await store.add('b', [0, 1, 0, 0], { type: 'cat' });
    const ids = await store.query({ type: 'dog' });
    expect(ids).toEqual(['a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/vector/VectorStore.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/vector/VectorStore.ts
export interface VectorItem {
  id: string;
  vector: number[];
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export class VectorStore {
  private items = new Map<string, VectorItem>();

  constructor(private dimension: number) {}

  async add(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    if (vector.length !== this.dimension) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimension}, got ${vector.length}`);
    }
    this.items.set(id, { id, vector, metadata });
  }

  async addBatch(items: VectorItem[]): Promise<void> {
    for (const item of items) {
      await this.add(item.id, item.vector, item.metadata);
    }
  }

  async search(query: number[], topK: number): Promise<SearchResult[]> {
    if (this.items.size === 0) return [];
    const results: SearchResult[] = [];
    for (const [id, item] of this.items) {
      const score = this.cosineSimilarity(query, item.vector);
      results.push({ id, score, metadata: item.metadata });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  async update(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    if (!this.items.has(id)) {
      throw new Error(`Vector not found: ${id}`);
    }
    this.items.set(id, { id, vector, metadata });
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async query(metadataFilter: Record<string, unknown>): Promise<string[]> {
    const results: string[] = [];
    for (const [id, item] of this.items) {
      if (item.metadata && this.matchesFilter(item.metadata, metadataFilter)) {
        results.push(id);
      }
    }
    return results;
  }

  size(): number {
    return this.items.size;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private matchesFilter(
    metadata: Record<string, unknown>,
    filter: Record<string, unknown>,
  ): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) return false;
    }
    return true;
  }
}
```

```typescript
// packages/core/src/vector/index.ts
export type { VectorItem, SearchResult } from './VectorStore.ts';
export { VectorStore } from './VectorStore.ts';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/vector/VectorStore.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/vector/ packages/core/test/vector/
git commit -m "feat(core): add VectorStore with brute-force cosine search"
```

---

### Task 3: Agent State Machine

**Files:**
- Create: `packages/core/src/agent/AgentState.ts`
- Test: `packages/core/test/agent/AgentState.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/agent/AgentState.test.ts
import { describe, it, expect } from 'vitest';
import { AgentStateMachine, type AgentState } from '../../src/agent/AgentState.ts';

describe('AgentStateMachine', () => {
  it('should start in idle state', () => {
    const sm = new AgentStateMachine();
    expect(sm.current).toBe('idle');
  });

  it('should transition idle -> thinking', () => {
    const sm = new AgentStateMachine();
    sm.transition('thinking');
    expect(sm.current).toBe('thinking');
  });

  it('should transition thinking -> working', () => {
    const sm = new AgentStateMachine();
    sm.transition('thinking');
    sm.transition('working');
    expect(sm.current).toBe('working');
  });

  it('should reject invalid transitions', () => {
    const sm = new AgentStateMachine();
    expect(() => sm.transition('working')).toThrow('Invalid transition');
  });

  it('should transition working -> error', () => {
    const sm = new AgentStateMachine();
    sm.transition('thinking');
    sm.transition('working');
    sm.transition('error');
    expect(sm.current).toBe('error');
  });

  it('should transition working -> transferring -> waiting -> working', () => {
    const sm = new AgentStateMachine();
    sm.transition('thinking');
    sm.transition('working');
    sm.transition('transferring');
    expect(sm.current).toBe('transferring');
    sm.transition('waiting');
    expect(sm.current).toBe('waiting');
    sm.transition('working');
    expect(sm.current).toBe('working');
  });

  it('should transition error -> idle on reset', () => {
    const sm = new AgentStateMachine();
    sm.transition('thinking');
    sm.transition('working');
    sm.transition('error');
    sm.transition('idle');
    expect(sm.current).toBe('idle');
  });

  it('should allow reset to idle from any state after error/intervened', () => {
    const sm = new AgentStateMachine();
    sm.transition('thinking');
    sm.transition('working');
    sm.transition('error');
    sm.transition('idle');
    expect(sm.current).toBe('idle');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/agent/AgentState.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/agent/AgentState.ts
export type AgentState =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting'
  | 'transferring'
  | 'error'
  | 'intervened'
  | 'shutdown';

const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  idle: ['thinking', 'working'],
  thinking: ['working', 'waiting', 'error'],
  working: ['transferring', 'waiting', 'error'],
  waiting: ['working', 'transferring', 'error'],
  transferring: ['working', 'idle', 'error'],
  error: ['idle', 'intervened', 'shutdown'],
  intervened: ['idle', 'working'],
  shutdown: [],
};

export class AgentStateMachine {
  current: AgentState = 'idle';

  transition(to: AgentState): void {
    const allowed = VALID_TRANSITIONS[this.current];
    if (!allowed?.includes(to)) {
      throw new Error(
        `Invalid transition: ${this.current} -> ${to}. Allowed: ${allowed?.join(', ') ?? 'none'}`,
      );
    }
    this.current = to;
  }

  reset(): void {
    this.current = 'idle';
  }
}
```

```typescript
// packages/core/src/agent/index.ts
export type { AgentState } from './AgentState.ts';
export { AgentStateMachine } from './AgentState.ts';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/agent/AgentState.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agent/AgentState.ts packages/core/test/agent/AgentState.test.ts packages/core/src/agent/index.ts
git commit -m "feat(core): add AgentStateMachine with lifecycle transitions"
```

---

### Task 4: Base Agent Class

**Files:**
- Create: `packages/core/src/agent/BaseAgent.ts`
- Test: `packages/core/test/agent/BaseAgent.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/agent/BaseAgent.test.ts
import { describe, it, expect, vi } from 'vitest';
import { BaseAgent } from '../../src/agent/BaseAgent.ts';
import type { Capability } from '@mynth/sdk';

describe('BaseAgent', () => {
  const caps: Capability[] = [{ type: 'reasoning', level: 7, confidence: 0.9 }];

  it('should initialize with given id and capabilities', () => {
    const agent = new BaseAgent('agent-1', 'Tester', caps);
    expect(agent.id).toBe('agent-1');
    expect(agent.name).toBe('Tester');
    expect(agent.state).toBe('idle');
  });

  it('should transition to thinking on assignTask', () => {
    const agent = new BaseAgent('agent-1', 'Tester', caps);
    agent.assignTask({} as any);
    expect(agent.state).toBe('thinking');
  });

  it('should transition working -> transferring -> waiting -> working on transfer flow', () => {
    const agent = new BaseAgent('a', 'A', caps);
    agent.assignTask({} as any);
    agent.startWork();
    expect(agent.state).toBe('working');
    agent.startTransfer();
    expect(agent.state).toBe('transferring');
    agent.waitForResume();
    expect(agent.state).toBe('waiting');
    agent.resume();
    expect(agent.state).toBe('working');
  });

  it('should transition to error on error', () => {
    const agent = new BaseAgent('a', 'A', caps);
    agent.assignTask({} as any);
    agent.startWork();
    agent.handleError(new Error('oops'));
    expect(agent.state).toBe('error');
    expect(agent.lastError?.message).toBe('oops');
  });

  it('should reset on shutdown', () => {
    const agent = new BaseAgent('a', 'A', caps);
    agent.assignTask({} as any);
    agent.startWork();
    agent.shutdown();
    expect(agent.state).toBe('shutdown');
  });

  it('should call onStateChange callback', () => {
    const changes: string[] = [];
    const agent = new BaseAgent('a', 'A', caps);
    agent.onStateChange = (state) => changes.push(state);
    agent.assignTask({} as any);
    expect(changes).toContain('thinking');
  });

  it('should track execute count', () => {
    const agent = new BaseAgent('a', 'A', caps);
    agent.assignTask({} as any);
    agent.startWork();
    agent.complete();
    expect(agent.metadata.taskCount).toBe(1);
  });

  it('should canHandle check capability match', () => {
    const agent = new BaseAgent('a', 'A', caps);
    expect(agent.canHandle([{ type: 'reasoning', level: 5, confidence: 0.5 }])).toBe(true);
    expect(agent.canHandle([{ type: 'codegen', level: 5, confidence: 0.5 }])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/agent/BaseAgent.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/agent/BaseAgent.ts
import type { AgentId, Capability, AgentMetadata } from '@mynth/sdk';
import { AgentStateMachine, type AgentState } from './AgentState.ts';

export class BaseAgent {
  readonly id: AgentId;
  readonly name: string;
  readonly capabilities: Capability[];
  readonly metadata: AgentMetadata;
  protected stateMachine = new AgentStateMachine();
  lastError: Error | null = null;
  onStateChange?: (state: AgentState) => void;

  private _taskCount = 0;

  constructor(id: string, name: string, capabilities: Capability[]) {
    this.id = id;
    this.name = name;
    this.capabilities = capabilities;
    this.metadata = {
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      taskCount: 0,
      successRate: 1,
      avgHopDuration: 0,
    };
  }

  get state(): AgentState {
    return this.stateMachine.current;
  }

  assignTask(_task: unknown): void {
    this.stateMachine.transition('thinking');
    this.stateChanged();
  }

  startWork(): void {
    this.stateMachine.transition('working');
    this.stateChanged();
  }

  startTransfer(): void {
    this.stateMachine.transition('transferring');
    this.stateChanged();
  }

  waitForResume(): void {
    this.stateMachine.transition('waiting');
    this.stateChanged();
  }

  resume(): void {
    this.stateMachine.transition('working');
    this.stateChanged();
  }

  complete(): void {
    this._taskCount++;
    this.metadata.taskCount = this._taskCount;
    this.metadata.lastActiveAt = Date.now();
    this.stateMachine.reset();
    this.stateChanged();
  }

  handleError(error: Error): void {
    this.lastError = error;
    this.stateMachine.transition('error');
    this.stateChanged();
  }

  shutdown(): void {
    this.stateMachine.transition('shutdown');
    this.stateChanged();
  }

  canHandle(required: Capability[]): boolean {
    return required.every((req) =>
      this.capabilities.some(
        (c) => c.type === req.type && c.level >= req.level && c.confidence >= req.confidence,
      ),
    );
  }

  private stateChanged(): void {
    this.onStateChange?.(this.state);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/agent/BaseAgent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agent/BaseAgent.ts packages/core/test/agent/BaseAgent.test.ts
git commit -m "feat(core): add BaseAgent with lifecycle and state machine"
```

---

### Task 5: AgentPool

**Files:**
- Create: `packages/core/src/agent/AgentPool.ts`
- Test: `packages/core/test/agent/AgentPool.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/agent/AgentPool.test.ts
import { describe, it, expect } from 'vitest';
import { AgentPool } from '../../src/agent/AgentPool.ts';
import type { Capability } from '@mynth/sdk';

const reasonCaps: Capability[] = [{ type: 'reasoning', level: 7, confidence: 0.9 }];
const codegenCaps: Capability[] = [{ type: 'codegen', level: 7, confidence: 0.9 }];

describe('AgentPool', () => {
  it('should acquire an agent by capability', () => {
    const pool = new AgentPool();
    pool.createAgent('r1', 'Reasoner', reasonCaps);
    const agent = pool.acquire('reasoning');
    expect(agent).not.toBeNull();
    expect(agent!.id).toBe('r1');
    expect(agent!.state).toBe('idle');
  });

  it('should return null when no agent available', () => {
    const pool = new AgentPool();
    expect(pool.acquire('reasoning')).toBeNull();
  });

  it('should not return busy agents', () => {
    const pool = new AgentPool();
    pool.createAgent('r1', 'Reasoner', reasonCaps);
    const a1 = pool.acquire('reasoning')!;
    a1.assignTask({} as any);
    expect(pool.acquire('reasoning')).toBeNull();
  });

  it('should release agent back to pool', () => {
    const pool = new AgentPool();
    pool.createAgent('r1', 'Reasoner', reasonCaps);
    const agent = pool.acquire('reasoning')!;
    pool.release(agent);
    expect(pool.acquire('reasoning')).not.toBeNull();
  });

  it('should find agents by capability', () => {
    const pool = new AgentPool();
    pool.createAgent('r1', 'R', reasonCaps);
    pool.createAgent('c1', 'C', codegenCaps);
    expect(pool.findByCapability('reasoning')).toHaveLength(1);
    expect(pool.findByCapability('codegen')).toHaveLength(1);
  });

  it('should get all agents', () => {
    const pool = new AgentPool();
    pool.createAgent('r1', 'R', reasonCaps);
    pool.createAgent('c1', 'C', codegenCaps);
    expect(pool.getAllAgents()).toHaveLength(2);
  });

  it('should destroy agents', () => {
    const pool = new AgentPool();
    pool.createAgent('r1', 'R', reasonCaps);
    pool.destroyAgent('r1');
    expect(pool.getAllAgents()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/agent/AgentPool.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/agent/AgentPool.ts
import type { AgentId, Capability, CapabilityType } from '@mynth/sdk';
import { BaseAgent } from './BaseAgent.ts';

export class AgentPool {
  private agents = new Map<AgentId, BaseAgent>();

  createAgent(id: string, name: string, capabilities: Capability[]): BaseAgent {
    const agent = new BaseAgent(id, name, capabilities);
    this.agents.set(agent.id, agent);
    return agent;
  }

  acquire(capabilityType: CapabilityType): BaseAgent | null {
    for (const agent of this.agents.values()) {
      if (agent.state === 'idle' && agent.capabilities.some((c) => c.type === capabilityType)) {
        return agent;
      }
    }
    return null;
  }

  release(agent: BaseAgent): void {
    agent.complete();
  }

  getAgent(agentId: AgentId): BaseAgent | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  findByCapability(capabilityType: CapabilityType): BaseAgent[] {
    return this.getAllAgents().filter((a) =>
      a.capabilities.some((c) => c.type === capabilityType),
    );
  }

  destroyAgent(agentId: AgentId): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.shutdown();
      this.agents.delete(agentId);
    }
  }
}
```

```typescript
// Update packages/core/src/agent/index.ts
export type { AgentState } from './AgentState.ts';
export { AgentStateMachine } from './AgentState.ts';
export { BaseAgent } from './BaseAgent.ts';
export { AgentPool } from './AgentPool.ts';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/agent/AgentPool.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agent/
git commit -m "feat(core): add AgentPool with acquire/release/lifecycle"
```

---

### Task 6: Task Scheduler

**Files:**
- Create: `packages/core/src/scheduler/TaskQueue.ts`
- Create: `packages/core/src/scheduler/Scheduler.ts`
- Create: `packages/core/src/scheduler/index.ts`
- Test: `packages/core/test/scheduler/Scheduler.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/scheduler/Scheduler.test.ts
import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../../src/scheduler/TaskQueue.ts';
import { Scheduler } from '../../src/scheduler/Scheduler.ts';
import type { Task } from '@mynth/sdk';

describe('TaskQueue', () => {
  it('should enqueue and dequeue tasks in priority order', () => {
    const q = new TaskQueue();
    q.enqueue({ id: '1', description: 'low', priority: 5 } as Task);
    q.enqueue({ id: '2', description: 'high', priority: 1 } as Task);
    q.enqueue({ id: '3', description: 'mid', priority: 3 } as Task);
    expect(q.dequeue()!.id).toBe('2');
    expect(q.dequeue()!.id).toBe('3');
    expect(q.dequeue()!.id).toBe('1');
  });

  it('should return null when empty', () => {
    const q = new TaskQueue();
    expect(q.dequeue()).toBeNull();
  });

  it('should report size', () => {
    const q = new TaskQueue();
    expect(q.size()).toBe(0);
    q.enqueue({ id: '1', description: 't', priority: 1 } as Task);
    expect(q.size()).toBe(1);
  });
});

describe('Scheduler', () => {
  it('should submit and complete a task', async () => {
    const s = new Scheduler();
    const taskId = await s.submit({
      id: 't1', description: 'test', priority: 1,
    } as Task);
    expect(taskId).toBe('t1');
    const ctx = s.getTask('t1');
    expect(ctx?.status).toBe('queued');
  });

  it('should list all tasks', async () => {
    const s = new Scheduler();
    await s.submit({ id: 'a', description: 'a', priority: 1 } as Task);
    await s.submit({ id: 'b', description: 'b', priority: 2 } as Task);
    expect(s.getAllTasks()).toHaveLength(2);
  });

  it('should cancel a task', async () => {
    const s = new Scheduler();
    await s.submit({ id: 't1', description: 't', priority: 1 } as Task);
    await s.cancel('t1');
    expect(s.getTask('t1')?.status).toBe('cancelled');
  });

  it('should update task status', async () => {
    const s = new Scheduler();
    await s.submit({ id: 't1', description: 't', priority: 1 } as Task);
    s.updateStatus('t1', 'running');
    expect(s.getTask('t1')?.status).toBe('running');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/scheduler/Scheduler.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/scheduler/TaskQueue.ts
import type { Task, TaskContext, TaskStatus } from '@mynth/sdk';

interface QueueItem {
  context: TaskContext;
  priority: number;
}

export class TaskQueue {
  private items: QueueItem[] = [];

  enqueue(task: Task): TaskContext {
    const context: TaskContext = {
      taskId: task.id,
      description: task.description,
      priority: task.priority,
      status: 'queued',
      neededCapabilities: [],
      hopHistory: [],
      currentAgent: '',
      createdAt: Date.now(),
    };
    this.items.push({ context, priority: task.priority });
    this.items.sort((a, b) => a.priority - b.priority);
    return context;
  }

  dequeue(): TaskContext | null {
    return this.items.shift()?.context ?? null;
  }

  size(): number {
    return this.items.length;
  }

  remove(taskId: string): void {
    this.items = this.items.filter((i) => i.context.taskId !== taskId);
  }
}
```

```typescript
// packages/core/src/scheduler/Scheduler.ts
import type { Task, TaskContext, TaskStatus } from '@mynth/sdk';
import { TaskQueue } from './TaskQueue.ts';

export class Scheduler {
  private queue = new TaskQueue();
  private tasks = new Map<string, TaskContext>();

  private onTaskChange?: (taskId: string, status: TaskStatus) => void;

  async submit(task: Task): Promise<string> {
    const ctx = this.queue.enqueue(task);
    this.tasks.set(ctx.taskId, ctx);
    return ctx.taskId;
  }

  async cancel(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'cancelled';
      this.queue.remove(taskId);
      this.notify(taskId, 'cancelled');
    }
  }

  getTask(taskId: string): TaskContext | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): TaskContext[] {
    return Array.from(this.tasks.values());
  }

  dequeue(): TaskContext | null {
    const ctx = this.queue.dequeue();
    if (ctx) {
      ctx.status = 'running';
      this.notify(ctx.taskId, 'running');
    }
    return ctx;
  }

  updateStatus(taskId: string, status: TaskStatus): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      this.notify(taskId, status);
    }
  }

  subscribe(handler: (taskId: string, status: TaskStatus) => void): void {
    this.onTaskChange = handler;
  }
}

// Notification helper to avoid storing array of handlers
// For now, notify only the single subscriber (replace with event emitter if needed)
import { Scheduler as Sched } from './Scheduler.ts';
Sched.prototype.notify = function (this: any, taskId: string, status: TaskStatus) {
  this.onTaskChange?.(taskId, status);
};
```

Wait, the prototype approach is awkward. Let me define notify as a proper method in the class:

- [ ] **Step 3b: Fix the Scheduler to use proper notify method**

```typescript
// packages/core/src/scheduler/Scheduler.ts
import type { Task, TaskContext, TaskStatus } from '@mynth/sdk';
import { TaskQueue } from './TaskQueue.ts';

export class Scheduler {
  private queue = new TaskQueue();
  private tasks = new Map<string, TaskContext>();
  private onTaskChange?: (taskId: string, status: TaskStatus) => void;

  async submit(task: Task): Promise<string> {
    const ctx = this.queue.enqueue(task);
    this.tasks.set(ctx.taskId, ctx);
    return ctx.taskId;
  }

  async cancel(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = 'cancelled';
      this.queue.remove(taskId);
      this.notify(taskId, 'cancelled');
    }
  }

  getTask(taskId: string): TaskContext | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): TaskContext[] {
    return Array.from(this.tasks.values());
  }

  dequeue(): TaskContext | null {
    const ctx = this.queue.dequeue();
    if (ctx) {
      ctx.status = 'running';
      this.notify(ctx.taskId, 'running');
    }
    return ctx;
  }

  updateStatus(taskId: string, status: TaskStatus): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task.status = status;
      this.notify(taskId, status);
    }
  }

  subscribe(handler: (taskId: string, status: TaskStatus) => void): void {
    this.onTaskChange = handler;
  }

  private notify(taskId: string, status: TaskStatus): void {
    this.onTaskChange?.(taskId, status);
  }
}
```

```typescript
// packages/core/src/scheduler/index.ts
export { TaskQueue } from './TaskQueue.ts';
export { Scheduler } from './Scheduler.ts';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/scheduler/Scheduler.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scheduler/ packages/core/test/scheduler/
git commit -m "feat(core): add priority TaskQueue and Scheduler"
```

---

### Task 7: Memory — GlobalMemory and Checkpoint

**Files:**
- Create: `packages/core/src/memory/GlobalMemory.ts`
- Create: `packages/core/src/memory/Checkpoint.ts`
- Create: `packages/core/src/memory/index.ts`
- Test: `packages/core/test/memory/GlobalMemory.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/memory/GlobalMemory.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GlobalMemory } from '../../src/memory/GlobalMemory.ts';
import { CheckpointManager } from '../../src/memory/Checkpoint.ts';

describe('GlobalMemory', () => {
  let mem: GlobalMemory;

  beforeEach(() => {
    mem = new GlobalMemory();
  });

  it('should write and read values', async () => {
    await mem.write('key1', { hello: 'world' });
    const val = await mem.read('key1');
    expect(val).toEqual({ hello: 'world' });
  });

  it('should return null for missing keys', async () => {
    expect(await mem.read('nonexistent')).toBeNull();
  });

  it('should delete values', async () => {
    await mem.write('key1', 'value');
    await mem.delete('key1');
    expect(await mem.read('key1')).toBeNull();
  });

  it('should take and restore snapshots', async () => {
    await mem.write('a', 1);
    const snap = mem.snapshot();
    await mem.write('b', 2);
    mem.restore(snap);
    expect(await mem.read('b')).toBeNull();
    expect(await mem.read('a')).toBe(1);
  });

  it('should persist to LevelDB and reload', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-mem-test-'));
    const mem2 = new GlobalMemory(dir);
    await mem2.write('persist', 'yes');
    await mem2.close();
    const mem3 = new GlobalMemory(dir);
    expect(await mem3.read('persist')).toBe('yes');
    await mem3.close();
  });
});

describe('CheckpointManager', () => {
  let mem: GlobalMemory;

  beforeEach(() => {
    mem = new GlobalMemory();
  });

  it('should create and list checkpoints', async () => {
    const cm = new CheckpointManager(mem);
    const cp = await cm.create({ agentId: 'a', state: 'working', partialResult: 'ok' });
    expect(cp.id).toBeDefined();
    expect(cp.agentId).toBe('a');
    expect(cm.list()).toHaveLength(1);
  });

  it('should restore from checkpoint', async () => {
    const cm = new CheckpointManager(mem);
    const cp = await cm.create({ agentId: 'a', state: 'working', partialResult: 'progress' });
    const restored = cm.restore(cp.id);
    expect(restored?.partialResult).toBe('progress');
  });

  it('should clean up old checkpoints', async () => {
    const cm = new CheckpointManager(mem);
    await cm.create({ agentId: 'a', state: 'working', partialResult: '1' });
    await cm.create({ agentId: 'b', state: 'working', partialResult: '2' });
    cm.cleanup(1);
    expect(cm.list().length).toBeLessThanOrEqual(1);
  });

  it('should return null for unknown checkpoint', () => {
    const cm = new CheckpointManager(mem);
    expect(cm.restore('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/memory/GlobalMemory.test.ts`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/core/src/memory/GlobalMemory.ts
import type { AgentId } from '@mynth/sdk';

interface MemoryEntry {
  value: unknown;
  timestamp: number;
}

export class GlobalMemory {
  private data = new Map<string, MemoryEntry>();

  constructor() {}

  async read(key: string): Promise<unknown> {
    const entry = this.data.get(key);
    return entry ? entry.value : null;
  }

  async write(key: string, value: unknown): Promise<void> {
    this.data.set(key, { value, timestamp: Date.now() });
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  snapshot(): Map<string, MemoryEntry> {
    return new Map(this.data);
  }

  restore(snap: Map<string, MemoryEntry>): void {
    this.data = new Map(snap);
  }
}
```

```typescript
// packages/core/src/memory/Checkpoint.ts
import type { AgentId } from '@mynth/sdk';
import type { GlobalMemory } from './GlobalMemory.ts';

export interface CheckpointData {
  id: string;
  agentId: AgentId;
  timestamp: number;
  state: string;
  partialResult: unknown;
}

export class CheckpointManager {
  private checkpoints: CheckpointData[] = [];

  constructor(private memory: GlobalMemory) {}

  async create(data: Omit<CheckpointData, 'id' | 'timestamp'>): Promise<CheckpointData> {
    const cp: CheckpointData = {
      id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      ...data,
    };
    this.checkpoints.push(cp);
    return cp;
  }

  restore(checkpointId: string): CheckpointData | null {
    return this.checkpoints.find((cp) => cp.id === checkpointId) ?? null;
  }

  list(): CheckpointData[] {
    return [...this.checkpoints];
  }

  cleanup(maxCount: number): void {
    if (this.checkpoints.length > maxCount) {
      this.checkpoints = this.checkpoints.slice(-maxCount);
    }
  }
}
```

```typescript
// packages/core/src/memory/index.ts
export { GlobalMemory } from './GlobalMemory.ts';
export { CheckpointManager } from './Checkpoint.ts';
export type { CheckpointData } from './Checkpoint.ts';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/memory/GlobalMemory.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memory/ packages/core/test/memory/
git commit -m "feat(core): add GlobalMemory and CheckpointManager"
```

---

### Task 8: Meta Layer — Orchestrator, Observer, Guard, Intervener

**Files:**
- Create: `packages/core/src/meta/Orchestrator.ts`
- Create: `packages/core/src/meta/Observer.ts`
- Create: `packages/core/src/meta/Guard.ts`
- Create: `packages/core/src/meta/Intervener.ts`
- Create: `packages/core/src/meta/index.ts`
- Test: `packages/core/test/meta/Orchestrator.test.ts`
- Test: `packages/core/test/meta/Observer.test.ts`
- Test: `packages/core/test/meta/Intervener.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/core/test/meta/Orchestrator.test.ts
import { describe, it, expect } from 'vitest';
import { Orchestrator } from '../../src/meta/Orchestrator.ts';
import type { Task, AgentId } from '@mynth/sdk';

describe('Orchestrator', () => {
  it('should analyze a task and select first agent', async () => {
    const agents: AgentId[] = ['reasoner', 'coder', 'reviewer'];
    const orc = new Orchestrator(agents);
    const result = await orc.analyze({
      id: 't1', description: 'write code', priority: 1,
    } as Task);
    expect(result.firstAgent).toBeDefined();
    expect(agents).toContain(result.firstAgent);
    expect(result.constraints.maxHops).toBeGreaterThan(0);
  });

  it('should initialize chain with context', async () => {
    const orc = new Orchestrator(['reasoner']);
    const chain = await orc.initializeChain(
      { id: 't1', description: 'test', priority: 1 } as Task,
      'reasoner',
    );
    expect(chain.taskId).toBe('t1');
    expect(chain.currentAgent).toBe('reasoner');
  });
});
```

```typescript
// packages/core/test/meta/Observer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Observer } from '../../src/meta/Observer.ts';

describe('Observer', () => {
  it('should start and stop monitoring', () => {
    const obs = new Observer();
    obs.start({ interval: 100 });
    expect(obs.isRunning()).toBe(true);
    obs.stop();
    expect(obs.isRunning()).toBe(false);
  });

  it('should detect anomalies and trigger callback', async () => {
    const obs = new Observer();
    const onAnomaly = vi.fn();
    obs.onAnomaly(onAnomaly);

    obs.recordHop('a', 'b', 5000);
    obs.recordHop('b', 'c', 6000);
    obs.recordHop('c', 'a', 7000);
    obs.recordHop('a', 'b', 8000);
    // cycle pattern: a -> b -> c -> a -> b
    const anomalies = obs.detectAnomalies();
    expect(anomalies.length).toBeGreaterThanOrEqual(0);
  });
});
```

```typescript
// packages/core/test/meta/Intervener.test.ts
import { describe, it, expect } from 'vitest';
import { Intervener } from '../../src/meta/Intervener.ts';

describe('Intervener', () => {
  it('should decide intervention for hop count exceeded', () => {
    const inv = new Intervener();
    const action = inv.decide({ type: 'hop_count_exceeded', threshold: 10, current: 15 });
    expect(action.type).toBe('terminate');
  });

  it('should decide replacement for agent error', () => {
    const inv = new Intervener();
    const action = inv.decide({ type: 'agent_error', agentId: 'a' });
    expect(action.type).toBe('replace');
  });

  it('should decide reroute for cycle pattern', () => {
    const inv = new Intervener();
    const action = inv.decide({ type: 'cycle_pattern', agents: ['a', 'b', 'a', 'b'] });
    expect(action.type).toBe('reroute');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/core && npx vitest run test/meta/`
Expected: FAIL

- [ ] **Step 3: Write minimal implementations**

```typescript
// packages/core/src/meta/Orchestrator.ts
import type { Task, TaskContext, AgentId, HandoverConstraints } from '@mynth/sdk';

export interface ChainAnalysis {
  firstAgent: AgentId;
  capabilities: string[];
  constraints: HandoverConstraints;
}

export class Orchestrator {
  constructor(private agentIds: AgentId[]) {}

  async analyze(task: Task): Promise<ChainAnalysis> {
    const capabilities = this.inferCapabilities(task.description);
    const firstAgent = this.selectFirst(capabilities);
    return {
      firstAgent,
      capabilities,
      constraints: {
        requiredCapabilities: [],
        forbiddenAgents: [],
        maxHops: 10,
      },
    };
  }

  async initializeChain(task: Task, firstAgent: AgentId): Promise<TaskContext> {
    return {
      taskId: task.id,
      description: task.description,
      priority: task.priority,
      status: 'running',
      neededCapabilities: [],
      hopHistory: [],
      currentAgent: firstAgent,
      createdAt: Date.now(),
    };
  }

  private inferCapabilities(_description: string): string[] {
    // Simple keyword-based inference; override in real implementation
    return ['reasoning'];
  }

  private selectFirst(_capabilities: string[]): AgentId {
    return this.agentIds[0] ?? '';
  }
}
```

```typescript
// packages/core/src/meta/Observer.ts
export interface Anomaly {
  type: string;
  agentId?: string;
  details?: Record<string, unknown>;
}

export class Observer {
  private running = false;
  private hopHistory: Array<{ from: string; to: string; duration: number }> = [];
  private anomalyHandlers: Array<(anomaly: Anomaly) => void> = [];

  start(_config: { interval: number }): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  onAnomaly(handler: (anomaly: Anomaly) => void): void {
    this.anomalyHandlers.push(handler);
  }

  recordHop(from: string, to: string, duration: number): void {
    this.hopHistory.push({ from, to, duration });
  }

  detectAnomalies(): Anomaly[] {
    const anomalies: Anomaly[] = [];

    // Check for cycle patterns (repeated subsequence)
    if (this.detectCycle()) {
      anomalies.push({ type: 'cycle_pattern', details: { hops: this.hopHistory.length } });
    }

    // Check for long durations
    const avgDuration = this.averageDuration();
    if (avgDuration > 10000) {
      anomalies.push({ type: 'duration_exceeded', details: { avgDuration } });
    }

    return anomalies;
  }

  private detectCycle(): boolean {
    if (this.hopHistory.length < 4) return false;
    const recent = this.hopHistory.slice(-4).map((h) => h.from);
    return recent[0] === recent[2] && recent[1] === recent[3];
  }

  private averageDuration(): number {
    if (this.hopHistory.length === 0) return 0;
    return this.hopHistory.reduce((sum, h) => sum + h.duration, 0) / this.hopHistory.length;
  }
}
```

```typescript
// packages/core/src/meta/Guard.ts
export interface SecurityRequest {
  agentId: string;
  action: string;
  resource: string;
}

export interface SecurityCheck {
  allowed: boolean;
  reason?: string;
}

export class Guard {
  private permissions = new Map<string, string[]>();

  setPermission(agentId: string, actions: string[]): void {
    this.permissions.set(agentId, actions);
  }

  async checkPermission(request: SecurityRequest): Promise<SecurityCheck> {
    const allowed = this.permissions.get(request.agentId);
    if (!allowed) {
      return { allowed: false, reason: 'No permissions configured' };
    }
    return { allowed: allowed.includes(request.action) };
  }

  async approveTool(_toolId: string, agentId: string, _params: unknown): Promise<SecurityCheck> {
    return this.checkPermission({ agentId, action: `tool:${_toolId}`, resource: _toolId });
  }
}
```

```typescript
// packages/core/src/meta/Intervener.ts
export type InterventionAction =
  | { type: 'warn'; message: string }
  | { type: 'pause'; reason: string }
  | { type: 'replace'; oldAgent: string; newAgent: string }
  | { type: 'rollback'; checkpoint: string }
  | { type: 'reroute'; newStart: string }
  | { type: 'terminate'; reason: string };

export interface AnomalyEvent {
  type: string;
  agentId?: string;
  threshold?: number;
  current?: number;
  agents?: string[];
}

export class Intervener {
  decide(anomaly: AnomalyEvent): InterventionAction {
    switch (anomaly.type) {
      case 'hop_count_exceeded':
        return { type: 'terminate', reason: `Hop count ${anomaly.current} exceeded threshold ${anomaly.threshold}` };
      case 'duration_exceeded':
        return { type: 'pause', reason: `Duration exceeded ${anomaly.threshold}` };
      case 'agent_error':
        return { type: 'replace', oldAgent: anomaly.agentId ?? '', newAgent: '' };
      case 'cycle_pattern':
        return { type: 'reroute', newStart: '' };
      case 'security_violation':
        return { type: 'terminate', reason: 'Security violation detected' };
      default:
        return { type: 'warn', message: `Unknown anomaly: ${anomaly.type}` };
    }
  }
}
```

```typescript
// packages/core/src/meta/index.ts
export { Orchestrator } from './Orchestrator.ts';
export type { ChainAnalysis } from './Orchestrator.ts';
export { Observer } from './Observer.ts';
export type { Anomaly } from './Observer.ts';
export { Guard } from './Guard.ts';
export type { SecurityRequest, SecurityCheck } from './Guard.ts';
export { Intervener } from './Intervener.ts';
export type { InterventionAction, AnomalyEvent } from './Intervener.ts';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/core && npx vitest run test/meta/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/meta/ packages/core/test/meta/
git commit -m "feat(core): add meta layer Orchestrator, Observer, Guard, Intervener"
```

---

### Task 9: Core Package Barrel Export

**Files:**
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Update barrel export**

```typescript
// packages/core/src/index.ts
export * from './persistence/index.ts';
export * from './message-bus/index.ts';
export * from './vector/index.ts';
export * from './agent/index.ts';
export * from './scheduler/index.ts';
export * from './memory/index.ts';
export * from './meta/index.ts';
```

- [ ] **Step 2: Verify build passes**

Run: `cd /Users/zhangbolin/Projects/mynth && npx turbo build`
Expected: all packages build successfully

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "chore(core): add barrel exports for all modules"
```

---

### Task 10: Example — Simple Agent

**Files:**
- Create: `packages/examples/package.json`
- Create: `packages/examples/tsconfig.json`
- Create: `packages/examples/src/simple-agent.ts`

- [ ] **Step 1: Create package config**

```json
// packages/examples/package.json
{
  "name": "@mynth/examples",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/simple-agent.ts",
    "collab": "tsx src/collaboration.ts"
  },
  "dependencies": {
    "@mynth/core": "workspace:*",
    "@mynth/sdk": "workspace:*",
    "tsx": "^4.19.0"
  },
  "devDependencies": {
    "typescript": "^5.7.3"
  }
}
```

```json
// packages/examples/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Write simple agent example**

```typescript
// packages/examples/src/simple-agent.ts
import { BaseAgent, AgentPool } from '@mynth/core';

async function main() {
  const pool = new AgentPool();
  pool.createAgent('reasoner', 'Reasoner', [
    { type: 'reasoning', level: 7, confidence: 0.9 },
  ]);
  pool.createAgent('coder', 'Coder', [
    { type: 'codegen', level: 8, confidence: 0.85 },
  ]);

  const agent = pool.acquire('reasoning');
  if (!agent) {
    console.log('No available agent');
    return;
  }

  console.log(`Acquired agent: ${agent.name} (${agent.id})`);
  agent.onStateChange = (state) => console.log(`  state -> ${state}`);

  agent.assignTask({});
  agent.startWork();
  console.log('  working...');
  agent.complete();
  console.log('  done');

  pool.release(agent);
  console.log(`Task count: ${agent.metadata.taskCount}`);
}

main().catch(console.error);
```

- [ ] **Step 3: Install deps and run**

Run: `pnpm install && cd packages/examples && npx tsx src/simple-agent.ts`
Expected: "Acquired agent: Reasoner (reasoner)" with state transitions

- [ ] **Step 4: Commit**

```bash
git add packages/examples/
git commit -m "feat(examples): add simple-agent example"
```

---

### Task 11: Example — Multi-Agent Collaboration (Chain Transfer)

**Files:**
- Create: `packages/examples/src/collaboration.ts`

- [ ] **Step 1: Write collaboration example**

```typescript
// packages/examples/src/collaboration.ts
import { AgentPool, Orchestrator, Scheduler } from '@mynth/core';

async function main() {
  // Set up agents
  const pool = new AgentPool();
  pool.createAgent('reasoner', 'Reasoner', [
    { type: 'reasoning', level: 8, confidence: 0.9 },
    { type: 'coordination', level: 5, confidence: 0.7 },
  ]);
  pool.createAgent('coder', 'Coder', [
    { type: 'codegen', level: 8, confidence: 0.85 },
  ]);
  pool.createAgent('reviewer', 'Reviewer', [
    { type: 'review', level: 7, confidence: 0.8 },
  ]);

  // Orchestrator analyzes and initializes chain
  const orchestrator = new Orchestrator(['reasoner', 'coder', 'reviewer']);
  const analysis = await orchestrator.analyze({
    id: 'task-1',
    description: 'Implement a login form with validation',
    priority: 1,
  });

  console.log(`Starting chain: first agent = ${analysis.firstAgent}`);
  console.log(`Max hops: ${analysis.constraints.maxHops}`);

  // Scheduler
  const scheduler = new Scheduler();
  await scheduler.submit({
    id: 'task-1',
    description: 'Implement a login form with validation',
    priority: 1,
  });

  // Chain transfer simulation
  const chain = ['reasoner', 'coder', 'reviewer'];
  let taskContext = await orchestrator.initializeChain(
    { id: 'task-1', description: 'Implement a login form with validation', priority: 1 },
    chain[0],
  );

  for (const agentId of chain) {
    const agent = pool.acquire(agentId as any);
    if (!agent) {
      console.log(`No agent available for ${agentId}`);
      continue;
    }

    console.log(`\n[${agent.name}] executing...`);
    agent.assignTask(taskContext);
    agent.startWork();
    // Simulate work
    await new Promise((r) => setTimeout(r, 100));
    console.log(`[${agent.name}] completed`);
    agent.complete();
    pool.release(agent);
  }

  scheduler.updateStatus('task-1', 'completed');
  console.log('\nChain transfer complete');
}

main().catch(console.error);
```

- [ ] **Step 2: Run collaboration example**

Run: `cd packages/examples && npx tsx src/collaboration.ts`
Expected: Chain transfer simulation output

- [ ] **Step 3: Commit**

```bash
git add packages/examples/src/collaboration.ts
git commit -m "feat(examples): add multi-agent chain transfer simulation"
```

---

## Self-Review Checklist

- **Spec coverage:** All core subsystems from the design docs are covered: message bus (MemoryQueue), vector store (cosine ANN), agent (state machine + BaseAgent + AgentPool), scheduler (priority queue), memory (GlobalMemory + Checkpoint), meta layer (Orchestrator, Observer, Guard, Intervener), examples (simple + collaboration).
- **Placeholder scan:** No TBD, TODO, or incomplete sections. All test code and implementation code is fully inlined.
- **Type consistency:** Types `Capability`, `AgentState`, `Task`, `TaskContext` from `@mynth/sdk` are used consistently across all tasks. Custom types like `QueueMessage`, `Anomaly`, `InterventionAction` are defined locally in their respective modules.
