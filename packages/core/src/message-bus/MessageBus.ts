import { EventBus, type EventHandler, type EventPayload, type EventTopic } from './EventBus.ts';
import { MemoryQueue, type QueueMessage } from './MemoryQueue.ts';

export type { EventTopic, EventPayload, EventHandler, QueueMessage };

export type MessageHandler = (message: QueueMessage) => void;

export class MessageBus {
  private events = new EventBus();
  private queue = new MemoryQueue();

  // Event methods (pub/sub)
  publish<T extends EventPayload>(topic: EventTopic, payload: T): void {
    this.events.publish(topic, payload);
  }

  subscribe(topic: EventTopic, handler: EventHandler): () => void {
    return this.events.subscribe(topic, handler);
  }

  // Message methods (point-to-point)
  send(to: string, message: Omit<QueueMessage, 'timestamp'>): void {
    this.queue
      .enqueue({ ...message, timestamp: Date.now() })
      .then((status) => {
        if (status && status.severity === 'critical') {
          console.warn(
            `[Backpressure] Queue critical: depth ${status.queueDepth}/${status.maxCapacity}`,
          );
        }
      })
      .catch((err) => {
        console.error('[MessageBus] send failed:', err);
      });
  }

  receive(consumerId: string): Promise<QueueMessage | null> {
    return this.queue.dequeue(consumerId);
  }

  registerConsumer(consumerId: string, handler: MessageHandler): void {
    this.queue.registerConsumer(consumerId, handler);
  }

  // Lifecycle
  clear(): void {
    this.events.clear();
    this.queue.clear();
  }
}
