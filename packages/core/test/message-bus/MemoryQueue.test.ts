import { describe, expect, it } from 'vitest';
import { MemoryQueue } from '../../src/message-bus/MemoryQueue.ts';

describe('MemoryQueue', () => {
  it('should enqueue and dequeue messages', async () => {
    const q = new MemoryQueue();
    await q.enqueue({ id: '1', type: 'execute', from: 'a', to: 'b', payload: {}, timestamp: 1 });
    const msg = await q.dequeue('b');
    expect(msg).not.toBeNull();
    expect(msg!.id).toBe('1');
  });

  it('should return null when queue is empty', async () => {
    const q = new MemoryQueue();
    const msg = await q.dequeue('x');
    expect(msg).toBeNull();
  });

  it('should track queue size', async () => {
    const q = new MemoryQueue();
    await q.enqueue({ id: '1', type: 'execute', from: 'a', to: 'b', payload: {}, timestamp: 1 });
    expect(await q.size()).toBe(1);
    await q.dequeue('b');
    expect(await q.size()).toBe(0);
  });

  it('should clear all messages', async () => {
    const q = new MemoryQueue();
    await q.enqueue({ id: '1', type: 'execute', from: 'a', to: 'b', payload: {}, timestamp: 1 });
    await q.clear();
    expect(await q.size()).toBe(0);
  });

  it('should deliver to correct consumer', async () => {
    const q = new MemoryQueue();
    await q.enqueue({ id: '1', type: 'execute', from: 'a', to: 'b', payload: {}, timestamp: 1 });
    await q.enqueue({ id: '2', type: 'execute', from: 'a', to: 'c', payload: {}, timestamp: 2 });
    const msgB = await q.dequeue('b');
    const msgC = await q.dequeue('c');
    expect(msgB!.id).toBe('1');
    expect(msgC!.id).toBe('2');
  });

  it('should work with consumer registration', async () => {
    const q = new MemoryQueue();
    const handled: string[] = [];
    q.registerConsumer('b', (msg) => {
      handled.push(msg.id);
    });
    await q.enqueue({ id: '1', type: 'execute', from: 'a', to: 'b', payload: {}, timestamp: 1 });
    expect(handled).toEqual(['1']);
  });
});
