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

export interface BackpressureStatus {
  severity: 'mild' | 'critical' | 'normal';
  queueDepth: number;
  maxCapacity: number;
  suggestedDelayMs: number;
}

export class MemoryQueue {
  private queues = new Map<string, QueueMessage[]>();
  private consumers = new Map<string, MessageHandler>();
  private maxQueueSize = 100;
  private mildThreshold = 0.6;
  private criticalThreshold = 0.8;

  setCapacity(maxSize: number): void {
    this.maxQueueSize = maxSize;
  }

  setThresholds(mild: number, critical: number): void {
    this.mildThreshold = mild;
    this.criticalThreshold = critical;
  }

  async enqueue(message: QueueMessage): Promise<BackpressureStatus | null> {
    const q = this.queues.get(message.to) || [];

    if (q.length >= this.maxQueueSize) {
      return {
        severity: 'critical',
        queueDepth: q.length,
        maxCapacity: this.maxQueueSize,
        suggestedDelayMs: 1000,
      };
    }

    q.push(message);
    this.queues.set(message.to, q);

    const handler = this.consumers.get(message.to);
    if (handler) handler(message);

    const ratio = q.length / this.maxQueueSize;
    if (ratio >= this.criticalThreshold) {
      return {
        severity: 'critical',
        queueDepth: q.length,
        maxCapacity: this.maxQueueSize,
        suggestedDelayMs: 500,
      };
    }
    if (ratio >= this.mildThreshold) {
      return {
        severity: 'mild',
        queueDepth: q.length,
        maxCapacity: this.maxQueueSize,
        suggestedDelayMs: 100,
      };
    }

    return null;
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
