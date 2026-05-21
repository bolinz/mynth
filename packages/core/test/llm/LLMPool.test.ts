import { describe, expect, it } from 'vitest';
import { LLMPool } from '../../src/llm/LLMPool.ts';
import { MockProvider } from './MockProvider.ts';

describe('LLMPool', () => {
  it('should register and resolve a provider', () => {
    const pool = new LLMPool();
    pool.register('mock', new MockProvider());
    const resolved = pool.resolve({ model: 'mock' });
    expect(resolved).toBeDefined();
  });

  it('should throw for unknown model', () => {
    const pool = new LLMPool();
    expect(() => pool.resolve({ model: 'nonexistent' })).toThrow();
  });

  it('should route by model prefix', () => {
    const pool = new LLMPool();
    pool.register('claude-haiku', new MockProvider());
    const resolved = pool.resolve({ model: 'claude-haiku-20240307' });
    expect(resolved).toBeDefined();
  });
});
