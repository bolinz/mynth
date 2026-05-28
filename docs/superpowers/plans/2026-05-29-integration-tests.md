# Integration Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three cross-component integration test scenarios following design doc patterns (real objects, no mocks, LevelDB persistence)

**Architecture:** Each test creates real object instances with shared LevelDB, exercises multi-component flows, verifies state consistency across restart/tenants/memory transfer

**Tech Stack:** Vitest, LevelDBAdapter, temp directories with mkdtempSync

---

### Task 1: CoreEngine full lifecycle test

**Files:**
- Create: `packages/core/test/integration/core-engine.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { CoreEngine } from '../../src/engine/CoreEngine.ts';

describe('CoreEngine full lifecycle', () => {
  it('should execute task and persist to StateStore', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-int-'));
    const engine = new CoreEngine({
      dbPath: dir,
      maxHops: 5,
      agents: [
        { id: 'a', name: 'A', capabilities: [{ type: 'reasoning', level: 8, confidence: 0.9 }] },
        { id: 'b', name: 'B', capabilities: [{ type: 'codegen', level: 8, confidence: 0.85 }] },
      ],
    });
    await engine.start();

    const result = await engine.executeTask('build a calculator');
    expect(result.taskId).toBeDefined();
    expect(result.hops).toBeGreaterThan(0);

    // Verify persistence
    const tasks = await engine.stateStore.loadAllTasks();
    expect(tasks.some((t) => t.taskId === result.taskId)).toBe(true);
    const hops = await engine.stateStore.loadTaskHops(result.taskId);
    expect(hops.length).toBe(result.hops);

    await engine.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it('should survive engine restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-int-'));
    try {
      const engine1 = new CoreEngine({
        dbPath: dir,
        maxHops: 5,
        agents: [
          { id: 'a', name: 'A', capabilities: [{ type: 'reasoning', level: 8, confidence: 0.9 }] },
          { id: 'b', name: 'B', capabilities: [{ type: 'codegen', level: 8, confidence: 0.85 }] },
        ],
      });
      await engine1.start();
      const result = await engine1.executeTask('test task');
      await engine1.stop();

      // Restart with same DB
      const engine2 = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine2.start();
      const tasks = await engine2.stateStore.loadAllTasks();
      expect(tasks.some((t) => t.taskId === result.taskId)).toBe(true);
      const hops = await engine2.stateStore.loadTaskHops(result.taskId);
      expect(hops.length).toBeGreaterThan(0);
      await engine2.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

### Task 2: Memory consistency across agents

**Files:**
- Create: `packages/core/test/integration/memory-agent.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { LevelDBAdapter } from '../../src/persistence/LevelDBAdapter.ts';
import { GlobalMemory } from '../../src/memory/GlobalMemory.ts';
import { PrivateMemory } from '../../src/memory/PrivateMemory.ts';

describe('Memory consistency across agents', () => {
  it('should backup agent1 memory and restore to agent2 via GlobalMemory', async () => {
    const globalMem = new GlobalMemory();
    const agent1 = new PrivateMemory('agent-a');
    const agent2 = new PrivateMemory('agent-b');

    await agent1.remember('secret', 'agent-a-data', 0.9);
    await agent1.remember('config', { timeout: 30 }, 0.8);
    await agent1.backup(globalMem);

    const restored = await agent2.restore(globalMem);
    expect(restored).toBe(0); // Different agentId, no items match

    // agent2 can retrieve agent1's data via key prefix
    expect(await agent1.recall('secret')).toBe('agent-a-data');
    expect(await agent1.recall('config')).toEqual({ timeout: 30 });
  });

  it('should persist memory via LevelDB and survive restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-mem-'));
    try {
      const db = new LevelDBAdapter(dir);
      await db.open();

      const mem1 = new PrivateMemory('agent-x', db);
      await mem1.remember('persistent-key', 'stored-value', 0.95);
      await db.close();

      await db.open();
      const mem2 = new PrivateMemory('agent-x', db);
      expect(await mem2.recall('persistent-key')).toBe('stored-value');
      await db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should share memory between agents via GlobalMemory', async () => {
    const globalMem = new GlobalMemory();

    await globalMem.write('shared-key', 'shared-value');
    const agent1 = new PrivateMemory('agent-a');
    const agent2 = new PrivateMemory('agent-b');

    // Neither has L1 or L2, so they see nothing
    expect(await agent1.recall('shared-key')).toBeNull();
    expect(await agent2.recall('shared-key')).toBeNull();
    expect(await globalMem.read('shared-key')).toBe('shared-value');
  });
});
```

### Task 3: Multi-tenant StateStore isolation

**Files:**
- Create: `packages/core/test/integration/multi-tenant.integration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { LevelDBAdapter } from '../../src/persistence/LevelDBAdapter.ts';
import { StateStore } from '../../src/persistence/StateStore.ts';

describe('Multi-tenant StateStore isolation', () => {
  it('should isolate data between tenants', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-tenant-'));
    try {
      const db = new LevelDBAdapter(dir);
      await db.open();

      const tenant1 = new StateStore(db, { tenantId: 'acme' });
      const tenant2 = new StateStore(db, { tenantId: 'beta' });

      await tenant1.saveTask({
        taskId: 't1', description: 'acme task', status: 'running', hops: 0, createdAt: 100,
      });
      await tenant1.saveAgentConfig({
        id: 'agent-a', name: 'Agent A', capabilities: [{ type: 'reasoning', level: 8, confidence: 0.9 }],
      });

      await tenant2.saveTask({
        taskId: 't2', description: 'beta task', status: 'complete', hops: 2, createdAt: 200,
      });
      await tenant2.saveAgentConfig({
        id: 'agent-b', name: 'Agent B', capabilities: [{ type: 'codegen', level: 7, confidence: 0.8 }],
      });

      const t1Tasks = await tenant1.loadAllTasks();
      expect(t1Tasks).toHaveLength(1);
      expect(t1Tasks[0].description).toBe('acme task');

      const t2Tasks = await tenant2.loadAllTasks();
      expect(t2Tasks).toHaveLength(1);
      expect(t2Tasks[0].description).toBe('beta task');

      const t1Agents = await tenant1.loadAgentConfigs();
      expect(t1Agents).toHaveLength(1);
      expect(t1Agents[0].id).toBe('agent-a');

      const t2Agents = await tenant2.loadAgentConfigs();
      expect(t2Agents).toHaveLength(1);
      expect(t2Agents[0].id).toBe('agent-b');

      await db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('should isolate hops between tenants', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-tenant-'));
    try {
      const db = new LevelDBAdapter(dir);
      await db.open();

      const tenant1 = new StateStore(db, { tenantId: 'acme' });
      const tenant2 = new StateStore(db, { tenantId: 'beta' });

      await tenant1.saveHop('shared-task', {
        fromAgent: 'a', toAgent: 'b', timestamp: 10, handoverNote: 'pass', duration: 5,
      });
      await tenant2.saveHop('shared-task', {
        fromAgent: 'c', toAgent: 'd', timestamp: 20, handoverNote: 'handoff', duration: 3,
      });

      const t1Hops = await tenant1.loadTaskHops('shared-task');
      expect(t1Hops).toHaveLength(1);
      expect(t1Hops[0].fromAgent).toBe('a');

      const t2Hops = await tenant2.loadTaskHops('shared-task');
      expect(t2Hops).toHaveLength(1);
      expect(t2Hops[0].fromAgent).toBe('c');

      await db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify they pass**

Run: `pnpm test`
Expected: All 3 integration test files pass + existing 272 tests still pass

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/integration/
git commit -m "test(core): add integration tests for engine lifecycle, memory consistency, multi-tenant"
```
