export type EventTopic =
  | 'agent.state_changed'
  | 'task.submitted'
  | 'task.completed'
  | 'transfer.started'
  | 'transfer.completed'
  | 'hop.recorded'
  | 'anomaly.detected'
  | 'intervention.executed';

export interface AgentStateChangedEvent {
  agentId: string;
  fromState: string;
  toState: string;
}

export interface TaskSubmittedEvent {
  taskId: string;
  description: string;
}

export interface TaskCompletedEvent {
  taskId: string;
  status: string;
  hops: number;
}

export interface TransferStartedEvent {
  from: string;
  to: string;
  reason: string;
}

export interface TransferCompletedEvent {
  from: string;
  to: string;
  duration: number;
}

export interface HopRecordedEvent {
  from: string;
  to: string;
  note: string;
  duration: number;
  hopNumber: number;
}

export interface AnomalyDetectedEvent {
  type: string;
  agentId?: string;
  details?: Record<string, unknown>;
}

export interface InterventionExecutedEvent {
  type: string;
  reason?: string;
}

export type EventPayload =
  | AgentStateChangedEvent
  | TaskSubmittedEvent
  | TaskCompletedEvent
  | TransferStartedEvent
  | TransferCompletedEvent
  | HopRecordedEvent
  | AnomalyDetectedEvent
  | InterventionExecutedEvent;

export type EventHandler = (topic: EventTopic, payload: EventPayload) => void;

export class EventBus {
  private handlers = new Map<EventTopic, Set<EventHandler>>();

  publish<T extends EventPayload>(topic: EventTopic, payload: T): void {
    const handlers = this.handlers.get(topic);
    if (handlers) {
      for (const handler of handlers) {
        handler(topic, payload);
      }
    }
  }

  subscribe(topic: EventTopic, handler: EventHandler): () => void {
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, new Set());
    }
    this.handlers.get(topic)!.add(handler);
    return () => {
      this.handlers.get(topic)?.delete(handler);
    };
  }

  clear(): void {
    this.handlers.clear();
  }
}
