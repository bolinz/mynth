import type { TaskContext } from '@mynth/sdk';
import { describe, expect, it, vi } from 'vitest';
import { AgentPool } from '../../src/agent/AgentPool.ts';
import { ChainTransferManager } from '../../src/chain/ChainTransferManager.ts';
import { Intervener } from '../../src/meta/Intervener.ts';
import { Observer } from '../../src/meta/Observer.ts';

function ctx(overrides?: Partial<TaskContext>): TaskContext {
  return {
    taskId: 't1',
    description: 'test',
    priority: 1,
    status: 'running',
    neededCapabilities: [],
    hopHistory: [],
    currentAgent: '',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('Observer', () => {
  it('should start and stop monitoring', () => {
    const obs = new Observer();
    obs.start({ interval: 100 });
    expect(obs.isRunning()).toBe(true);
    obs.stop();
    expect(obs.isRunning()).toBe(false);
  });

  it('should detect cycle pattern anomaly', () => {
    const obs = new Observer();
    obs.recordHop('a', 'b', 100);
    obs.recordHop('b', 'c', 100);
    obs.recordHop('a', 'b', 100);
    obs.recordHop('b', 'c', 100);
    const anomalies = obs.detectAnomalies();
    expect(anomalies.some((a) => a.type === 'cycle_pattern')).toBe(true);
  });

  it('should detect duration exceeded with 3+ slow hops', () => {
    const obs = new Observer();
    obs.recordHop('a', 'b', 600);
    obs.recordHop('b', 'c', 600);
    obs.recordHop('c', 'd', 600);
    const anomalies = obs.detectAnomalies();
    expect(anomalies.some((a) => a.type === 'duration_exceeded')).toBe(true);
  });

  it('should detect agent error after threshold', () => {
    const obs = new Observer();
    obs.recordError('bad-agent');
    obs.recordError('bad-agent');
    obs.recordError('bad-agent');
    const anomalies = obs.detectAnomalies();
    expect(anomalies.some((a) => a.type === 'agent_error' && a.agentId === 'bad-agent')).toBe(true);
  });
});

describe('ChainTransferManager intervention integration', () => {
  it('should warn and continue on duration exceeded', async () => {
    const pool = new AgentPool();
    pool.createAgent('a', 'A', [{ type: 'reasoning', level: 8, confidence: 0.9 }]);
    pool.createAgent('b', 'B', [{ type: 'codegen', level: 8, confidence: 0.85 }]);
    const obs = new Observer();
    // Pre-seed 4 slow hops so avg stays >500 even after real hops
    for (let i = 0; i < 4; i++) obs.recordHop('x', 'y', 700);
    const inv = new Intervener();

    const manager = new ChainTransferManager(pool, obs, inv, 10);
    const result = await manager.startChain(
      ctx({
        neededCapabilities: [
          { type: 'reasoning', level: 5, confidence: 0.5 },
          { type: 'codegen', level: 5, confidence: 0.5 },
        ],
      }),
      'a',
    );

    expect(result.interventions.length).toBeGreaterThanOrEqual(1);
    expect(result.interventions.some((i) => i.type === 'pause')).toBe(true);
  });

  it('should reroute on cycle pattern', async () => {
    const pool = new AgentPool();
    pool.createAgent('loop-a', 'A', [{ type: 'reasoning', level: 8, confidence: 0.9 }]);
    const obs = new Observer();
    obs.recordHop('a', 'b', 50);
    obs.recordHop('b', 'a', 50);
    obs.recordHop('a', 'b', 50);
    obs.recordHop('b', 'a', 50);
    const inv = new Intervener();

    const manager = new ChainTransferManager(pool, obs, inv, 10);
    const result = await manager.startChain(
      ctx({
        neededCapabilities: [{ type: 'reasoning', level: 5, confidence: 0.5 }],
      }),
      'loop-a',
    );

    expect(result.interventions.some((i) => i.type === 'reroute')).toBe(true);
  });

  it('should replace agent on error', async () => {
    const pool = new AgentPool();
    pool.createAgent('a', 'A', [{ type: 'reasoning', level: 8, confidence: 0.9 }]);
    pool.createAgent('b', 'B', [{ type: 'reasoning', level: 8, confidence: 0.9 }]);
    const obs = new Observer();
    obs.recordError('a');
    obs.recordError('a');
    obs.recordError('a');
    const inv = new Intervener();

    const manager = new ChainTransferManager(pool, obs, inv, 10);
    const result = await manager.startChain(
      ctx({
        neededCapabilities: [{ type: 'reasoning', level: 5, confidence: 0.5 }],
      }),
      'a',
    );

    expect(result.status).toBe('complete');
  });
});
