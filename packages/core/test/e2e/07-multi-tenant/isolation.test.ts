import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { CoreEngine } from '../../../src/engine/CoreEngine.ts';

describe('e2e: multi-tenant isolation', () => {
  it('should isolate task data between tenants', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-mt-'));

    const t1 = new CoreEngine({ dbPath: dir, tenant: { tenantId: 'acme' } });
    await t1.start();
    const task1 = await t1.executeTask('acme feature');
    await t1.stop();

    const t2 = new CoreEngine({ dbPath: dir, tenant: { tenantId: 'beta' } });
    await t2.start();
    const task2 = await t2.executeTask('beta fix');
    expect(task2.status).toBe('complete');
    await t2.stop();

    const t1b = new CoreEngine({ dbPath: dir, tenant: { tenantId: 'acme' } });
    await t1b.start();
    const h1 = await t1b.stateStore.loadAllTasks();
    expect(h1.length).toBe(1);
    expect(h1[0].taskId).toBe(task1.taskId);
    await t1b.stop();

    rmSync(dir, { recursive: true, force: true });
  });
});
