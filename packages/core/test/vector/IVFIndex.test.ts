import { describe, expect, it } from 'vitest';
import { IVFIndex } from '../../src/vector/IVFIndex.ts';

function makeVec(dim: number, fill: number): number[] {
  return new Array(dim).fill(fill);
}

describe('IVFIndex', () => {
  it('should train and search with probe clusters', () => {
    const idx = new IVFIndex(3, 2);
    const items = new Map<string, number[]>();
    // Three clusters: near [1], near [-1], near [0]
    for (let i = 0; i < 10; i++) items.set(`pos-${i}`, makeVec(4, 0.9 + i * 0.01));
    for (let i = 0; i < 10; i++) items.set(`neg-${i}`, makeVec(4, -0.9 - i * 0.01));
    for (let i = 0; i < 10; i++) items.set(`mid-${i}`, makeVec(4, 0.1 + i * 0.01));

    idx.train(items);
    const results = idx.search(makeVec(4, 1.0), 5, items);
    expect(results).toHaveLength(5);
    // All results should have positive scores
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
    }
  });

  it('should return empty results for empty index', () => {
    const idx = new IVFIndex();
    const results = idx.search([1, 0], 5, new Map());
    expect(results).toHaveLength(0);
  });

  it('should fall back to brute force when not trained', () => {
    const idx = new IVFIndex(3);
    const items = new Map<string, number[]>();
    items.set('a', [1, 0]);
    items.set('b', [0, 1]);
    items.set('c', [-1, 0]);

    const results = idx.search([1, 0], 2, items);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('a'); // most similar to [1,0]
  });

  it('should handle empty training data', () => {
    const idx = new IVFIndex();
    idx.train(new Map());
    // Should not throw
    const results = idx.search([1, 0], 5, new Map());
    expect(results).toHaveLength(0);
  });

  it('should return items sorted by score descending', () => {
    const idx = new IVFIndex(1); // single cluster, deterministic
    const items = new Map<string, number[]>();
    items.set('close', [0.99, 0.01]);
    items.set('far', [-0.99, -0.01]);
    items.set('mid', [0.5, 0.5]);

    idx.train(items);
    const results = idx.search([1, 0], 3, items);
    expect(results.length).toBe(3);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('should handle single-cluster cases', () => {
    const idx = new IVFIndex(1, 1);
    const items = new Map<string, number[]>();
    items.set('only', [1, 1]);
    idx.train(items);
    const results = idx.search([1, 1], 1, items);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('only');
    expect(results[0].score).toBeCloseTo(1, 1);
  });

  it('should handle zero vectors (all zeros)', () => {
    const idx = new IVFIndex();
    const items = new Map<string, number[]>();
    items.set('zero', [0, 0, 0]);
    idx.train(items);
    const results = idx.search([0, 0, 0], 1, items);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBe(0);
  });
});
