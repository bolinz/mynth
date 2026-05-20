import type { Task } from '@mynth/sdk';
import { describe, expect, it } from 'vitest';
import { Scheduler } from '../../src/scheduler/Scheduler.ts';
import { TaskQueue } from '../../src/scheduler/TaskQueue.ts';

describe('TaskQueue', () => {
  it('should enqueue and dequeue tasks in priority order', () => {
    const q = new TaskQueue();
    q.enqueue({ id: '1', description: 'low', priority: 5 } as Task);
    q.enqueue({ id: '2', description: 'high', priority: 1 } as Task);
    q.enqueue({ id: '3', description: 'mid', priority: 3 } as Task);
    expect(q.dequeue()!.taskId).toBe('2');
    expect(q.dequeue()!.taskId).toBe('3');
    expect(q.dequeue()!.taskId).toBe('1');
  });

  it('should return null when empty', () => {
    const q = new TaskQueue();
    expect(q.dequeue()).toBeNull();
  });

  it('should report size', () => {
    const q = new TaskQueue();
    expect(q.size()).toBe(0);
    q.enqueue({ id: '1', description: 't', priority: 1 } as Task);
    expect(q.size()).toBe(1);
  });
});

describe('Scheduler', () => {
  it('should submit and complete a task', async () => {
    const s = new Scheduler();
    const taskId = await s.submit({
      id: 't1',
      description: 'test',
      priority: 1,
    } as Task);
    expect(taskId).toBe('t1');
    const ctx = s.getTask('t1');
    expect(ctx?.status).toBe('queued');
  });

  it('should list all tasks', async () => {
    const s = new Scheduler();
    await s.submit({ id: 'a', description: 'a', priority: 1 } as Task);
    await s.submit({ id: 'b', description: 'b', priority: 2 } as Task);
    expect(s.getAllTasks()).toHaveLength(2);
  });

  it('should cancel a task', async () => {
    const s = new Scheduler();
    await s.submit({ id: 't1', description: 't', priority: 1 } as Task);
    await s.cancel('t1');
    expect(s.getTask('t1')?.status).toBe('cancelled');
  });

  it('should update task status', async () => {
    const s = new Scheduler();
    await s.submit({ id: 't1', description: 't', priority: 1 } as Task);
    s.updateStatus('t1', 'running');
    expect(s.getTask('t1')?.status).toBe('running');
  });

  it('should dequeue tasks in priority order', async () => {
    const s = new Scheduler();
    await s.submit({ id: 'a', description: 'a', priority: 5 } as Task);
    await s.submit({ id: 'b', description: 'b', priority: 1 } as Task);
    const first = s.dequeue();
    expect(first?.taskId).toBe('b');
    const second = s.dequeue();
    expect(second?.taskId).toBe('a');
  });

  it('should notify on status change', async () => {
    const s = new Scheduler();
    const changes: string[] = [];
    s.subscribe((_id, status) => changes.push(status));
    await s.submit({ id: 't1', description: 't', priority: 1 } as Task);
    s.updateStatus('t1', 'running');
    expect(changes).toContain('running');
  });
});
