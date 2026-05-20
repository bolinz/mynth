import type { Task } from '@mynth/sdk';
import { describe, expect, it } from 'vitest';
import { Orchestrator } from '../../src/meta/Orchestrator.ts';

describe('Orchestrator', () => {
  it('should analyze a task and select first agent', async () => {
    const agents = ['reasoner', 'coder', 'reviewer'];
    const orc = new Orchestrator(agents);
    const result = await orc.analyze({
      id: 't1',
      description: 'write code',
      priority: 1,
    } as Task);
    expect(result.firstAgent).toBeDefined();
    expect(agents).toContain(result.firstAgent);
    expect(result.constraints.maxHops).toBeGreaterThan(0);
  });

  it('should initialize chain with context', async () => {
    const orc = new Orchestrator(['reasoner']);
    const chain = await orc.initializeChain(
      { id: 't1', description: 'test', priority: 1 } as Task,
      'reasoner',
    );
    expect(chain.taskId).toBe('t1');
    expect(chain.currentAgent).toBe('reasoner');
  });
});
