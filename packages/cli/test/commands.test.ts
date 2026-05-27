import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { CoreEngine } from '../../core/src/engine/CoreEngine.ts';
import { statusCommand } from '../src/commands/status.ts';
import { pendingCommand } from '../src/commands/pending.ts';
import { listCommand } from '../src/commands/list.ts';

describe('CLI commands', () => {
  it('statusCommand should print system status', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-'));
    try {
      const engine = new CoreEngine({ dbPath: dir });
      await engine.start();

      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));

      await statusCommand(engine);
      expect(logs.some((l) => l.includes('System Status'))).toBe(true);

      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('pendingCommand should show no pending approvals', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli2-'));
    try {
      const engine = new CoreEngine({ dbPath: dir });
      await engine.start();

      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));

      await pendingCommand(engine);
      expect(logs.some((l) => l.toLowerCase().includes('pending'))).toBe(true);

      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('listCommand should show tasks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli3-'));
    try {
      const engine = new CoreEngine({ dbPath: dir });
      await engine.start();
      const res = await engine.executeTask('test task');

      const logs: string[] = [];
      const spy = vi.spyOn(console, 'log').mockImplementation((...args) => logs.push(args.join(' ')));

      await listCommand(engine);
      expect(logs.some((l) => l.includes(res.taskId))).toBe(true);

      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
