import { describe, expect, it } from 'vitest';
import { BudgetTracker } from '../../src/llm/BudgetTracker.ts';
import { CapabilityRouter } from '../../src/llm/CapabilityRouter.ts';
import { LLMPool } from '../../src/llm/LLMPool.ts';
import { MockProvider } from './MockProvider.ts';

describe('CapabilityRouter', () => {
  it('should resolve provider by capability', () => {
    const pool = new LLMPool();
    pool.register('claude-sonnet', new MockProvider());
    const router = new CapabilityRouter(pool);
    const result = router.resolve('codegen');
    expect(result).not.toBeNull();
    expect(result!.model).toBe('claude-sonnet');
  });

  it('should fallback on failure', () => {
    const pool = new LLMPool();
    pool.register('gpt-4o', new MockProvider());
    const router = new CapabilityRouter(pool);
    const result = router.resolve('codegen');
    expect(result!.model).toBe('gpt-4o');
  });

  it('should learn from success/failure', () => {
    const pool = new LLMPool();
    const router = new CapabilityRouter(pool);
    router.learn('reasoning', false);
    const stats = router.getStats('reasoning');
    expect(stats.failures).toBe(1);
  });

  it('should swap primary on repeated failures', () => {
    const pool = new LLMPool();
    pool.register('gpt-4o', new MockProvider());
    const router = new CapabilityRouter(pool);
    for (let i = 0; i < 10; i++) router.learn('reasoning', false);
    const result = router.resolve('reasoning');
    expect(result!.model).toBe('gpt-4o');
  });
});

describe('BudgetTracker multi-level', () => {
  it('should enforce per-task limit', () => {
    const bt = new BudgetTracker({ perTask: 500 });
    bt.record('t1', 'r', 400, 200);
    expect(bt.check('t1', 'r').allowed).toBe(false);
  });

  it('should enforce global daily limit', () => {
    const bt = new BudgetTracker({ perGlobal: { daily: 1000 } });
    bt.record('t1', 'r', 900, 300);
    expect(bt.check('t2', 'r').allowed).toBe(false);
  });

  it('should accept when under all limits', () => {
    const bt = new BudgetTracker({ perTask: 5000, perGlobal: { daily: 100000 } });
    bt.record('t1', 'r', 100, 50);
    expect(bt.check('t1', 'r').allowed).toBe(true);
  });
});
