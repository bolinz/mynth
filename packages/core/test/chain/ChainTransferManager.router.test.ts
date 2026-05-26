import type { TaskContext } from '@mynth/sdk';
import { describe, expect, it } from 'vitest';
import { AgentPool } from '../../src/agent/AgentPool.ts';
import { ChainTransferManager } from '../../src/chain/ChainTransferManager.ts';
import { CapabilityRouter } from '../../src/llm/CapabilityRouter.ts';
import { LLMPool } from '../../src/llm/LLMPool.ts';
import { MockProvider } from '../llm/MockProvider.ts';

function ctx(overrides?: Partial<TaskContext>): TaskContext {
  return {
    taskId: 't1',
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

describe('ChainTransferManager with CapabilityRouter', () => {
  it('should use router to resolve provider', async () => {
    const pool = new AgentPool();
    pool.createAgent('reasoner', 'Reasoner', [{ type: 'reasoning', level: 8, confidence: 0.9 }]);
    const llmPool = new LLMPool();
    const mockProvider = new MockProvider();
    llmPool.register('claude-sonnet', mockProvider);
    const router = new CapabilityRouter(llmPool);

    const manager = new ChainTransferManager(pool, undefined, undefined, 10, undefined, llmPool, undefined, undefined, router);
    const result = await manager.startChain(ctx(), 'reasoner');

    expect(result.status).toBe('complete');
  });
});
