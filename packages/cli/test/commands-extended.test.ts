import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, it, vi } from 'vitest';
import { CoreEngine } from '../../core/src/engine/CoreEngine.ts';
import { approveCommand } from '../src/commands/approve.ts';
import { historyCommand } from '../src/commands/history.ts';
import { initCommand } from '../src/commands/init.ts';
import { logsCommand } from '../src/commands/logs.ts';
import { runCommand } from '../src/commands/run.ts';
import { stopCommand } from '../src/commands/stop.ts';
import { traceCommand } from '../src/commands/trace.ts';

describe('CLI commands extended', () => {
  it('runCommand should execute task and print result', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-run-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await runCommand(engine, 'test task', {});
      expect(logs.some((l) => l.includes('Task'))).toBe(true);
      expect(logs.some((l) => l.includes('complete') || l.includes('hops'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('historyCommand should show tasks and agents', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-hist-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      await engine.executeTask('history test');
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await historyCommand(engine);
      expect(logs.some((l) => l.includes('Task History'))).toBe(true);
      expect(
        logs.some((l) => l.includes('hops') || l.includes('complete') || l.includes('running')),
      ).toBe(true);
      expect(logs.some((l) => l.includes('Agents'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('historyCommand should show empty state', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-empt-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await historyCommand(engine);
      expect(logs.some((l) => l.includes('No tasks yet'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('traceCommand should show traces after task execution', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-trc-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      await engine.executeTask('trace test');
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await traceCommand(engine);
      expect(logs.some((l) => l.includes('Traces'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('traceCommand should show empty state with no tasks', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-tr2-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await traceCommand(engine);
      expect(logs.some((l) => l.includes('No traces'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('traceCommand should filter by taskId', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-tr3-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      const result = await engine.executeTask('filter test');
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await traceCommand(engine, result.taskId);
      expect(logs.some((l) => l.includes('Traces'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('approveCommand should approve a pending HITL request', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-app-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      const request = await engine.hitlManager.submit({
        agentId: 'a',
        taskId: 't1',
        operation: { type: 'deploy', target: 'prod', summary: 'deploy to prod' },
        triggeredBy: 'guard_rule',
      });
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await approveCommand(engine, request.id, {});
      expect(logs.some((l) => l.includes('Approved'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('approveCommand should reject a pending HITL request', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-rj-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      const request = await engine.hitlManager.submit({
        agentId: 'a',
        taskId: 't1',
        operation: { type: 'delete', target: 'x', summary: 'remove x' },
        triggeredBy: 'agent_self_assess',
      });
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await approveCommand(engine, request.id, { reject: true, note: 'not needed' });
      expect(logs.some((l) => l.includes('Rejected'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('approveCommand should error on nonexistent request', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-ap2-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'error')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await approveCommand(engine, 'nonexistent', {});
      expect(logs.some((l) => l.includes('not found'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('approveCommand should error on already resolved request', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-ap3-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      const request = await engine.hitlManager.submit({
        agentId: 'a',
        taskId: 't1',
        operation: { type: 'deploy', target: 'x', summary: 'deploy' },
        triggeredBy: 'guard_rule',
      });
      await engine.hitlManager.approve(request.id, 'test');
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'error')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await approveCommand(engine, request.id, {});
      expect(logs.some((l) => l.includes('already'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stopCommand should show usage without taskId', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-stp-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await stopCommand(engine);
      expect(logs.some((l) => l.includes('Usage'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stopCommand should say already completed for finished task', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-st2-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      const result = await engine.executeTask('quick task');
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await stopCommand(engine, result.taskId);
      expect(logs.some((l) => l.includes('already'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('stopCommand should error on nonexistent task', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-st3-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await stopCommand(engine, 'nonexistent');
      expect(logs.some((l) => l.includes('not found'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('logsCommand should show usage without taskId', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-lg-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await logsCommand(engine);
      expect(logs.some((l) => l.includes('Usage'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('logsCommand should show records for a task', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-lg2-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      const result = await engine.executeTask('loggable task');
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await logsCommand(engine, result.taskId);
      expect(logs.some((l) => l.includes('Task:'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('logsCommand should show status for unknown task', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mynth-cli-lg3-'));
    try {
      const engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
      await engine.start();
      const logs: string[] = [];
      const spy = vi
        .spyOn(console, 'log')
        .mockImplementation((...args) => logs.push(args.join(' ')));
      await logsCommand(engine, 'nonexistent');
      expect(logs.some((l) => l.includes('Status'))).toBe(true);
      spy.mockRestore();
      await engine.stop();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
