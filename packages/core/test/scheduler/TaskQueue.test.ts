import { describe, expect, it } from 'vitest';
import { TaskQueue } from '../../src/scheduler/TaskQueue.ts';

describe('TaskQueue', () => {
  it('should enqueue and return context', () => {
    const q = new TaskQueue();
    const ctx = q.enqueue({ id: 't1', description: 'test', priority: 1 });
    expect(ctx.taskId).toBe('t1');
    expect(ctx.status).toBe('queued');
    expect(q.size()).toBe(1);
  });

  it('should dequeue in priority order', () => {
    const q = new TaskQueue();
    q.enqueue({ id: 'low', description: 'low', priority: 5 });
    q.enqueue({ id: 'high', description: 'high', priority: 1 });
    q.enqueue({ id: 'mid', description: 'mid', priority: 3 });

    expect(q.dequeue()!.taskId).toBe('high');
    expect(q.dequeue()!.taskId).toBe('mid');
    expect(q.dequeue()!.taskId).toBe('low');
  });

  it('should return null when empty', () => {
    const q = new TaskQueue();
    expect(q.dequeue()).toBeNull();
    expect(q.size()).toBe(0);
  });

  it('should remove task by id', () => {
    const q = new TaskQueue();
    q.enqueue({ id: 't1', description: 'first', priority: 1 });
    q.enqueue({ id: 't2', description: 'second', priority: 2 });
    q.remove('t1');
    expect(q.size()).toBe(1);
    expect(q.dequeue()!.taskId).toBe('t2');
  });

  it('should handle remove on empty queue', () => {
    const q = new TaskQueue();
    q.remove('nonexistent');
    expect(q.size()).toBe(0);
  });
});
