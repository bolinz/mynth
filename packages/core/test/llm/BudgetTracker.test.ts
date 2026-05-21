import { describe, expect, it } from 'vitest';
import { BudgetTracker } from '../../src/llm/BudgetTracker.ts';

describe('BudgetTracker', () => {
  it('should track token usage per task', () => {
    const bt = new BudgetTracker();
    bt.record('task-1', 'reasoning', 100, 50);
    const usage = bt.getTaskUsage('task-1');
    expect(usage.inputTokens).toBe(100);
    expect(usage.outputTokens).toBe(50);
  });

  it('should reject when over budget', () => {
    const bt = new BudgetTracker({ perTaskInput: 200 });
    bt.record('t1', 'r', 150, 50);
    bt.record('t1', 'r', 100, 50);
    expect(bt.check('t1', 'r')).toBe(false);
  });

  it('should accept when under budget', () => {
    const bt = new BudgetTracker({ perTaskInput: 1000 });
    bt.record('t1', 'r', 100, 50);
    expect(bt.check('t1', 'r')).toBe(true);
  });
});
