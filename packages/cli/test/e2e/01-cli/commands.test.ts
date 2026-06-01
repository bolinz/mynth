import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { CoreEngine } from '../../../../core/src/engine/CoreEngine.ts';
import { runCommand } from '../../../src/commands/run.ts';

describe('e2e: CLI commands', () => {
  it('should run a task via run command', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-run-'));
    const engine = new CoreEngine({ dbPath: dir });
    await engine.start();

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runCommand(engine, 'test cli task', {});
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('complete'));
    logSpy.mockRestore();

    await engine.stop();
    rmSync(dir, { recursive: true, force: true });
  });
});
