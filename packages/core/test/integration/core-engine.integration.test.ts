import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { CoreEngine } from '../../src/engine/CoreEngine.ts';

describe('CoreEngine full lifecycle integration', () => {
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
