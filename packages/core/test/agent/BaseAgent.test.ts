import type { Capability } from '@mynth/sdk';
import { describe, expect, it, vi } from 'vitest';
import { BaseAgent } from '../../src/agent/BaseAgent.ts';

describe('BaseAgent', () => {
  const caps: Capability[] = [{ type: 'reasoning', level: 7, confidence: 0.9 }];

  it('should initialize with given id and capabilities', () => {
    const agent = new BaseAgent('agent-1', 'Tester', caps);
    expect(agent.id).toBe('agent-1');
    expect(agent.name).toBe('Tester');
    expect(agent.state).toBe('idle');
  });

  it('should transition to thinking on assignTask', () => {
    const agent = new BaseAgent('agent-1', 'Tester', caps);
    agent.assignTask({} as any);
    expect(agent.state).toBe('thinking');
  });

  it('should transition working -> transferring -> idle on transfer flow', () => {
    const agent = new BaseAgent('a', 'A', caps);
    agent.assignTask({} as any);
    agent.startWork();
    expect(agent.state).toBe('working');
    agent.startTransfer();
    expect(agent.state).toBe('transferring');
    agent.complete();
    expect(agent.state).toBe('idle');
  });

  it('should transition to error on error', () => {
    const agent = new BaseAgent('a', 'A', caps);
    agent.assignTask({} as any);
    agent.startWork();
    agent.handleError(new Error('oops'));
    expect(agent.state).toBe('error');
    expect(agent.lastError?.message).toBe('oops');
  });

  it('should shutdown', () => {
    const agent = new BaseAgent('a', 'A', caps);
    agent.assignTask({} as any);
    agent.startWork();
    agent.handleError(new Error('fatal'));
    agent.shutdown();
    expect(agent.state).toBe('shutdown');
  });

  it('should call onStateChange callback', () => {
    const changes: string[] = [];
    const agent = new BaseAgent('a', 'A', caps);
    agent.onStateChange = (state) => changes.push(state);
    agent.assignTask({} as any);
    expect(changes).toContain('thinking');
  });

  it('should track execute count', () => {
    const agent = new BaseAgent('a', 'A', caps);
    agent.assignTask({} as any);
    agent.startWork();
    agent.complete();
    expect(agent.metadata.taskCount).toBe(1);
  });

  it('should check capability match', () => {
    const agent = new BaseAgent('a', 'A', caps);
    expect(agent.canHandle([{ type: 'reasoning', level: 5, confidence: 0.5 }])).toBe(true);
    expect(agent.canHandle([{ type: 'codegen', level: 5, confidence: 0.5 }])).toBe(false);
  });
});
