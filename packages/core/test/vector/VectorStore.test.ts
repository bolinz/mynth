import { describe, expect, it } from 'vitest';
import { VectorStore } from '../../src/vector/VectorStore.ts';

function vec(n: number, dim = 4): number[] {
  return Array.from({ length: dim }, (_, i) => (i === 0 ? n : 0));
}

describe('VectorStore', () => {
  it('should add and search vectors by cosine similarity', async () => {
    const store = new VectorStore(4);
    await store.add('a', [1, 0, 0, 0], { label: 'aaa' });
    await store.add('b', [0, 1, 0, 0], { label: 'bbb' });
    const results = await store.search([1, 0, 0, 0], 2);
    expect(results[0].id).toBe('a');
    expect(results[0].score).toBeCloseTo(1, 1);
    expect(results[1].id).toBe('b');
  });

  it('should handle empty store', async () => {
    const store = new VectorStore(4);
    const results = await store.search([1, 0, 0, 0], 5);
    expect(results).toEqual([]);
  });

  it('should update vector', async () => {
    const store = new VectorStore(4);
    await store.add('x', [1, 0, 0, 0]);
    await store.update('x', [0, 1, 0, 0]);
    const results = await store.search([0, 1, 0, 0], 1);
    expect(results[0].id).toBe('x');
  });

  it('should delete vector', async () => {
    const store = new VectorStore(4);
    await store.add('x', [1, 0, 0, 0]);
    await store.delete('x');
    const results = await store.search([1, 0, 0, 0], 1);
    expect(results).toEqual([]);
  });

  it('should query by metadata filter', async () => {
    const store = new VectorStore(4);
    await store.add('a', [1, 0, 0, 0], { type: 'dog' });
    await store.add('b', [0, 1, 0, 0], { type: 'cat' });
    const ids = await store.query({ type: 'dog' });
    expect(ids).toEqual(['a']);
  });
});
