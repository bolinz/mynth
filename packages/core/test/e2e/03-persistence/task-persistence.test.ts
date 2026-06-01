import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CoreEngine } from '../../../src/engine/CoreEngine.ts';

describe('e2e: persistence across restarts', () => {
  it('should preserve tasks and hops after restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-e2e-persist-'));

    const engine1 = new CoreEngine({ dbPath: dir });
    await engine1.start();
    const result1 = await engine1.executeTask('research topic');
    const taskId = result1.taskId;
    await engine1.stop();

    const engine2 = new CoreEngine({ dbPath: dir });
    await engine2.start();
    const tasks = await engine2.stateStore.loadAllTasks();
    const savedTask = tasks.find((t: any) => t.taskId === taskId);
    expect(savedTask).toBeDefined();
    expect(savedTask.status).toBe('complete');

    const hops = await engine2.stateStore.loadTaskHops(taskId);
    expect(hops.length).toBeGreaterThan(0);
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
    const tasks = await engine2.stateStore.loadAllTasks();
    expect(tasks.length).toBe(2);
    await engine2.stop();

    rmSync(dir, { recursive: true, force: true });
  });
});
