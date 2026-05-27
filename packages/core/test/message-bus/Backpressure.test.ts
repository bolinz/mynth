import { describe, expect, it } from 'vitest';
import { MemoryQueue } from '../../src/message-bus/MemoryQueue.ts';

describe('MemoryQueue backpressure', () => {
  it('should return null when queue is below threshold', async () => {
    const q = new MemoryQueue();
    q.setCapacity(100);
    q.setThresholds(0.6, 0.8);
    const result = await q.enqueue({
      id: '1',
      type: 'test',
      from: 'a',
      to: 'b',
      payload: {},
      timestamp: Date.now(),
    });
    expect(result).toBeNull();
  });

  it('should return mild at 60% capacity', async () => {
    const q = new MemoryQueue();
    q.setCapacity(10);
    q.setThresholds(0.6, 0.8);
    let lastResult = null;
    for (let i = 0; i < 7; i++) {
      lastResult = await q.enqueue({
        id: String(i),
        type: 'test',
        from: 'a',
        to: 'b',
        payload: {},
        timestamp: Date.now(),
      });
    }
    expect(lastResult).not.toBeNull();
    expect(lastResult!.severity).toBe('mild');
  });

  it('should return critical at 80% capacity', async () => {
    const q = new MemoryQueue();
    q.setCapacity(10);
    q.setThresholds(0.6, 0.8);
    let lastResult = null;
    for (let i = 0; i < 9; i++) {
      lastResult = await q.enqueue({
        id: String(i),
        type: 'test',
        from: 'a',
        to: 'b',
        payload: {},
        timestamp: Date.now(),
      });
    }
    expect(lastResult).not.toBeNull();
    expect(lastResult!.severity).toBe('critical');
  });

  it('should reject when queue is full', async () => {
    const q = new MemoryQueue();
    q.setCapacity(3);
    for (let i = 0; i < 4; i++) {
      const result = await q.enqueue({
        id: String(i),
        type: 'test',
        from: 'a',
        to: 'b',
        payload: {},
        timestamp: Date.now(),
      });
      if (i === 3) {
        expect(result).not.toBeNull();
        expect(result!.severity).toBe('critical');
        expect(result!.suggestedDelayMs).toBe(1000);
      }
    }
  });
});
