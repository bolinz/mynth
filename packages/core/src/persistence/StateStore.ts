import type { HopRecord, TaskContext } from '@mynth/sdk';
import type { Capability } from '@mynth/sdk';
import type { Persistence } from './Persistence.ts';

export interface StoredAgentConfig {
  id: string;
  name: string;
  capabilities: Capability[];
}

export interface StoredTask {
  taskId: string;
  description: string;
  status: string;
  hops: number;
  createdAt: number;
}

export class StateStore {
  constructor(private db: Persistence) {}

  async saveHop(taskId: string, hop: HopRecord): Promise<void> {
    const key = `state:hop:${taskId}:${Date.now()}`;
    await this.db.put(key, hop);

    const index = await this.getHopIndex(taskId);
    index.push(key);
    await this.db.put(`state:index:hop:${taskId}`, index);
  }

  async loadTaskHops(taskId: string): Promise<HopRecord[]> {
    const index: string[] = ((await this.db.get(`state:index:hop:${taskId}`)) as string[]) ?? [];
    const hops: HopRecord[] = [];
    for (const key of index) {
      const hop = await this.db.get(key);
      if (hop) hops.push(hop as HopRecord);
    }
    return hops;
  }

  async saveTask(task: StoredTask): Promise<void> {
    await this.db.put(`state:task:${task.taskId}`, task);

    const index: string[] = ((await this.db.get('state:index:tasks')) as string[]) ?? [];
    if (!index.includes(task.taskId)) {
      index.push(task.taskId);
      await this.db.put('state:index:tasks', index);
    }
  }

  async loadAllTasks(): Promise<StoredTask[]> {
    const index: string[] = ((await this.db.get('state:index:tasks')) as string[]) ?? [];
    const tasks: StoredTask[] = [];
    for (const taskId of index) {
      const task = await this.db.get(`state:task:${taskId}`);
      if (task) tasks.push(task as StoredTask);
    }
    return tasks;
  }

  async saveAgentConfig(config: StoredAgentConfig): Promise<void> {
    await this.db.put(`state:agent:${config.id}`, config);

    const index: string[] = ((await this.db.get('state:index:agents')) as string[]) ?? [];
    if (!index.includes(config.id)) {
      index.push(config.id);
      await this.db.put('state:index:agents', index);
    }
  }

  async loadAgentConfigs(): Promise<StoredAgentConfig[]> {
    const index: string[] = ((await this.db.get('state:index:agents')) as string[]) ?? [];
    const configs: StoredAgentConfig[] = [];
    for (const id of index) {
      const config = await this.db.get(`state:agent:${id}`);
      if (config) configs.push(config as StoredAgentConfig);
    }
    return configs;
  }

  private async getHopIndex(taskId: string): Promise<string[]> {
    return ((await this.db.get(`state:index:hop:${taskId}`)) as string[]) ?? [];
  }
}
