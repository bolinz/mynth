import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from '../../src/llm/CircuitBreaker.ts';
import { MockProvider } from './MockProvider.ts';

describe('CircuitBreaker', () => {
  it('should pass through when closed', async () => {
    const cb = new CircuitBreaker(new MockProvider(), 3);
    const res = await cb.complete('hi', { model: 'x' });
    expect(res.content).toBe('Mock response');
  });

  it('should open after threshold failures', async () => {
    let callCount = 0;
    const failing = {
      async complete() {
        callCount++;
        throw new Error('fail');
      },
      async *completeStream() {},
    };
    const cb = new CircuitBreaker(failing as any, 2);
    await expect(cb.complete('hi', { model: 'x' })).rejects.toThrow('fail');
    await expect(cb.complete('hi', { model: 'x' })).rejects.toThrow('fail');
    await expect(cb.complete('hi', { model: 'x' })).rejects.toThrow('circuit open');
    expect(callCount).toBe(2);
  });
});
