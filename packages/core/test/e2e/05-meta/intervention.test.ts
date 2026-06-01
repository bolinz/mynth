import { describe, expect, it } from 'vitest';
import { AgentPool } from '../../../src/agent/AgentPool.ts';
import { ChainTransferManager } from '../../../src/chain/ChainTransferManager.ts';
import { Intervener } from '../../../src/meta/Intervener.ts';
import { Observer } from '../../../src/meta/Observer.ts';

function makeCtx(desc: string) {
  return {
    taskId: `task_${Date.now()}`,
    description: desc,
    priority: 1,
    status: 'running' as const,
    neededCapabilities: [{ type: 'reasoning' as const, level: 5, confidence: 0.5 }],
    hopHistory: [],
    currentAgent: '',
    createdAt: Date.now(),
  };
}

describe('e2e: meta layer intervention', () => {
  it('should detect cycle and reroute', async () => {
    const pool = new AgentPool();
    pool.createAgent('a', 'Agent A', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    pool.createAgent('b', 'Agent B', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    pool.createAgent('c', 'Agent C', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);

    const observer = new Observer();
    observer.recordHop('a', 'b', 100);
    observer.recordHop('b', 'a', 100);
    observer.recordHop('a', 'b', 100);
    observer.recordHop('b', 'a', 100);
    observer.recordHop('a', 'b', 100);
    observer.recordHop('b', 'a', 100);
    observer.recordHop('a', 'b', 100);
    observer.recordHop('b', 'a', 100);

    const intervener = new Intervener();
    const manager = new ChainTransferManager(pool, observer, intervener, 20);

    const result = await manager.startChain(makeCtx('test'), 'a');

    expect(result.interventions.length).toBeGreaterThan(0);
    expect(result.interventions.some((i) => i.type === 'reroute')).toBe(true);
  });

  it('should escalate when needed capability is missing from pool', async () => {
    const pool = new AgentPool();
    pool.createAgent('a', 'Agent A', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);

    const observer = new Observer();
    const intervener = new Intervener();
    const manager = new ChainTransferManager(pool, observer, intervener, 3);

    // Agent A has reasoning, but task also needs codegen (which no agent has)
    const ctx = makeCtx('test');
    ctx.neededCapabilities = [
      { type: 'reasoning', level: 5, confidence: 0.5 },
      { type: 'codegen', level: 5, confidence: 0.5 },
    ];
    const result = await manager.startChain(ctx, 'a');

    expect(result.status).toBe('escalated');
  });

  it('should replace agent on repeated errors', async () => {
    const pool = new AgentPool();
    pool.createAgent('a', 'Agent A', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
    pool.createAgent('b', 'Agent B', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);

    const observer = new Observer();
    observer.recordError('a', 'test error');
    observer.recordError('a', 'test error');
    observer.recordError('a', 'test error');

    const intervener = new Intervener();
    const manager = new ChainTransferManager(pool, observer, intervener, 10);

    const result = await manager.startChain(makeCtx('test'), 'a');

    expect(result.interventions.some((i) => i.type === 'replace')).toBe(true);
  });
});
