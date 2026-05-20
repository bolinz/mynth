import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { CoreEngine } from '../../src/engine/CoreEngine.ts';

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
    const dir = mkdtempSync(join(tmpdir(), 'mynth-engine-'));
    const engine = new CoreEngine({ dbPath: dir });
    await engine.start();
    const result = await engine.executeTask('write a hello world function');
    expect(result.taskId).toBeDefined();
    expect(result.status).toBe('completed');
    expect(result.hops).toBeGreaterThan(0);
    await engine.stop();
    rmSync(dir, { recursive: true, force: true });
  });
});
