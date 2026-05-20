import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/message-bus/EventBus.ts';

describe('EventBus', () => {
  it('should publish and receive events', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe('hop.recorded', handler);
    bus.publish('hop.recorded', { from: 'a', to: 'b', note: 'test', duration: 10, hopNumber: 1 });
    expect(handler).toHaveBeenCalledWith(
      'hop.recorded',
      expect.objectContaining({ from: 'a', to: 'b' }),
    );
  });

  it('should support multiple subscribers per topic', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.subscribe('task.submitted', h1);
    bus.subscribe('task.submitted', h2);
    bus.publish('task.submitted', { taskId: 't1', description: 'test' });
    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('should not call handlers for other topics', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.subscribe('hop.recorded', handler);
    bus.publish('task.completed', { taskId: 't1', status: 'done', hops: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should unsubscribe', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    const unsub = bus.subscribe('hop.recorded', handler);
    unsub();
    bus.publish('hop.recorded', { from: 'a', to: 'b', note: 'test', duration: 10, hopNumber: 1 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should clear all handlers', () => {
    const bus = new EventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.subscribe('hop.recorded', h1);
    bus.subscribe('task.submitted', h2);
    bus.clear();
    bus.publish('hop.recorded', { from: 'a', to: 'b', note: 't', duration: 10, hopNumber: 1 });
    bus.publish('task.submitted', { taskId: 't1', description: 'test' });
    expect(h1).not.toHaveBeenCalled();
    expect(h2).not.toHaveBeenCalled();
  });
});
