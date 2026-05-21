import { describe, expect, it } from 'vitest';
import { WarmPool } from '../../src/agent/WarmPool.ts';

describe('WarmPool', () => {
  it('should create and acquire agents by capability', () => {
    const pool = new WarmPool();
    pool.createAgent('r1', 'Reasoner', [{ type: 'reasoning', level: 8, confidence: 0.9 }], 'hot');
    const agent = pool.acquire('reasoning');
    expect(agent).not.toBeNull();
    expect(agent!.id).toBe('r1');
  });

  it('should return null for unknown capability', () => {
    const pool = new WarmPool();
    expect(pool.acquire('codegen')).toBeNull();
  });

  it('should prefer hot agents over warm', () => {
    const pool = new WarmPool();
    pool.createAgent('cold-r', 'Cold', [{ type: 'reasoning', level: 5, confidence: 0.5 }], 'cold');
    pool.createAgent('hot-r', 'Hot', [{ type: 'reasoning', level: 8, confidence: 0.9 }], 'hot');
    const agent = pool.acquire('reasoning');
    expect(agent!.id).toBe('hot-r');
  });

  it('should evict idle agents', () => {
    const pool = new WarmPool(undefined, -1); // immediate eviction timeout
    pool.createAgent('r1', 'R', [{ type: 'reasoning', level: 8, confidence: 0.9 }], 'warm');
    const evicted = pool.evictIdle();
    expect(evicted).toBe(1);
  });

  it('should not evict hot agents', () => {
    const pool = new WarmPool(undefined, -1);
    pool.createAgent('r1', 'R', [{ type: 'reasoning', level: 8, confidence: 0.9 }], 'hot');
    const evicted = pool.evictIdle();
    expect(evicted).toBe(0);
  });

  it('should return correct size', () => {
    const pool = new WarmPool();
    pool.createAgent('r1', 'R', [{ type: 'reasoning', level: 8, confidence: 0.9 }]);
    expect(pool.size('reasoning')).toBe(1);
  });
});
