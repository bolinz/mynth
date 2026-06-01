import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
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
