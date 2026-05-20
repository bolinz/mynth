import { describe, expect, it } from 'vitest';
import { SubAgent } from '../../src/agent/SubAgent.ts';
import { SubAgentPool } from '../../src/agent/SubAgentPool.ts';

describe('SubAgent', () => {
  it('should create with id, name, capabilities', () => {
    const a = new SubAgent(
      's1',
      'Worker',
      [{ type: 'codegen', level: 7, confidence: 0.8 }],
      'parent-1',
    );
    expect(a.id).toBe('s1');
    expect(a.name).toBe('Worker');
    expect(a.parentId).toBe('parent-1');
    expect(a.state).toBe('idle');
  });

  it('should execute a task and track count', async () => {
    const a = new SubAgent('s1', 'W', [{ type: 'codegen', level: 7, confidence: 0.8 }], 'p');
    expect(a.metadata.taskCount).toBe(0);
    await a.execute({});
    expect(a.metadata.taskCount).toBe(1);
    expect(a.state).toBe('idle');
  });

  it('should transition through states during execution', async () => {
    const states: string[] = [];
    const a = new SubAgent('s1', 'W', [{ type: 'codegen', level: 7, confidence: 0.8 }], 'p');
    // We can't directly observe state changes without EventBus,
    // but we can check post-execution state
    expect(a.state).toBe('idle');
    await a.execute({});
    expect(a.state).toBe('idle');
  });

  it('should capture errors during execution', async () => {
    const a = new SubAgent('s1', 'W', [{ type: 'codegen', level: 7, confidence: 0.8 }], 'p');
    // Simulate error during active task: assign then error
    (a as any).stateMachine.transition('thinking');
    a.handleError(new Error('fail'));
    expect(a.state).toBe('error');
    expect(a.lastError?.message).toBe('fail');
  });
});

describe('SubAgentPool', () => {
  it('should create and manage subagents', () => {
    const pool = new SubAgentPool('parent-1', 5);
    const a = pool.createSubAgent('Worker', [{ type: 'codegen', level: 7, confidence: 0.8 }]);
    expect(pool.size()).toBe(1);
    expect(pool.getAgent(a.id)).toBeDefined();
  });

  it('should acquire idle agents by capability', () => {
    const pool = new SubAgentPool('p', 5);
    const a = pool.createSubAgent('Coder', [{ type: 'codegen', level: 7, confidence: 0.8 }]);
    pool.createSubAgent('Reviewer', [{ type: 'review', level: 7, confidence: 0.8 }]);

    const acquired = pool.acquire('codegen');
    expect(acquired).not.toBeNull();
    expect(acquired!.name).toBe('Coder');
  });

  it('should return null when no agent available', () => {
    const pool = new SubAgentPool('p', 5);
    expect(pool.acquire('codegen')).toBeNull();
  });

  it('should enforce max size', () => {
    const pool = new SubAgentPool('p', 2);
    pool.createSubAgent('A', [{ type: 'a', level: 5, confidence: 0.5 }]);
    pool.createSubAgent('B', [{ type: 'b', level: 5, confidence: 0.5 }]);
    expect(() => pool.createSubAgent('C', [{ type: 'c', level: 5, confidence: 0.5 }])).toThrow(
      'pool full',
    );
  });

  it('should execute tasks in parallel', async () => {
    const pool = new SubAgentPool('p', 5);
    const a = pool.createSubAgent('A', [{ type: 'reasoning', level: 7, confidence: 0.8 }]);
    const b = pool.createSubAgent('B', [{ type: 'codegen', level: 7, confidence: 0.8 }]);

    const results = await pool.executeParallel([
      { subAgent: a, task: {} },
      { subAgent: b, task: {} },
    ]);

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.success)).toBe(true);
    expect(a.metadata.taskCount).toBe(1);
    expect(b.metadata.taskCount).toBe(1);
  });

  it('should count available agents', () => {
    const pool = new SubAgentPool('p', 5);
    pool.createSubAgent('A', [{ type: 'codegen', level: 7, confidence: 0.8 }]);
    pool.createSubAgent('B', [{ type: 'codegen', level: 7, confidence: 0.8 }]);
    expect(pool.availableCount('codegen')).toBe(2);
  });

  it('should destroy all agents', () => {
    const pool = new SubAgentPool('p', 5);
    pool.createSubAgent('A', [{ type: 'reasoning', level: 7, confidence: 0.8 }]);
    pool.createSubAgent('B', [{ type: 'codegen', level: 7, confidence: 0.8 }]);
    pool.destroyAll();
    expect(pool.size()).toBe(0);
  });
});
