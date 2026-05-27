import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { CoreEngine } from '../../src/engine/CoreEngine.ts';

describe('CoreEngine multi-tenant isolation', () => {
  it('should use separate state for different tenants', async () => {
    const dir1 = mkdtempSync(join(tmpdir(), 'mynth-t1-'));
    const dir2 = mkdtempSync(join(tmpdir(), 'mynth-t2-'));

    try {
      const engine1 = new CoreEngine({ dbPath: dir1, tenant: { tenantId: 'tenant-a' } });
      await engine1.start();
      await engine1.executeTask('test task for tenant a');
      const tasks1 = engine1.getScheduler().getAllTasks();
      await engine1.stop();

      const engine2 = new CoreEngine({ dbPath: dir2, tenant: { tenantId: 'tenant-b' } });
      await engine2.start();
      await engine2.executeTask('test task for tenant b');
      const tasks2 = engine2.getScheduler().getAllTasks();
      await engine2.stop();

      // Both tenants executed tasks independently
      expect(tasks1.length).toBe(1);
      expect(tasks2.length).toBe(1);
    } finally {
      rmSync(dir1, { recursive: true, force: true });
      rmSync(dir2, { recursive: true, force: true });
    }
  });

  it('should load only own tasks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-mt-'));
    try {
      const engineA = new CoreEngine({ dbPath: dir, tenant: { tenantId: 'tenant-a' } });
      await engineA.start();
      await engineA.executeTask('task for A');
      await engineA.stop();

      const engineB = new CoreEngine({ dbPath: dir, tenant: { tenantId: 'tenant-b' } });
      await engineB.start();
      await engineB.executeTask('task for B');
      const tasksB = engineB.getScheduler().getAllTasks();
      await engineB.stop();

      // Tenant B sees only its own task
      expect(tasksB.length).toBe(1);
      expect(tasksB[0].description).toBe('task for B');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
