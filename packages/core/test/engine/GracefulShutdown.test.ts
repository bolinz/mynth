import { describe, expect, it } from 'vitest';
import { GracefulShutdown } from '../../src/engine/GracefulShutdown.ts';
import { GlobalMemory } from '../../src/memory/GlobalMemory.ts';
import { Scheduler } from '../../src/scheduler/Scheduler.ts';

describe('GracefulShutdown', () => {
  it('should drain without running tasks', async () => {
    const scheduler = new Scheduler();
    const memory = new GlobalMemory();
    const db = { close: async () => {} } as any;
    const gs = new GracefulShutdown(scheduler, memory, db, { drainTimeout: 1000 });
    await gs.shutdown();
    expect(gs.isDraining()).toBe(true);
  });

  it('should report draining state', () => {
    const gs = new GracefulShutdown({} as any, {} as any, {} as any, { drainTimeout: 1000 });
    expect(gs.isDraining()).toBe(false);
  });
});
