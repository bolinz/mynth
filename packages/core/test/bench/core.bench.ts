import { bench, describe } from 'vitest';
import { AgentPool } from '../../src/agent/AgentPool.ts';
import { ChainTransferManager } from '../../src/chain/ChainTransferManager.ts';
import { MemoryQueue } from '../../src/message-bus/MemoryQueue.ts';
import { Intervener } from '../../src/meta/Intervener.ts';
import { Observer } from '../../src/meta/Observer.ts';
import { Scheduler } from '../../src/scheduler/Scheduler.ts';
import { VectorStore } from '../../src/vector/VectorStore.ts';

describe('ChainTransferManager', () => {
  bench(
    'single agent chain',
    async () => {
      const pool = new AgentPool();
      pool.createAgent('a', 'A', [{ type: 'reasoning', level: 8, confidence: 0.9 }]);
      const obs = new Observer();
      const inv = new Intervener();
      const mgr = new ChainTransferManager(pool, obs, inv, 10);
      const ctx = {
        taskId: 'bench',
        description: 'test',
        priority: 1,
        status: 'running' as const,
        neededCapabilities: [{ type: 'reasoning' as const, level: 5, confidence: 0.5 }],
        hopHistory: [],
        currentAgent: '',
        createdAt: Date.now(),
      };
      await mgr.startChain(ctx, 'a');
    },
    { time: 2000, iterations: 10 },
  );
});

describe('MemoryQueue', () => {
  bench(
    'enqueue/dequeue 10K messages',
    async () => {
      const q = new MemoryQueue();
      for (let i = 0; i < 10000; i++) {
        await q.enqueue({
          id: `${i}`,
          type: 'test',
          from: 'a',
          to: 'b',
          payload: {},
          timestamp: i,
        });
      }
      for (let i = 0; i < 10000; i++) {
        await q.dequeue('b');
      }
    },
    { time: 2000, iterations: 5 },
  );
});

describe('VectorStore', () => {
  bench(
    'search 10K vectors',
    async () => {
      const store = new VectorStore(128);
      for (let i = 0; i < 10000; i++) {
        const v = Array.from({ length: 128 }, () => Math.random());
        await store.add(`doc_${i}`, v);
      }
      const query = Array.from({ length: 128 }, () => Math.random());
      await store.search(query, 10);
    },
    { time: 2000, iterations: 5 },
  );
});

describe('Scheduler', () => {
  bench(
    'submit/dequeue 1000 tasks',
    async () => {
      const s = new Scheduler();
      for (let i = 0; i < 1000; i++) {
        await s.submit({ id: `${i}`, description: 't', priority: 1 });
      }
      for (let i = 0; i < 1000; i++) {
        s.dequeue();
      }
    },
    { time: 2000, iterations: 10 },
  );
});
