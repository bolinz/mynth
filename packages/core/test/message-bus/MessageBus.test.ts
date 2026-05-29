import { describe, expect, it, vi } from 'vitest';
import { MessageBus } from '../../src/message-bus/MessageBus.ts';

describe('MessageBus', () => {
  it('should publish and subscribe to events', () => {
    const bus = new MessageBus();
    const handler = vi.fn();
    bus.subscribe('task.submitted', handler);
    bus.publish('task.submitted', { taskId: 't1', description: 'test' });
    expect(handler.mock.calls[0][1]).toEqual({ taskId: 't1', description: 'test' });
  });

  it('should unsubscribe events', () => {
    const bus = new MessageBus();
    const handler = vi.fn();
    const unsub = bus.subscribe('task.submitted', handler);
    unsub();
    bus.publish('task.submitted', { taskId: 't1', description: 'test' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle multiple subscribers on same topic', () => {
    const bus = new MessageBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.subscribe('hop.recorded', h1);
    bus.subscribe('hop.recorded', h2);
    bus.publish('hop.recorded', { from: 'a', to: 'b', note: '', duration: 5, hopNumber: 1 });
    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  it('should send and receive messages', async () => {
    const bus = new MessageBus();
    bus.send('consumer-1', {
      id: '1',
      type: 'msg',
      from: 'sender',
      to: 'consumer-1',
      payload: 'hello',
    });
    const msg = await bus.receive('consumer-1');
    expect(msg).not.toBeNull();
    expect(msg!.payload).toBe('hello');
    expect(msg!.timestamp).toBeGreaterThan(0);
  });

  it('should register consumer with handler', () => {
    const bus = new MessageBus();
    const handler = vi.fn();
    bus.registerConsumer('consumer-1', handler);
    bus.send('consumer-1', {
      id: '2',
      type: 'msg',
      from: 'sender',
      to: 'consumer-1',
      payload: 'data',
    });
    // Handler is called synchronously by MemoryQueue.enqueue when consumer is registered
    expect(handler).toHaveBeenCalled();
  });

  it('should handle enqueue rejection without unhandled rejection', async () => {
    const bus = new MessageBus();
    (bus as any).queue.enqueue = async () => {
      throw new Error('queue full');
    };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.send('consumer-1', {
      id: '1',
      type: 'msg',
      from: 'sender',
      to: 'consumer-1',
      payload: 'hello',
    });

    await new Promise((r) => setTimeout(r, 50));
    expect(spy).toHaveBeenCalledWith('[MessageBus] send failed:', expect.any(Error));
    spy.mockRestore();
  });

  it('should clear all events and messages', () => {
    const bus = new MessageBus();
    const handler = vi.fn();
    bus.subscribe('task.submitted', handler);
    bus.publish('task.submitted', { taskId: 't1', description: 'test' });
    expect(handler).toHaveBeenCalledTimes(1);

    bus.clear();
    bus.publish('task.submitted', { taskId: 't2', description: 'test2' });
    expect(handler).toHaveBeenCalledTimes(1); // no more calls
  });

  it('should publish to topics and not to others', () => {
    const bus = new MessageBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.subscribe('task.submitted', h1);
    bus.subscribe('agent.response', h2);
    bus.publish('task.submitted', { taskId: 't1', description: 'test' });
    expect(h1).toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });
});
