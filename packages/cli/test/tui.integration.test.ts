import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoreEngine } from '../../core/src/engine/CoreEngine.ts';

const inputHandlers: Record<string, (...args: any[]) => void> = {};
const screenKeyHandlers: Record<string, Array<(...args: any[]) => void>> = {};
const inputKeyHandlers: Record<string, Array<(...args: any[]) => void>> = {};
const w: any[] = [];

vi.mock('neo-blessed', () => {
  function createWidget() {
    const widget = {
      setContent: vi.fn(),
      pushLine: vi.fn(),
      setScrollPerc: vi.fn(),
      hide: vi.fn(),
      show: vi.fn(),
      setValue: vi.fn(),
      clearValue: vi.fn(),
      readInput: vi.fn(),
      focus: vi.fn(),
      destroy: vi.fn(),
      on: vi.fn(),
      key: vi.fn(),
    };
    w.push(widget);
    return widget;
  }

  return {
    screen: () => ({
      ...createWidget(),
      render: vi.fn(),
      key: vi.fn((keys: string[], handler: (...args: any[]) => void) => {
        for (const key of keys) {
          if (!screenKeyHandlers[key]) screenKeyHandlers[key] = [];
          screenKeyHandlers[key].push(handler);
        }
      }),
      append: vi.fn(),
    }),
    box: createWidget,
    textbox: () => ({
      ...createWidget(),
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        inputHandlers[event] = handler;
      }),
      key: vi.fn((keys: string[], handler: (...args: any[]) => void) => {
        for (const key of keys) {
          if (!inputKeyHandlers[key]) inputKeyHandlers[key] = [];
          inputKeyHandlers[key].push(handler);
        }
      }),
    }),
  };
});

function widget(i: number) {
  return w[i];
}

describe('TUI integration', () => {
  let dir: string;
  let engine: CoreEngine;
  let exitMock: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'mynth-tui-'));
    engine = new CoreEngine({ dbPath: dir, maxHops: 5 });
    await engine.start();

    exitMock = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const { startTui } = await import('../src/tui/index.ts');
    await startTui(engine);
  });

  afterAll(async () => {
    exitMock?.mockRestore();
    await engine.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Event-driven UI updates ---

  it('should update agent panel on agent.state_changed', async () => {
    engine.eventBus.publish('agent.state_changed', {
      agentId: 'a',
      fromState: 'idle',
      toState: 'working',
    });
    expect(widget(2).setContent.mock.calls.length).toBeGreaterThan(0);
    expect(widget(6).pushLine.mock.calls.length).toBeGreaterThan(0);
  });

  it('should log hop and update chain on hop.recorded', async () => {
    engine.eventBus.publish('hop.recorded', {
      from: 'a',
      to: 'b',
      note: 'transfer',
      duration: 50,
      hopNumber: 1,
    });
    expect(widget(6).pushLine.mock.calls.length).toBeGreaterThan(0);
    expect(widget(4).setContent.mock.calls.length).toBeGreaterThan(0);
  });

  it('should update stats on task.completed', async () => {
    engine.eventBus.publish('task.completed', {
      taskId: 't1',
      status: 'complete',
      hops: 3,
    });
    expect(widget(3).setContent.mock.calls.length).toBeGreaterThan(0);
  });

  it('should log anomaly.detected', async () => {
    engine.eventBus.publish('anomaly.detected', {
      type: 'cycle_pattern',
      agentId: 'a',
      details: 'cycle',
    });
    expect(widget(6).pushLine.mock.calls.length).toBeGreaterThan(0);
  });

  it('should handle degradation change', async () => {
    engine.eventBus.publish('system.degradation_changed', { level: 2 });
    expect(widget(6).pushLine.mock.calls.length).toBeGreaterThan(0);
    expect(widget(3).setContent.mock.calls.length).toBeGreaterThan(0);
  });

  it('should log intervention', async () => {
    engine.eventBus.publish('intervention.executed', { type: 'warn', reason: 'slow' });
    expect(widget(6).pushLine.mock.calls.length).toBeGreaterThan(0);
  });

  it('should log agent response', async () => {
    engine.eventBus.publish('agent.response', {
      taskId: 't1',
      agentId: 'a',
      text: 'done',
      viewCount: 2,
      hasInteraction: false,
    });
    expect(widget(6).pushLine.mock.calls.length).toBeGreaterThan(0);
  });

  it('should update approval panel on hitl.requested', async () => {
    await engine.hitlManager.submit({
      agentId: 'a',
      taskId: 't0',
      operation: { type: 'deploy', target: 'prod', summary: 'pending approval' },
      triggeredBy: 'guard_rule',
    });
    engine.eventBus.publish('hitl.requested', {
      requestId: 'h1',
      agentId: 'a',
      operation: 'deploy',
      summary: 'deploy to prod',
      createdAt: Date.now(),
    });
    expect(widget(7).setContent.mock.calls.length).toBeGreaterThan(0);
  });

  // --- Keyboard shortcuts ---

  it('should approve pending request on key a', async () => {
    await engine.hitlManager.submit({
      agentId: 'a',
      taskId: 't1',
      operation: { type: 'deploy', target: 'prod', summary: 'deploy' },
      triggeredBy: 'guard_rule',
    });
    screenKeyHandlers.a[0]();
    expect(widget(6).pushLine.mock.calls.length).toBeGreaterThan(0);
  });

  it('should reject pending request on key r', async () => {
    await engine.hitlManager.submit({
      agentId: 'b',
      taskId: 't2',
      operation: { type: 'delete', target: 'x', summary: 'remove' },
      triggeredBy: 'agent_self_assess',
    });
    screenKeyHandlers.r[0]();
    expect(widget(6).pushLine.mock.calls.length).toBeGreaterThan(0);
  });

  it('should toggle tree panel on key t', async () => {
    screenKeyHandlers.t[0]();
    screenKeyHandlers.t[0]();
    // Toggle back hides treePanel
    expect(widget(5).hide.mock.calls.length).toBeGreaterThan(0);
  });

  it('should quit on key q', async () => {
    screenKeyHandlers.q[0]();
    expect(exitMock).toHaveBeenCalled();
  });

  it('should cancel task on escape', async () => {
    screenKeyHandlers.escape[0]();
  });

  // --- REPL commands ---

  it('should process /status command via input submit', async () => {
    expect(inputHandlers.submit).toBeDefined();
    inputHandlers.submit('/status');
    await vi.waitFor(() => {
      expect(widget(4).setContent.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it('should process /list command', async () => {
    inputHandlers.submit('/list');
    await vi.waitFor(() => {
      expect(widget(4).setContent.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it('should process /help command', async () => {
    inputHandlers.submit('/help');
    await vi.waitFor(() => {
      expect(widget(4).setContent.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it('should process /logs command', async () => {
    inputHandlers.submit('/logs nonexistent');
    await vi.waitFor(() => {
      expect(widget(4).setContent.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it('should process /logs without taskId showing usage', async () => {
    inputHandlers.submit('/logs');
    await vi.waitFor(() => {
      expect(widget(4).setContent.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it('should process /views command', async () => {
    inputHandlers.submit('/views');
    await vi.waitFor(() => {
      expect(widget(4).setContent.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it('should show unknown command for invalid command', async () => {
    inputHandlers.submit('/invalidcmd');
    await vi.waitFor(() => {
      expect(widget(4).setContent.mock.calls.length).toBeGreaterThan(0);
    });
  });

  it('should execute regular task via input submit', async () => {
    inputHandlers.submit('run a regular task');
    await vi.waitFor(() => {
      expect(widget(6).pushLine.mock.calls.length).toBeGreaterThan(0);
    });
  });

  // --- Command history ---

  it('should navigate history on up/down', async () => {
    expect(inputKeyHandlers.up?.length).toBeGreaterThan(0);
    expect(inputKeyHandlers.down?.length).toBeGreaterThan(0);

    inputKeyHandlers.up[0](null, { name: 'up' });
    expect(widget(9).setValue.mock.calls.length).toBeGreaterThan(0);
    inputKeyHandlers.down[0](null, { name: 'down' });
    expect(widget(9).setValue.mock.calls.length).toBeGreaterThan(0);
  });

  it('should ignore empty input submit', async () => {
    inputHandlers.submit('');
    inputHandlers.submit('   ');
  });

  it('should clear log panel on C-l', async () => {
    screenKeyHandlers['C-l']?.[0]();
    expect(widget(6).setContent.mock.calls.length).toBeGreaterThan(0);
  });
});
