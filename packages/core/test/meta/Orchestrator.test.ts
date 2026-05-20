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

  it('should infer codegen capability for code tasks', async () => {
    const orc = new Orchestrator(['reasoner', 'coder', 'reviewer']);
    const result = await orc.analyze({
      id: 't1',
      description: 'implement a login form',
      priority: 1,
    } as Task);
    expect(result.capabilities).toContain('codegen');
    expect(result.capabilities).toContain('reasoning');
  });

  it('should infer review capability for review tasks', async () => {
    const orc = new Orchestrator(['reasoner', 'reviewer']);
    const result = await orc.analyze({
      id: 't1',
      description: 'review the pull request',
      priority: 1,
    } as Task);
    expect(result.capabilities).toContain('review');
  });

  it('should infer plan capability for design tasks', async () => {
    const orc = new Orchestrator(['reasoner']);
    const result = await orc.analyze({
      id: 't1',
      description: 'design the system architecture',
      priority: 1,
    } as Task);
    expect(result.capabilities).toContain('plan');
  });

  it('should default to reasoning for unknown tasks', async () => {
    const orc = new Orchestrator(['reasoner']);
    const result = await orc.analyze({ id: 't1', description: 'hello world', priority: 1 } as Task);
    expect(result.capabilities).toEqual(['reasoning']);
  });

  it('should infer multiple capabilities', async () => {
    const orc = new Orchestrator(['reasoner', 'coder', 'reviewer']);
    const result = await orc.analyze({
      id: 't1',
      description: 'implement a login form and review the code',
      priority: 1,
    } as Task);
    expect(result.capabilities).toContain('codegen');
    expect(result.capabilities).toContain('review');
    expect(result.capabilities.length).toBeGreaterThanOrEqual(2);
  });
});
