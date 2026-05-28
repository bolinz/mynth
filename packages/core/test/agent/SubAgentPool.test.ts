import { describe, expect, it, vi } from 'vitest';
import { SubAgent } from '../../src/agent/SubAgent.ts';
import { SubAgentPool } from '../../src/agent/SubAgentPool.ts';

describe('SubAgentPool', () => {
  it('should create sub agents', () => {
    const pool = new SubAgentPool('parent');
    const agent = pool.createSubAgent('worker', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    expect(agent.id).toContain('parent/sub/');
    expect(agent.state).toBe('idle');
    expect(pool.size()).toBe(1);
  });

  it('should reject creation beyond maxSize', () => {
    const pool = new SubAgentPool('parent', 2);
    pool.createSubAgent('a', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    pool.createSubAgent('b', [{ type: 'codegen', level: 5, confidence: 0.5 }]);
    expect(() => pool.createSubAgent('c', [{ type: 'review', level: 5, confidence: 0.5 }])).toThrow(
      'pool full',
    );
  });

  it('should acquire idle agent by capability', () => {
    const pool = new SubAgentPool('parent');
    pool.createSubAgent('worker', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    pool.createSubAgent('coder', [{ type: 'codegen', level: 5, confidence: 0.5 }]);

    const acquired = pool.acquire('reasoning');
    expect(acquired).not.toBeNull();
    expect(acquired!.capabilities.some((c) => c.type === 'reasoning')).toBe(true);
  });

  it('should return null when no idle agent matches capability', () => {
    const pool = new SubAgentPool('parent');
    pool.createSubAgent('worker', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    expect(pool.acquire('codegen')).toBeNull();
  });

  it('should get agent by id', () => {
    const pool = new SubAgentPool('parent');
    const created = pool.createSubAgent('worker', [
      { type: 'reasoning', level: 5, confidence: 0.5 },
    ]);
    expect(pool.getAgent(created.id)).toBe(created);
    expect(pool.getAgent('nonexistent')).toBeUndefined();
  });

  it('should list all agents', () => {
    const pool = new SubAgentPool('parent');
    pool.createSubAgent('a', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    pool.createSubAgent('b', [{ type: 'codegen', level: 5, confidence: 0.5 }]);
    expect(pool.getAll()).toHaveLength(2);
  });

  it('should count available agents by capability', () => {
    const pool = new SubAgentPool('parent');
    pool.createSubAgent('a', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    pool.createSubAgent('b', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    expect(pool.availableCount('reasoning')).toBe(2);
    expect(pool.availableCount('codegen')).toBe(0);
  });

  it('should execute tasks in parallel', async () => {
    const pool = new SubAgentPool('parent');
    const a = pool.createSubAgent('a', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    const b = pool.createSubAgent('b', [{ type: 'codegen', level: 5, confidence: 0.5 }]);

    const results = await pool.executeParallel([
      { subAgent: a, task: 'task-1' },
      { subAgent: b, task: 'task-2' },
    ]);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });

  it('should report failure on sub-agent error', async () => {
    const pool = new SubAgentPool('parent');
    const failing = new SubAgent(
      'fail',
      'F',
      [{ type: 'reasoning', level: 5, confidence: 0.5 }],
      'p',
    );
    vi.spyOn(failing, 'execute').mockRejectedValue(new Error('oops'));

    const results = await pool.executeParallel([{ subAgent: failing, task: 'failing-task' }]);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain('oops');
  });

  it('should destroy all agents', () => {
    const pool = new SubAgentPool('parent');
    pool.createSubAgent('a', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    pool.destroyAll();
    expect(pool.size()).toBe(0);
  });

  it('should release without side effects', () => {
    const pool = new SubAgentPool('parent');
    const agent = pool.createSubAgent('a', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    pool.release(agent); // no-op, should not throw
    expect(pool.size()).toBe(1);
  });
});
