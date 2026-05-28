import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LevelDBAdapter } from '../../src/persistence/LevelDBAdapter.ts';
import { StateStore } from '../../src/persistence/StateStore.ts';

describe('Multi-tenant StateStore isolation integration', () => {
  let dir: string;
  let db: LevelDBAdapter;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mynth-tenant-'));
    db = new LevelDBAdapter(dir);
    await db.open();
  });

  afterAll(async () => {
    await db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('should isolate tasks between tenants', async () => {
    const tenant1 = new StateStore(db, { tenantId: 'acme' });
    const tenant2 = new StateStore(db, { tenantId: 'beta' });

    await tenant1.saveTask({
      taskId: 't1',
      description: 'acme task',
      status: 'running',
      hops: 0,
      createdAt: 100,
    });
    await tenant2.saveTask({
      taskId: 't2',
      description: 'beta task',
      status: 'complete',
      hops: 2,
      createdAt: 200,
    });

    const t1Tasks = await tenant1.loadAllTasks();
    expect(t1Tasks).toHaveLength(1);
    expect(t1Tasks[0].description).toBe('acme task');

    const t2Tasks = await tenant2.loadAllTasks();
    expect(t2Tasks).toHaveLength(1);
    expect(t2Tasks[0].description).toBe('beta task');
  });

  it('should isolate agent configs between tenants', async () => {
    const tenant1 = new StateStore(db, { tenantId: 'acme' });
    const tenant2 = new StateStore(db, { tenantId: 'beta' });

    await tenant1.saveAgentConfig({
      id: 'agent-a',
      name: 'Agent A',
      capabilities: [{ type: 'reasoning', level: 8, confidence: 0.9 }],
    });
    await tenant2.saveAgentConfig({
      id: 'agent-b',
      name: 'Agent B',
      capabilities: [{ type: 'codegen', level: 7, confidence: 0.8 }],
    });

    const t1Agents = await tenant1.loadAgentConfigs();
    expect(t1Agents).toHaveLength(1);
    expect(t1Agents[0].id).toBe('agent-a');

    const t2Agents = await tenant2.loadAgentConfigs();
    expect(t2Agents).toHaveLength(1);
    expect(t2Agents[0].id).toBe('agent-b');
  });

  it('should isolate hops between tenants with same taskId', async () => {
    const tenant1 = new StateStore(db, { tenantId: 'acme' });
    const tenant2 = new StateStore(db, { tenantId: 'beta' });

    await tenant1.saveHop('shared-task', {
      fromAgent: 'a',
      toAgent: 'b',
      timestamp: 10,
      handoverNote: 'pass',
      duration: 5,
    });
    await tenant2.saveHop('shared-task', {
      fromAgent: 'c',
      toAgent: 'd',
      timestamp: 20,
      handoverNote: 'handoff',
      duration: 3,
    });

    const t1Hops = await tenant1.loadTaskHops('shared-task');
    expect(t1Hops).toHaveLength(1);
    expect(t1Hops[0].fromAgent).toBe('a');

    const t2Hops = await tenant2.loadTaskHops('shared-task');
    expect(t2Hops).toHaveLength(1);
    expect(t2Hops[0].fromAgent).toBe('c');
  });

  it('should allow no-tenant store to coexist with tenant stores', async () => {
    const noTenant = new StateStore(db);
    const tenant = new StateStore(db, { tenantId: 'gamma' });

    await noTenant.saveTask({
      taskId: 'global-task',
      description: 'no tenant',
      status: 'done',
      hops: 1,
      createdAt: 300,
    });
    await tenant.saveTask({
      taskId: 'tenant-task',
      description: 'with tenant',
      status: 'done',
      hops: 1,
      createdAt: 400,
    });

    const globalTasks = await noTenant.loadAllTasks();
    const tenantTasks = await tenant.loadAllTasks();

    expect(globalTasks.some((t) => t.taskId === 'global-task')).toBe(true);
    // no-tenant store should NOT see tenant-prefixed data (and vice versa)
    expect(globalTasks.some((t) => t.taskId === 'tenant-task')).toBe(false);
    expect(tenantTasks.some((t) => t.taskId === 'global-task')).toBe(false);
  });
});
