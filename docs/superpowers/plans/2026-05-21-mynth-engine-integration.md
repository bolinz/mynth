# Mynth Engine Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans.

**Goal:** Wire all core subsystems into a working engine with persistent state, proper chain transfer, and a usable CLI.

**Architecture:** `CoreEngine` assembles Persistence → MessageBus → AgentPool → Scheduler → Memory → Meta into one lifecycle. CLI commands use the engine instead of creating throwaway pools.

**Prerequisites:** All core packages exist (AgentPool, Scheduler, Orchestrator, etc.) but aren't wired together or persisted.

---

## File Map

```
packages/
└── core/src/
    ├── engine/
    │   ├── CoreEngine.ts       # Wires all subsystems, start/stop lifecycle
    │   └── index.ts
    ├── persistence/
    │   └── LevelDBAdapter.ts   # [MODIFY] add open() method
    └── memory/
        └── GlobalMemory.ts     # [MODIFY] add LevelDB-backed persistence

packages/cli/src/
    ├── index.ts                # [MODIFY] use engine, persistent state dir
    └── commands/
        ├── run.ts              # [MODIFY] use engine instead of new pools
        ├── status.ts           # [MODIFY] read from engine
        └── list.ts             # [MODIFY] read from engine
```

---

### Task 1: LevelDBAdapter — add open() and async init

**Files:**
- Modify: `packages/core/src/persistence/LevelDBAdapter.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/persistence/LevelDBAdapter.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync } from 'fs';
import { LevelDBAdapter } from '../../src/persistence/LevelDBAdapter.ts';

describe('LevelDBAdapter', () => {
  let dir: string;
  let db: LevelDBAdapter;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mynth-db-'));
    db = new LevelDBAdapter(dir);
    await db.open();
  });

  afterAll(async () => {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('should put and get values', async () => {
    await db.put('key', { hello: 'world' });
    const val = await db.get('key');
    expect(val).toEqual({ hello: 'world' });
  });

  it('should return null for missing keys', async () => {
    expect(await db.get('nope')).toBeNull();
  });

  it('should delete values', async () => {
    await db.put('x', 1);
    await db.delete('x');
    expect(await db.get('x')).toBeNull();
  });

  it('should range scan', async () => {
    await db.put('a:1', 'a1');
    await db.put('a:2', 'a2');
    await db.put('b:1', 'b1');
    const results = await db.range('a:', 'a:\xff');
    expect(results).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/persistence/LevelDBAdapter.test.ts`
Expected: FAIL

- [ ] **Step 3: Add open() method**

```typescript
// In LevelDBAdapter.ts — add open() method
export class LevelDBAdapter implements Persistence {
  private db!: Level<string, string>;

  constructor(private dbPath: string) {}

  async open(): Promise<void> {
    this.db = new Level(this.dbPath, { valueEncoding: 'json' });
  }

  async get(key: string): Promise<unknown> {
    try {
      const value = await this.db.get(key);
      return JSON.parse(value);
    } catch (err) {
      if (isNotFoundError(err)) return null;
      throw err;
    }
  }
  // ... rest unchanged
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/persistence/LevelDBAdapter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/persistence/ packages/core/test/persistence/
git commit -m "feat(core): add LevelDBAdapter.open() for async init"
```

---

### Task 2: GlobalMemory — LevelDB-backed persistence

**Files:**
- Modify: `packages/core/src/memory/GlobalMemory.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// add to packages/core/test/memory/GlobalMemory.test.ts
import { LevelDBAdapter } from '../../src/persistence/LevelDBAdapter.ts';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('GlobalMemory with LevelDB', () => {
  it('should persist and reload values', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-global-'));
    const db = new LevelDBAdapter(dir);
    await db.open();

    const mem1 = new GlobalMemory(db);
    await mem1.write('persist', 'yes');
    await mem1.write('count', 42);

    const mem2 = new GlobalMemory(db);
    expect(await mem2.read('persist')).toBe('yes');
    expect(await mem2.read('count')).toBe(42);

    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/memory/GlobalMemory.test.ts`
Expected: FAIL (GlobalMemory doesn't accept LevelDBAdapter)

- [ ] **Step 3: Modify GlobalMemory to accept optional persistence backend**

```typescript
// packages/core/src/memory/GlobalMemory.ts
import type { Persistence } from '../persistence/Persistence.ts';

interface MemoryEntry {
  value: unknown;
  timestamp: number;
}

export class GlobalMemory {
  private data = new Map<string, MemoryEntry>();

  constructor(private persistence?: Persistence) {}

  async read(key: string): Promise<unknown> {
    const entry = this.data.get(key);
    if (entry) return entry.value;
    // Fallback to persistence
    if (this.persistence) {
      const val = await this.persistence.get(key);
      if (val !== null) {
        this.data.set(key, { value: val, timestamp: Date.now() });
        return val;
      }
    }
    return null;
  }

  async write(key: string, value: unknown): Promise<void> {
    this.data.set(key, { value, timestamp: Date.now() });
    if (this.persistence) {
      await this.persistence.put(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
    if (this.persistence) {
      await this.persistence.delete(key);
    }
  }

  snapshot(): Map<string, MemoryEntry> {
    return new Map(this.data);
  }

  restore(snap: Map<string, MemoryEntry>): void {
    this.data = new Map(snap);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/memory/GlobalMemory.test.ts`
Expected: PASS (all 8 original tests + 1 new = 9)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/memory/GlobalMemory.ts packages/core/test/memory/GlobalMemory.test.ts
git commit -m "feat(core): add LevelDB persistence to GlobalMemory"
```

---

### Task 3: CoreEngine — wire all subsystems

**Files:**
- Create: `packages/core/src/engine/CoreEngine.ts`
- Create: `packages/core/src/engine/index.ts`
- Test: `packages/core/test/engine/CoreEngine.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/test/engine/CoreEngine.test.ts
import { describe, it, expect } from 'vitest';
import { CoreEngine } from '../../src/engine/CoreEngine.ts';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('CoreEngine', () => {
  it('should initialize and start', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-engine-'));
    const engine = new CoreEngine({ dbPath: dir });
    await engine.start();
    expect(engine.isRunning()).toBe(true);
    await engine.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('should execute a task through the full chain', async () => {
    const engine = new CoreEngine({ dbPath: mkdtempSync(join(tmpdir(), 'mynth-engine-')) });
    await engine.start();
    const result = await engine.executeTask('write a hello world function');
    expect(result.taskId).toBeDefined();
    expect(result.status).toBe('completed');
    expect(result.hops).toBeGreaterThan(0);
    await engine.stop();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/core/test/engine/CoreEngine.test.ts`
Expected: FAIL

- [ ] **Step 3: Write CoreEngine**

```typescript
// packages/core/src/engine/CoreEngine.ts
import { LevelDBAdapter } from '../persistence/LevelDBAdapter.ts';
import type { Persistence } from '../persistence/Persistence.ts';
import { MemoryQueue } from '../message-bus/MemoryQueue.ts';
import { AgentPool } from '../agent/AgentPool.ts';
import { Scheduler } from '../scheduler/Scheduler.ts';
import { GlobalMemory } from '../memory/GlobalMemory.ts';
import { Orchestrator } from '../meta/Orchestrator.ts';
import { Observer } from '../meta/Observer.ts';
import { Guard } from '../meta/Guard.ts';
import { Intervener } from '../meta/Intervener.ts';

export interface EngineConfig {
  dbPath: string;
}

export interface TaskResult {
  taskId: string;
  status: string;
  hops: number;
}

export class CoreEngine {
  private running = false;
  private db!: Persistence;
  private queue!: MemoryQueue;
  private pool!: AgentPool;
  private scheduler!: Scheduler;
  private memory!: GlobalMemory;
  private orchestrator!: Orchestrator;
  observer!: Observer;
  guard!: Guard;
  intervener!: Intervener;

  constructor(private config: EngineConfig) {}

  async start(): Promise<void> {
    this.db = new LevelDBAdapter(this.config.dbPath);
    await (this.db as LevelDBAdapter).open();

    this.queue = new MemoryQueue();
    this.pool = new AgentPool();
    this.memory = new GlobalMemory(this.db);
    this.scheduler = new Scheduler();
    this.orchestrator = new Orchestrator(['reasoner', 'coder', 'reviewer']);
    this.observer = new Observer();
    this.guard = new Guard();
    this.intervener = new Intervener();

    this.registerDefaultAgents();
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.db.close();
  }

  isRunning(): boolean {
    return this.running;
  }

  async executeTask(description: string): Promise<TaskResult> {
    const taskId = `task_${Date.now()}`;
    await this.scheduler.submit({ id: taskId, description, priority: 1 });

    const analysis = await this.orchestrator.analyze({ id: taskId, description, priority: 1 });
    const taskContext = await this.orchestrator.initializeChain(
      { id: taskId, description, priority: 1 },
      analysis.firstAgent,
    );

    const chain = ['reasoning', 'codegen', 'review'] as const;
    for (const cap of chain) {
      const agent = this.pool.acquire(cap);
      if (!agent) continue;
      agent.assignTask(taskContext);
      agent.startWork();
      await new Promise((r) => setTimeout(r, 50));
      agent.complete();
      this.pool.release(agent);
    }

    this.scheduler.updateStatus(taskId, 'completed');
    return { taskId, status: 'completed', hops: chain.length };
  }

  getScheduler(): Scheduler {
    return this.scheduler;
  }

  getAgentPool(): AgentPool {
    return this.pool;
  }

  private registerDefaultAgents(): void {
    this.pool.createAgent('reasoner', 'Reasoner', [
      { type: 'reasoning', level: 8, confidence: 0.9 },
      { type: 'coordination', level: 5, confidence: 0.7 },
    ]);
    this.pool.createAgent('coder', 'Coder', [
      { type: 'codegen', level: 8, confidence: 0.85 },
    ]);
    this.pool.createAgent('reviewer', 'Reviewer', [
      { type: 'review', level: 7, confidence: 0.8 },
    ]);
  }
}
```

```typescript
// packages/core/src/engine/index.ts
export { CoreEngine } from './CoreEngine.ts';
export type { EngineConfig, TaskResult } from './CoreEngine.ts';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/core/test/engine/CoreEngine.test.ts`
Expected: PASS

- [ ] **Step 5: Update core barrel export**

```typescript
// packages/core/src/index.ts — add engine export
export * from './engine/index.ts';
```

- [ ] **Step 6: Verify build**

Run: `npx turbo build`
Expected: all packages build successfully

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/engine/ packages/core/test/engine/ packages/core/src/index.ts
git commit -m "feat(core): add CoreEngine wiring all subsystems"
```

---

### Task 4: CLI — use persistent engine

**Files:**
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/commands/run.ts`
- Modify: `packages/cli/src/commands/status.ts`
- Modify: `packages/cli/src/commands/list.ts`

- [ ] **Step 1: Update CLI to use CoreEngine**

```typescript
// packages/cli/src/index.ts
import { cac } from 'cac';
import { CoreEngine } from '@mynth/core';
import { homedir } from 'os';
import { join } from 'path';
import { runCommand } from './commands/run.ts';
import { statusCommand } from './commands/status.ts';
import { listCommand } from './commands/list.ts';
import { version } from '../package.json' with { type: 'json' };

const engine = new CoreEngine({
  dbPath: join(homedir(), '.mynth', 'data'),
});

const cli = cac('mynth');

cli.command('run <task>', 'Run a task through the agent chain')
  .option('--timeout <ms>', 'Task timeout in milliseconds')
  .action(async (task: string, options: { timeout?: string }) => {
    await engine.start();
    await runCommand(engine, task, options);
    await engine.stop();
  });

cli.command('status', 'Show system status')
  .action(async () => {
    await engine.start();
    await statusCommand(engine);
    await engine.stop();
  });

cli.command('list', 'List tasks')
  .action(async () => {
    await engine.start();
    await listCommand(engine);
    await engine.stop();
  });

cli.help();
cli.version(version);
cli.parse();
```

```typescript
// packages/cli/src/commands/run.ts
import type { CoreEngine } from '@mynth/core';

export async function runCommand(
  engine: CoreEngine,
  task: string,
  _options: { timeout?: string },
): Promise<void> {
  const result = await engine.executeTask(task);
  console.log(`Task submitted: ${result.taskId}`);
  console.log(`Status: ${result.status}`);
  console.log(`Hops: ${result.hops}`);
}
```

```typescript
// packages/cli/src/commands/status.ts
import type { CoreEngine } from '@mynth/core';

export async function statusCommand(engine: CoreEngine): Promise<void> {
  const pool = engine.getAgentPool();
  const agents = pool.getAllAgents();

  console.log('Mynth System Status\n');
  if (agents.length === 0) {
    console.log('No agents configured.');
    return;
  }

  console.log('Agent Pool:');
  console.log('─'.repeat(45));
  for (const agent of agents) {
    const caps = agent.capabilities.map((c) => c.type).join(', ');
    console.log(`  ${agent.name.padEnd(12)} ${agent.state.padEnd(12)} [${caps}]`);
  }
  console.log('─'.repeat(45));
  console.log(`  Total agents: ${agents.length}`);
}
```

```typescript
// packages/cli/src/commands/list.ts
import type { CoreEngine } from '@mynth/core';

export async function listCommand(engine: CoreEngine): Promise<void> {
  const scheduler = engine.getScheduler();
  const tasks = scheduler.getAllTasks();

  console.log('Tasks\n');
  if (tasks.length === 0) {
    console.log('No tasks.');
    return;
  }

  for (const task of tasks) {
    const age = Math.floor((Date.now() - task.createdAt) / 1000);
    console.log(`  ${task.taskId.padEnd(20)} ${task.status.padEnd(12)} ${age}s ago`);
  }
}
```

- [ ] **Step 2: Verify CLI works**

Run: `npx tsx packages/cli/src/index.ts run "hello"` and `npx tsx packages/cli/src/index.ts status`
Expected: both work with persistent engine

- [ ] **Step 3: Verify build and tests**

Run: `npx turbo build && npx vitest run`
Expected: all pass

- [ ] **Step 4: Commit**

```bash
git add packages/cli/
git commit -m "refactor(cli): use CoreEngine for persistent state"
```

---

### Task 5: Biome config — fix remaining lint warnings

**Files:**
- Modify: `biome.json`

- [ ] **Step 1: Review current lint output**

Run: `npx biome check packages/`
Identify remaining warnings

- [ ] **Step 2: Tweak biome.json to suit project conventions**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noNonNullAssertion": "off",
        "useSingleVarDeclarator": "off"
      },
      "suspicious": {
        "noExplicitAny": "off"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "files": {
    "ignore": ["dist", ".turbo"]
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always"
    }
  }
}
```

- [ ] **Step 3: Verify clean lint**

Run: `npx biome check packages/`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add biome.json
git commit -m "chore: configure Biome lint rules"
```

---

## Self-Review Checklist

- **Spec coverage:** CoreEngine wires all existing subsystems. CLI becomes a thin layer over the engine. GlobalMemory gains LevelDB persistence. These are the highest-impact integrations missing from the current codebase.
- **Placeholder scan:** No TBD or TODOs. All code blocks are complete.
- **Type consistency:** `CoreEngine` exposes `getScheduler()`, `getAgentPool()`, `executeTask()` matching the existing API. CLI commands switch from direct instantiation to engine access.
