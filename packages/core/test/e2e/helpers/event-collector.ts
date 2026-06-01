import type { EventPayload, EventTopic } from '../../../src/message-bus/EventBus.ts';
import type { MessageBus } from '../../../src/message-bus/MessageBus.ts';

export interface EventRecord {
  topic: EventTopic;
  payload: EventPayload;
  timestamp: number;
}

export function collectEvents(bus: MessageBus): EventRecord[] {
  const events: EventRecord[] = [];
  const topics: EventTopic[] = [
    'task.submitted',
    'task.completed',
    'hop.recorded',
    'anomaly.detected',
    'intervention.executed',
    'agent.response',
    'hitl.requested',
    'hitl.resolved',
    'engine.started',
    'engine.stopped',
  ];
  for (const topic of topics) {
    bus.subscribe(topic, (t, payload) => {
      events.push({ topic: t, payload: payload as EventPayload, timestamp: Date.now() });
    });
  }
  return events;
}
