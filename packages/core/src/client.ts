import type { CoreEngine, TaskResult } from './engine/CoreEngine.ts';
import type { EventPayload, EventTopic } from './message-bus/EventBus.ts';

export type { TaskResult };
export type { EventTopic, EventPayload };

export interface MynthClient {
  run(task: string): Promise<TaskResult>;
  status(): Promise<Array<{ id: string; name: string; state: string; capabilities: string[] }>>;
  tasks(): Promise<Array<{ taskId: string; description: string; status: string }>>;
  subscribe(
    topic: EventTopic,
    handler: (topic: EventTopic, payload: EventPayload) => void,
  ): () => void;
}

export class InProcessClient implements MynthClient {
  constructor(private engine: CoreEngine) {}

  async run(task: string): Promise<TaskResult> {
    return this.engine.executeTask(task);
  }

  async status(): Promise<
    Array<{ id: string; name: string; state: string; capabilities: string[] }>
  > {
    return this.engine
      .getAgentPool()
      .getAllAgents()
      .map((a) => ({
        id: a.id,
        name: a.name,
        state: a.state,
        capabilities: a.capabilities.map((c) => c.type),
      }));
  }

  async tasks(): Promise<Array<{ taskId: string; description: string; status: string }>> {
    return this.engine
      .getScheduler()
      .getAllTasks()
      .map((t) => ({
        taskId: t.taskId,
        description: t.description,
        status: t.status,
      }));
  }

  subscribe(
    topic: EventTopic,
    handler: (topic: EventTopic, payload: EventPayload) => void,
  ): () => void {
    return this.engine.eventBus.subscribe(topic, handler);
  }
}
