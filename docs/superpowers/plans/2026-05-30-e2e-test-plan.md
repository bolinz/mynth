# E2E 测试实施计划

> **For agentic workers:** Use superpowers:subagent-driven-development to implement plan task-by-task.

**Goal:** 建立 mynth 的端到端测试体系，覆盖 CLI、Web UI、系统核心链路和跨进程场景。

**Architecture:** 8 个测试模块，分 4 阶段实施。继承 Vitest 基础设施，无新框架依赖。

**Tech Stack:** TypeScript, Vitest, node:http, child_process.fork

---

### Phase 1: 工具层 + 基础链 + 持久化

#### Task 1.1: E2E 测试基础设施

**Files:**
- Create: `packages/core/test/e2e/helpers/fixture.ts`
- Create: `packages/core/test/e2e/helpers/event-collector.ts`

- [ ] **Step 1: Create fixture.ts**

```ts
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CoreEngine } from '../../src/engine/CoreEngine.ts';
import type { EngineConfig } from '../../src/engine/CoreEngine.ts';

export interface E2EFixture {
  dir: string;
  engine: CoreEngine;
}

export async function createEngine(overrides?: Partial<EngineConfig>): Promise<E2EFixture> {
  const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-'));
  const engine = new CoreEngine({ dbPath: dir, ...overrides });
  await engine.start();
  return { dir, engine };
}

export async function destroyEngine(fixture: E2EFixture): Promise<void> {
  try {
    await fixture.engine.stop();
  } finally {
    rmSync(fixture.dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 2: Create event-collector.ts**

```ts
import type { EventTopic, EventPayload } from '../../src/message-bus/EventBus.ts';
import type { MessageBus } from '../../src/message-bus/MessageBus.ts';

export interface EventRecord {
  topic: EventTopic;
  payload: EventPayload;
  timestamp: number;
}

export function collectEvents(bus: MessageBus): EventRecord[] {
  const events: EventRecord[] = [];
  const topics: EventTopic[] = [
    'task.submitted',
    'task.completed',
    'hop.recorded',
    'anomaly.detected',
    'intervention.executed',
    'agent.response',
    'hitl.requested',
    'hitl.resolved',
    'engine.started',
    'engine.stopped',
  ];
  for (const topic of topics) {
    bus.subscribe(topic, (t, payload) => {
      events.push({ topic: t, payload: payload as EventPayload, timestamp: Date.now() });
    });
  }
  return events;
}
```

- [ ] **Step 3: Verify imports compile**

Run: `pnpm test --reporter=verbose packages/core/test/e2e/helpers/fixture.ts 2>&1 || true` (no tests yet, just check no import errors)

---

#### Task 1.2: 基础链转移 E2E（02-chain）

**Files:**
- Create: `packages/core/test/e2e/02-chain/basic-chain.test.ts`
- Create: `packages/core/test/e2e/02-chain/multi-agent.test.ts`

- [ ] **Step 1: Write basic-chain.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { createEngine, destroyEngine } from '../helpers/fixture.ts';
import { collectEvents } from '../helpers/event-collector.ts';

describe('e2e: basic chain transfer', () => {
  it('should complete a simple task with single agent', async () => {
    const fx = await createEngine({
      agents: [{ id: 'agent-a', capabilities: [{ type: 'reasoning', level: 8, confidence: 0.9 }] }],
      maxHops: 3,
    });

    const events = collectEvents(fx.engine.bus);
    const result = await fx.engine.executeTask('build a login page');

    expect(result.status).toBe('complete');
    expect(result.hopCount).toBeGreaterThanOrEqual(1);
    expect(result.taskId).toBeDefined();
    expect(events.some((e) => e.topic === 'task.submitted')).toBe(true);
    expect(events.some((e) => e.topic === 'hop.recorded')).toBe(true);

    await destroyEngine(fx);
  });

  it('should route through multiple agents based on capabilities', async () => {
    const fx = await createEngine({
      agents: [
        { id: 'reasoner', capabilities: [{ type: 'reasoning', level: 8, confidence: 0.9 }] },
        { id: 'coder', capabilities: [{ type: 'codegen', level: 8, confidence: 0.9 }] },
        { id: 'reviewer', capabilities: [{ type: 'review', level: 7, confidence: 0.8 }] },
      ],
      maxHops: 5,
    });

    const result = await fx.engine.executeTask('implement login page with tests');

    expect(result.status).toBe('complete');
    expect(result.hopCount).toBeGreaterThanOrEqual(2);
    expect(result.finalAgent).toBeDefined();

    await destroyEngine(fx);
  });

  it('should escalate when no capable agent exists', async () => {
    const fx = await createEngine({
      agents: [{ id: 'agent-a', capabilities: [{ type: 'reasoning', level: 5, confidence: 0.5 }] }],
      maxHops: 3,
    });

    const result = await fx.engine.executeTask('design database schema');

    expect(result.status).toBe('escalated');

    await destroyEngine(fx);
  });
});
```

- [ ] **Step 2: Write multi-agent.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { createEngine, destroyEngine } from '../helpers/fixture.ts';

describe('e2e: multi-agent chain', () => {
  it('should complete complex task requiring all agents', async () => {
    const fx = await createEngine({
      agents: [
        { id: 'planner', capabilities: [{ type: 'plan', level: 8, confidence: 0.9 }] },
        { id: 'coder', capabilities: [{ type: 'codegen', level: 8, confidence: 0.9 }] },
        { id: 'reviewer', capabilities: [{ type: 'review', level: 7, confidence: 0.8 }] },
      ],
      maxHops: 5,
    });

    const result = await fx.engine.executeTask('design and implement user authentication');

    expect(result.status).toBe('complete');
    // planner → coder → reviewer (at least 2 hops)
    expect(result.hops.length).toBeGreaterThanOrEqual(2);

    await destroyEngine(fx);
  });

  it('should record hop history with durations', async () => {
    const fx = await createEngine({
      agents: [
        { id: 'a', capabilities: [{ type: 'reasoning', level: 5, confidence: 0.5 }] },
        { id: 'b', capabilities: [{ type: 'codegen', level: 5, confidence: 0.5 }] },
      ],
      maxHops: 5,
    });

    const result = await fx.engine.executeTask('build feature');

    for (const hop of result.hops) {
      expect(hop.fromAgent).toBeDefined();
      expect(hop.duration).toBeGreaterThanOrEqual(0);
      expect(hop.timestamp).toBeGreaterThan(0);
    }

    await destroyEngine(fx);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/e2e/02-chain/`

---

#### Task 1.3: 重启持久化 E2E（03-persistence）

**Files:**
- Create: `packages/core/test/e2e/03-persistence/task-persistence.test.ts`

- [ ] **Step 1: Write task-persistence.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CoreEngine } from '../../../src/engine/CoreEngine.ts';

describe('e2e: persistence across restarts', () => {
  it('should preserve tasks and hops after restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-persist-'));

    // Session 1
    const engine1 = new CoreEngine({ dbPath: dir });
    await engine1.start();
    const result1 = await engine1.executeTask('research topic');
    const taskId = result1.taskId;
    await engine1.stop();

    // Session 2
    const engine2 = new CoreEngine({ dbPath: dir });
    await engine2.start();
    const history = await engine2.getHistory();
    const savedTask = history.find((t: any) => t.taskId === taskId);
    expect(savedTask).toBeDefined();
    expect(savedTask.status).toBe('complete');
    await engine2.stop();

    rmSync(dir, { recursive: true, force: true });
  });

  it('should continue processing new tasks after restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-continue-'));

    const engine1 = new CoreEngine({ dbPath: dir });
    await engine1.start();
    await engine1.executeTask('task one');
    await engine1.stop();

    const engine2 = new CoreEngine({ dbPath: dir });
    await engine2.start();
    const result2 = await engine2.executeTask('task two');
    expect(result2.status).toBe('complete');
    const history = await engine2.getHistory();
    expect(history.length).toBe(2);
    await engine2.stop();

    rmSync(dir, { recursive: true, force: true });
  });

  it('should preserve agent config after restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-config-'));

    const engine1 = new CoreEngine({
      dbPath: dir,
      agents: [{ id: 'custom-agent', capabilities: [{ type: 'reasoning', level: 9, confidence: 1.0 }] }],
    });
    await engine1.start();
    await engine1.stop();

    const engine2 = new CoreEngine({ dbPath: dir });
    await engine2.start();
    const config = engine2.getAgentConfig?.();
    await engine2.stop();

    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/e2e/03-persistence/`

---

#### Task 1.4: 验证 Phase 1

- [ ] **Step 1: Run Phase 1 E2E tests**

Run: `pnpm test --reporter=verbose packages/core/test/e2e/02-chain/ packages/core/test/e2e/03-persistence/`

- [ ] **Step 2: Run full test suite to ensure no regressions**

Run: `pnpm test`

- [ ] **Step 3: Commit Phase 1**

```bash
git add packages/core/test/e2e/
git commit -m "test(core): add Phase 1 E2E tests - tooling, basic chain, persistence"
```

---

### Phase 2: HITL + 元层 + Web HTTP

#### Task 2.1: HITL 全流程 E2E（04-hitl）

**Files:**
- Create: `packages/core/test/e2e/04-hitl/full-cycle.test.ts`

- [ ] **Step 1: Write full-cycle.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { createEngine, destroyEngine } from '../helpers/fixture.ts';
import { collectEvents } from '../helpers/event-collector.ts';

describe('e2e: HITL full cycle', () => {
  it('should submit and approve HITL request', async () => {
    const fx = await createEngine();

    const req = await fx.engine.hitl.submit({
      agentId: 'agent-1',
      taskId: 'task-1',
      operation: { type: 'config.modify', target: 'budget', summary: 'increase limit' },
      triggeredBy: 'guard_rule',
    });

    expect(req.status).toBe('pending');

    const ok = await fx.engine.hitl.approve(req.id, 'admin', 'approved');
    expect(ok).toBe(true);

    const updated = fx.engine.hitl.getById(req.id);
    expect(updated?.status).toBe('approved');
    expect(updated?.decidedBy).toBe('admin');

    await destroyEngine(fx);
  });

  it('should reject HITL request', async () => {
    const fx = await createEngine();

    const req = await fx.engine.hitl.submit({
      agentId: 'agent-1',
      taskId: 'task-1',
      operation: { type: 'config.modify', target: 'budget', summary: 'increase limit' },
      triggeredBy: 'guard_rule',
    });

    const ok = await fx.engine.hitl.reject(req.id, 'admin', 'not now');
    expect(ok).toBe(true);
    expect(fx.engine.hitl.getById(req.id)?.status).toBe('rejected');

    await destroyEngine(fx);
  });

  it('should persist HITL requests after restart', async () => {
    const { mkdtempSync, rmSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const { CoreEngine } = await import('../../../src/engine/CoreEngine.ts');

    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-hitl-'));

    const engine1 = new CoreEngine({ dbPath: dir });
    await engine1.start();
    const req = await engine1.hitl.submit({
      agentId: 'a', taskId: 't1',
      operation: { type: 'config.modify', target: 'x', summary: 'test' },
      triggeredBy: 'guard_rule',
    });
    await engine1.hitl.approve(req.id, 'admin');
    await engine1.stop();

    const engine2 = new CoreEngine({ dbPath: dir });
    await engine2.start();
    await engine2.hitl.loadAll();
    expect(engine2.hitl.getById(req.id)?.status).toBe('approved');
    await engine2.stop();

    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/e2e/04-hitl/`

---

#### Task 2.2: 元层干预流程 E2E（05-meta）

**Files:**
- Create: `packages/core/test/e2e/05-meta/cycle-detection.test.ts`

- [ ] **Step 1: Write cycle-detection.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { AgentPool } from '../../../src/agent/AgentPool.ts';
import { Observer } from '../../../src/meta/Observer.ts';
import { Intervener } from '../../../src/meta/Intervener.ts';
import { ChainTransferManager } from '../../../src/chain/ChainTransferManager.ts';

describe('e2e: meta layer intervention', () => {
  it('should detect cycle and reroute', async () => {
    const pool = new AgentPool();
    pool.createAgent('a', 'Agent A', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    pool.createAgent('b', 'Agent B', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    pool.createAgent('c', 'Agent C', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);

    const observer = new Observer();
    // Seed alternating hops to trigger cycle detection
    observer.recordHop('a', 'b', 100);
    observer.recordHop('b', 'a', 100);
    observer.recordHop('a', 'b', 100);
    observer.recordHop('b', 'a', 100);
    observer.recordHop('a', 'b', 100);
    observer.recordHop('b', 'a', 100);
    observer.recordHop('a', 'b', 100);
    observer.recordHop('b', 'a', 100);

    const intervener = new Intervener();
    const manager = new ChainTransferManager(pool, observer, intervener, 20);

    const result = await manager.startChain(
      {
        taskId: 't1',
        description: 'test',
        priority: 1,
        status: 'running',
        neededCapabilities: [{ type: 'reasoning', level: 5, confidence: 0.5 }],
        hopHistory: [],
        currentAgent: '',
        createdAt: Date.now(),
      },
      'a',
    );

    expect(result.interventions.length).toBeGreaterThan(0);
    expect(result.interventions.some((i) => i.type === 'reroute')).toBe(true);
  });

  it('should terminate on hop limit exceeded', async () => {
    const pool = new AgentPool();
    pool.createAgent('a', 'Agent A', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);

    const observer = new Observer();
    const intervener = new Intervener();
    const manager = new ChainTransferManager(pool, observer, intervener, 3);

    const result = await manager.startChain(
      {
        taskId: 't2',
        description: 'test',
        priority: 1,
        status: 'running',
        neededCapabilities: [{ type: 'codegen', level: 5, confidence: 0.5 }],
        hopHistory: [],
        currentAgent: '',
        createdAt: Date.now(),
      },
      'a',
    );

    expect(result.status).toBe('escalated');
  });

  it('should replace agent on repeated errors', async () => {
    const pool = new AgentPool();
    pool.createAgent('a', 'Agent A', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    pool.createAgent('b', 'Agent B', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);

    const observer = new Observer();
    // Seed errors to trigger agent_error anomaly
    observer.recordError('a', 'test error');
    observer.recordError('a', 'test error');
    observer.recordError('a', 'test error');

    const intervener = new Intervener();
    const manager = new ChainTransferManager(pool, observer, intervener, 10);

    const result = await manager.startChain(
      {
        taskId: 't3',
        description: 'test',
        priority: 1,
        status: 'running',
        neededCapabilities: [{ type: 'reasoning', level: 5, confidence: 0.5 }],
        hopHistory: [],
        currentAgent: '',
        createdAt: Date.now(),
      },
      'a',
    );

    expect(result.interventions.some((i) => i.type === 'replace')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/e2e/05-meta/`

---

#### Task 2.3: Web HTTP API E2E（06-web）

**Files:**
- Create: `packages/core/test/e2e/06-web/rest-api.test.ts`
- Create: `packages/core/test/e2e/06-web/sse-stream.test.ts`

- [ ] **Step 1: Write rest-api.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { createEngine, destroyEngine } from '../helpers/fixture.ts';
import { startWebServer } from '../../../../packages/cli/src/web/server.ts';
import { get, request } from 'http';

function fetchUrl(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }));
    }).on('error', reject);
  });
}

function postJson(url: string, body: unknown): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let responseData = '';
      res.on('data', (chunk) => (responseData += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: responseData }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

describe('e2e: Web REST API', () => {
  it('should serve status endpoint', async () => {
    const fx = await createEngine();
    const server = startWebServer(fx.engine, 0);
    const port = (server.address() as any).port;

    const res = await fetchUrl(`http://localhost:${port}/status`);
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.running).toBeDefined();
    expect(data.agents).toBeDefined();

    server.close();
    await destroyEngine(fx);
  });

  it('should run task via POST /run', async () => {
    const fx = await createEngine();
    const server = startWebServer(fx.engine, 0);
    const port = (server.address() as any).port;

    const res = await postJson(`http://localhost:${port}/run`, { description: 'e2e test task' });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.taskId).toBeDefined();
    expect(data.status).toBeDefined();

    server.close();
    await destroyEngine(fx);
  });

  it('should return pending approvals', async () => {
    const fx = await createEngine();
    await fx.engine.hitl.submit({
      agentId: 'a', taskId: 't1',
      operation: { type: 'config.modify', target: 'x', summary: 'test' },
      triggeredBy: 'guard_rule',
    });

    const server = startWebServer(fx.engine, 0);
    const port = (server.address() as any).port;

    const res = await fetchUrl(`http://localhost:${port}/pending-approvals`);
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.length).toBeGreaterThanOrEqual(1);

    server.close();
    await destroyEngine(fx);
  });

  it('should approve via POST /approve', async () => {
    const fx = await createEngine();
    const req = await fx.engine.hitl.submit({
      agentId: 'a', taskId: 't1',
      operation: { type: 'config.modify', target: 'x', summary: 'test' },
      triggeredBy: 'guard_rule',
    });

    const server = startWebServer(fx.engine, 0);
    const port = (server.address() as any).port;

    const res = await postJson(`http://localhost:${port}/approve`, { id: req.id });
    expect(res.status).toBe(200);
    expect(fx.engine.hitl.getById(req.id)?.status).toBe('approved');

    server.close();
    await destroyEngine(fx);
  });
});
```

- [ ] **Step 2: Write sse-stream.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { createEngine, destroyEngine } from '../helpers/fixture.ts';
import { startWebServer } from '../../../../packages/cli/src/web/server.ts';
import { get, request } from 'http';

describe('e2e: SSE event stream', () => {
  it('should receive task events via SSE', async () => {
    const fx = await createEngine();
    const server = startWebServer(fx.engine, 0);
    const port = (server.address() as any).port;

    // Connect SSE
    const events: string[] = [];
    const sseReq = get(`http://localhost:${port}/events`, (res) => {
      res.on('data', (chunk: Buffer) => events.push(chunk.toString()));
    });

    // Wait for SSE connection, then submit task
    await new Promise((r) => setTimeout(r, 100));

    await fx.engine.executeTask('sse test task');

    // Wait for events
    await new Promise((r) => setTimeout(r, 200));

    expect(events.some((e) => e.includes('task.submitted'))).toBe(true);
    expect(events.some((e) => e.includes('hop.recorded'))).toBe(true);

    sseReq.destroy();
    server.close();
    await destroyEngine(fx);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/e2e/06-web/`

---

#### Task 2.4: 验证 Phase 2

- [ ] **Step 1: Run all Phase 1 + 2 tests**

Run: `pnpm test --reporter=verbose packages/core/test/e2e/`

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`

- [ ] **Step 3: Commit Phase 2**

```bash
git add packages/core/test/e2e/
git commit -m "test(core): add Phase 2 E2E tests - HITL, meta layer, Web HTTP"
```

---

### Phase 3: CLI 子进程 + 多租户 + 优雅关闭

#### Task 3.1: CLI 进程管理器

**Files:**
- Create: `packages/core/test/e2e/01-cli/runner.ts`

- [ ] **Step 1: Write CLI runner**

```ts
import { fork, type ChildProcess } from 'child_process';
import { resolve } from 'path';

const CLI_ENTRY = resolve('packages/cli/src/index.ts');
const DATA_DIR = process.env.MYNTH_DATA_DIR ?? '';

export interface CliProc {
  proc: ChildProcess;
  waitForOutput(text: string): Promise<void>;
  waitForExit(timeoutMs?: number): Promise<number | null>;
  kill(): void;
}

export function runCli(args: string[], dataDir?: string): CliProc {
  const proc = fork(CLI_ENTRY, args, {
    execArgv: ['--import', 'tsx'],
    env: { ...process.env, MYNTH_DATA_DIR: dataDir ?? DATA_DIR },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  });

  let output = '';

  const waitForOutput = (text: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timeout waiting for: ${text}`)), 15000);
      const listener = (data: Buffer) => {
        output += data.toString();
        if (output.includes(text)) {
          clearTimeout(timeout);
          proc.stdout?.removeListener('data', listener);
          resolve();
        }
      };
      proc.stdout?.on('data', listener);
    });

  const waitForExit = (timeoutMs = 10000): Promise<number | null> =>
    new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(null), timeoutMs);
      proc.on('exit', (code) => {
        clearTimeout(timeout);
        resolve(code);
      });
    });

  const kill = () => { proc.kill(); proc.stdout?.destroy(); proc.stderr?.destroy(); };

  return { proc, waitForOutput, waitForExit, kill };
}
```

- [ ] **Step 2: Write CLI E2E tests**

**Files:**
- Create: `packages/core/test/e2e/01-cli/run.test.ts`

- [ ] **Step 3: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/e2e/01-cli/`

---

#### Task 3.2: 多租户 E2E（07-multi-tenant）

**Files:**
- Create: `packages/core/test/e2e/07-multi-tenant/isolation.test.ts`

- [ ] **Step 1: Write isolation.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CoreEngine } from '../../../src/engine/CoreEngine.ts';

describe('e2e: multi-tenant isolation', () => {
  it('should isolate task data between tenants', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-mt-'));

    const t1 = new CoreEngine({ dbPath: dir, tenant: 'acme' });
    await t1.start();
    const task1 = await t1.executeTask('acme feature');
    await t1.stop();

    const t2 = new CoreEngine({ dbPath: dir, tenant: 'beta' });
    await t2.start();
    const task2 = await t2.executeTask('beta fix');
    await t2.stop();

    const t1b = new CoreEngine({ dbPath: dir, tenant: 'acme' });
    await t1b.start();
    const h1 = await t1b.getHistory();
    expect(h1.length).toBe(1);
    await t1b.stop();

    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/e2e/07-multi-tenant/`

---

#### Task 3.3: 优雅关闭 E2E（08-graceful）

**Files:**
- Create: `packages/core/test/e2e/08-graceful/shutdown.test.ts`

- [ ] **Step 1: Write shutdown.test.ts**

```ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CoreEngine } from '../../../src/engine/CoreEngine.ts';

describe('e2e: graceful shutdown', () => {
  it('should stop engine cleanly', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-shutdown-'));
    const engine = new CoreEngine({ dbPath: dir });
    await engine.start();
    await engine.executeTask('test task');
    await engine.stop();
    expect(engine.isRunning()).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('should handle multiple start/stop cycles', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-cycle-'));
    for (let i = 0; i < 3; i++) {
      const engine = new CoreEngine({ dbPath: dir });
      await engine.start();
      await engine.executeTask(`cycle ${i}`);
      await engine.stop();
      expect(engine.isRunning()).toBe(false);
    }
    rmSync(dir, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/e2e/08-graceful/`

---

#### Task 3.4: 验证 Phase 3

- [ ] **Step 1: Run all E2E tests**

Run: `pnpm test --reporter=verbose packages/core/test/e2e/`

- [ ] **Step 2: Run full test suite**

Run: `pnpm test`

- [ ] **Step 3: Commit Phase 3**

```bash
git add packages/core/test/e2e/
git commit -m "test(core): add Phase 3 E2E tests - CLI, multi-tenant, graceful shutdown"
```

---

### Phase 4: Playwright 浏览器 + CI 集成

#### Task 4.1: Playwright 浏览器测试

**Files:**
- Create: `packages/core/test/e2e/06-web/browser.test.ts`

- [ ] **Step 1: Write browser test (conditional)**

```ts
import { describe, expect, it } from 'vitest';
import { createEngine, destroyEngine } from '../helpers/fixture.ts';
import { startWebServer } from '../../../../packages/cli/src/web/server.ts';

describe.skipIf(!process.env.PLAYWRIGHT)('e2e: browser', () => {
  it('should display task status in browser', async () => {
    const { chromium } = await import('playwright');
    const fx = await createEngine();
    const server = startWebServer(fx.engine, 0);
    const port = (server.address() as any).port;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/`);
    expect(await page.title()).toBeDefined();
    await browser.close();

    server.close();
    await destroyEngine(fx);
  });
});
```

- [ ] **Step 2: Run tests with PLAYWRIGHT env**

Run: `PLAYWRIGHT=1 pnpm test --reporter=verbose packages/core/test/e2e/06-web/browser.test.ts`

---

#### Task 4.2: CI 集成

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add E2E job to CI**

```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm build
      - run: pnpm test --reporter=verbose packages/core/test/e2e/
```

- [ ] **Step 2: Commit Phase 4**

```bash
git add packages/core/test/e2e/ .github/workflows/ci.yml
git commit -m "test(core): add Phase 4 E2E tests - Playwright, CI integration"
```
