import { describe, expect, it } from 'vitest';
import {
  FullContextManager,
  IncrementalContextManager,
  VectorRetrievalContextManager,
} from '../../src/agent/ContextManager.ts';
import { VectorStore } from '../../src/vector/VectorStore.ts';

describe('IncrementalContextManager', () => {
  it('should show recent context', async () => {
    const cm = new IncrementalContextManager();
    cm.updateContext('analysis done');
    cm.updateContext('code generated');
    const ctx = await cm.getContext('review code', []);
    expect(ctx).toContain('analysis done');
    expect(ctx).toContain('code generated');
  });

  it('should limit to recent entries', async () => {
    const cm = new IncrementalContextManager();
    for (let i = 0; i < 15; i++) cm.updateContext(`step ${i}`);
    const ctx = await cm.getContext('task', []);
    expect(ctx).not.toContain('step 0');
    expect(ctx).toContain('step 14');
  });

  it('should clear context', async () => {
    const cm = new IncrementalContextManager();
    cm.updateContext('data');
    cm.clear();
    const ctx = await cm.getContext('task', []);
    expect(ctx).not.toContain('data');
  });
});

describe('FullContextManager', () => {
  it('should include all history', async () => {
    const cm = new FullContextManager();
    cm.updateContext('A');
    cm.updateContext('B');
    const ctx = await cm.getContext('task', []);
    expect(ctx).toContain('A');
    expect(ctx).toContain('B');
  });
});

describe('VectorRetrievalContextManager', () => {
  it('should retrieve relevant context', async () => {
    const store = new VectorStore(16);
    const cm = new VectorRetrievalContextManager(store);
    cm.updateContext('unrelated info about weather');
    cm.updateContext('code review: found a bug in login');
    const ctx = await cm.getContext('review the login form', []);
    expect(ctx).toContain('Relevant context');
  });

  it('should handle empty memories', async () => {
    const store = new VectorStore(16);
    const cm = new VectorRetrievalContextManager(store);
    const ctx = await cm.getContext('task', []);
    expect(ctx).toBe('task');
  });
});
