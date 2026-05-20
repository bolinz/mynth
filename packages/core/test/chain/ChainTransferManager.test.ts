import type { TaskContext } from '@mynth/sdk';
import { describe, expect, it } from 'vitest';
import { AgentPool } from '../../src/agent/AgentPool.ts';
import { ChainTransferManager } from '../../src/chain/ChainTransferManager.ts';

function makeContext(overrides?: Partial<TaskContext>): TaskContext {
  return {
    taskId: 'test-task',
    description: 'test',
    priority: 1,
    status: 'running',
    neededCapabilities: [{ type: 'reasoning', level: 5, confidence: 0.5 }],
    hopHistory: [],
    currentAgent: '',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('ChainTransferManager', () => {
  it('should complete a task through a single agent', async () => {
    const pool = new AgentPool();
    pool.createAgent('reasoner', 'Reasoner', [{ type: 'reasoning', level: 8, confidence: 0.9 }]);

    const manager = new ChainTransferManager(pool);
    const result = await manager.startChain(
      makeContext({ neededCapabilities: [{ type: 'reasoning', level: 5, confidence: 0.5 }] }),
      'reasoner',
    );

    expect(result.status).toBe('complete');
    expect(result.hopCount).toBe(1);
    expect(result.finalAgent).toBe('reasoner');
  });

  it('should transfer between agents when multiple capabilities needed', async () => {
    const pool = new AgentPool();
    pool.createAgent('reasoner', 'Reasoner', [{ type: 'reasoning', level: 8, confidence: 0.9 }]);
    pool.createAgent('coder', 'Coder', [{ type: 'codegen', level: 8, confidence: 0.85 }]);

    const manager = new ChainTransferManager(pool);
    const result = await manager.startChain(
      makeContext({
        neededCapabilities: [
          { type: 'reasoning', level: 5, confidence: 0.5 },
          { type: 'codegen', level: 5, confidence: 0.5 },
        ],
      }),
      'reasoner',
    );

    expect(result.status).toBe('complete');
    expect(result.hopCount).toBeGreaterThanOrEqual(2);
  });

  it('should escalate when no agent can handle remaining work', async () => {
    const pool = new AgentPool();
    pool.createAgent('reasoner', 'Reasoner', [{ type: 'reasoning', level: 8, confidence: 0.9 }]);

    const manager = new ChainTransferManager(pool);
    const result = await manager.startChain(
      makeContext({
        neededCapabilities: [
          { type: 'reasoning', level: 5, confidence: 0.5 },
          { type: 'codegen', level: 5, confidence: 0.5 },
        ],
      }),
      'reasoner',
    );

    expect(result.status).toBe('escalated');
    expect(result.hopCount).toBeGreaterThanOrEqual(1);
  });

  it('should terminate when max hops exceeded', async () => {
    const pool = new AgentPool();
    pool.createAgent('loop-agent', 'Looper', [
      { type: 'reasoning', level: 8, confidence: 0.9 },
      { type: 'codegen', level: 8, confidence: 0.9 },
    ]);

    const manager = new ChainTransferManager(pool, undefined, undefined, 3);
    const result = await manager.startChain(
      makeContext({
        neededCapabilities: [
          { type: 'reasoning', level: 5, confidence: 0.5 },
          { type: 'codegen', level: 5, confidence: 0.5 },
          { type: 'review', level: 5, confidence: 0.5 },
        ],
      }),
      'loop-agent',
    );

    expect(result.hopCount).toBeLessThanOrEqual(3);
  });

  it('should track hop history', async () => {
    const pool = new AgentPool();
    pool.createAgent('a', 'A', [{ type: 'reasoning', level: 8, confidence: 0.9 }]);
    pool.createAgent('b', 'B', [{ type: 'codegen', level: 8, confidence: 0.85 }]);

    const manager = new ChainTransferManager(pool);
    await manager.startChain(
      makeContext({
        neededCapabilities: [
          { type: 'reasoning', level: 5, confidence: 0.5 },
          { type: 'codegen', level: 5, confidence: 0.5 },
        ],
      }),
      'a',
    );

    expect(manager.hops.length).toBeGreaterThanOrEqual(2);
    expect(manager.hops[0].fromAgent).toBe('a');
  });
});
