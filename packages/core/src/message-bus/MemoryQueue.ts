export interface QueueMessage {
  id: string;
  type: string;
  from: string;
  to: string;
  payload: unknown;
  timestamp: number;
  headers?: Record<string, string>;
}

export type MessageHandler = (message: QueueMessage) => void;

export class MemoryQueue {
  private queues = new Map<string, QueueMessage[]>();
  private consumers = new Map<string, MessageHandler>();

  async enqueue(message: QueueMessage): Promise<void> {
    const q = this.queues.get(message.to) || [];
    q.push(message);
    this.queues.set(message.to, q);
    const handler = this.consumers.get(message.to);
    if (handler) {
      handler(message);
    }
  }

  async dequeue(consumerId: string): Promise<QueueMessage | null> {
    const q = this.queues.get(consumerId);
    if (!q || q.length === 0) return null;
    return q.shift() ?? null;
  }

  async size(): Promise<number> {
    let total = 0;
    for (const q of this.queues.values()) {
      total += q.length;
    }
    return total;
  }

  async clear(): Promise<void> {
    this.queues.clear();
  }

  registerConsumer(consumerId: string, handler: MessageHandler): void {
    this.consumers.set(consumerId, handler);
  }

  unregisterConsumer(consumerId: string): void {
    this.consumers.delete(consumerId);
  }
}
