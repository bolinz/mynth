import { describe, expect, it } from 'vitest';
import { RetryProvider } from '../../src/llm/RetryProvider.ts';
import { FailingProvider, MockProvider } from './MockProvider.ts';

describe('RetryProvider', () => {
  it('should succeed on first attempt', async () => {
    const retry = new RetryProvider(new MockProvider(), 3);
    const res = await retry.complete('hello', { model: 'mock' });
    expect(res.content).toBe('Mock response');
  });

  it('should retry on 429 status', async () => {
    const failing = new FailingProvider(2, 429);
    const retry = new RetryProvider(failing, 3);
    const res = await retry.complete('hi', { model: 'x' });
    expect(res.content).toBe('ok');
    expect(failing.attempts).toBe(3);
  });
});
