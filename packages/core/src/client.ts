import type { CoreEngine } from './engine/CoreEngine.ts';

export interface TaskResult {
  taskId: string;
  status: string;
  hops: number;
}

export interface MynthClient {
  run(task: string): Promise<TaskResult>;
  status(): Promise<Array<{ id: string; name: string; state: string; capabilities: string[] }>>;
  tasks(): Promise<Array<{ taskId: string; description: string; status: string }>>;
  subscribe(event: string, handler: (...args: unknown[]) => void): () => void;
}

export class InProcessClient implements MynthClient {
  constructor(private engine: CoreEngine) {}

  async run(task: string): Promise<TaskResult> {
    const result = await this.engine.executeTask(task);
    return {
      taskId: result.taskId,
      status: result.status,
      hops: result.hops,
    };
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

  subscribe(event: string, handler: (...args: unknown[]) => void): () => void {
    return this.engine.eventBus.subscribe(event as any, handler as any);
  }
}
