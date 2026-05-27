import { describe, expect, it } from 'vitest';
import { InteractionManager } from '../../src/meta/InteractionManager.ts';
import type { Interaction } from '../../src/meta/ViewRenderer.ts';

describe('InteractionManager', () => {
  it('should submit and get pending interactions', () => {
    const mgr = new InteractionManager();
    const interaction: Interaction = {
      id: 'int-1',
      type: 'confirm',
      prompt: 'Proceed?',
      data: { action: 'delete' },
      agentId: 'agent-1',
      taskId: 'task-1',
      createdAt: 1000,
    };
    mgr.submit(interaction);
    expect(mgr.getPendingCount()).toBe(1);
    expect(mgr.getPending()).toEqual([interaction]);
  });

  it('should respond to an interaction and remove from pending', () => {
    const mgr = new InteractionManager();
    const interaction: Interaction = {
      id: 'int-1',
      type: 'input',
      prompt: 'Enter value:',
      data: {},
      agentId: 'agent-1',
      taskId: 'task-1',
      createdAt: 1000,
    };
    mgr.submit(interaction);
    const response = mgr.respond('int-1', 'hello');
    expect(response).toEqual({ interactionId: 'int-1', value: 'hello' });
    expect(mgr.getPendingCount()).toBe(0);
  });

  it('should return null for unknown interaction id', () => {
    const mgr = new InteractionManager();
    expect(mgr.respond('nonexistent', true)).toBeNull();
  });

  it('should filter pending by agentId', () => {
    const mgr = new InteractionManager();
    mgr.submit({
      id: '1',
      type: 'confirm',
      prompt: '?',
      data: {},
      agentId: 'agent-1',
      taskId: 't1',
      createdAt: 100,
    });
    mgr.submit({
      id: '2',
      type: 'confirm',
      prompt: '?',
      data: {},
      agentId: 'agent-2',
      taskId: 't2',
      createdAt: 200,
    });
    mgr.submit({
      id: '3',
      type: 'input',
      prompt: '?',
      data: {},
      agentId: 'agent-1',
      taskId: 't3',
      createdAt: 300,
    });
    expect(mgr.getPending('agent-1').length).toBe(2);
    expect(mgr.getPending('agent-2').length).toBe(1);
    expect(mgr.getPending('agent-3').length).toBe(0);
  });

  it('should invoke onResponse handlers when responding', () => {
    const mgr = new InteractionManager();
    const received: Array<{ interactionId: string; value: unknown }> = [];
    mgr.onResponse((r) => {
      received.push(r);
    });
    mgr.onResponse((r) => {
      received.push(r);
    });
    mgr.submit({
      id: 'int-1',
      type: 'confirm',
      prompt: '?',
      data: {},
      agentId: 'a',
      taskId: 't',
      createdAt: 100,
    });
    mgr.respond('int-1', 42);
    expect(received.length).toBe(2);
    expect(received[0]).toEqual({ interactionId: 'int-1', value: 42 });
    expect(received[1]).toEqual({ interactionId: 'int-1', value: 42 });
  });
});
