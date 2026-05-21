import { describe, expect, it } from 'vitest';
import { FallbackProvider } from '../../src/llm/FallbackProvider.ts';
import { MockProvider } from './MockProvider.ts';

describe('FallbackProvider', () => {
  it('should use primary provider first', async () => {
    const fallback = new FallbackProvider([new MockProvider(), new MockProvider()]);
    const res = await fallback.complete('hi', { model: 'x' });
    expect(res.content).toBe('Mock response');
  });

  it('should fallback on failure', async () => {
    let primaryCalled = false;
    const primary = {
      async complete() {
        primaryCalled = true;
        throw new Error('fail');
      },
      async *completeStream() {},
    };
    const fallback = new FallbackProvider([primary as any, new MockProvider()]);
    const res = await fallback.complete('hi', { model: 'x' });
    expect(primaryCalled).toBe(true);
    expect(res.content).toBe('Mock response');
  });
});
