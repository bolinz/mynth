import type { HopRecord, TaskContext, TenantContext } from '@mynth/sdk';
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
  private tenantPrefix: string;

  constructor(
    private db: Persistence,
    tenant?: TenantContext,
  ) {
    this.tenantPrefix = tenant ? `tenant:${tenant.tenantId}:` : '';
  }

  private k(key: string): string {
    return `${this.tenantPrefix}${key}`;
  }

  async saveHop(taskId: string, hop: HopRecord): Promise<void> {
    const key = this.k(`state:hop:${taskId}:${Date.now()}`);
    await this.db.put(key, hop);

    const index = await this.getHopIndex(taskId);
    index.push(key);
    await this.db.put(this.k(`state:index:hop:${taskId}`), index);
  }

  async loadTaskHops(taskId: string): Promise<HopRecord[]> {
    const index: string[] =
      ((await this.db.get(this.k(`state:index:hop:${taskId}`))) as string[]) ?? [];
    const hops: HopRecord[] = [];
    for (const key of index) {
      const hop = await this.db.get(key);
      if (hop) hops.push(hop as HopRecord);
    }
    return hops;
  }

  async saveTask(task: StoredTask): Promise<void> {
    await this.db.put(this.k(`state:task:${task.taskId}`), task);

    const index: string[] = ((await this.db.get(this.k('state:index:tasks'))) as string[]) ?? [];
    if (!index.includes(task.taskId)) {
      index.push(task.taskId);
      await this.db.put(this.k('state:index:tasks'), index);
    }
  }

  async loadAllTasks(): Promise<StoredTask[]> {
    const index: string[] = ((await this.db.get(this.k('state:index:tasks'))) as string[]) ?? [];
    const tasks: StoredTask[] = [];
    for (const taskId of index) {
      const task = await this.db.get(this.k(`state:task:${taskId}`));
      if (task) tasks.push(task as StoredTask);
    }
    return tasks;
  }

  async saveAgentConfig(config: StoredAgentConfig): Promise<void> {
    await this.db.put(this.k(`state:agent:${config.id}`), config);

    const index: string[] = ((await this.db.get(this.k('state:index:agents'))) as string[]) ?? [];
    if (!index.includes(config.id)) {
      index.push(config.id);
      await this.db.put(this.k('state:index:agents'), index);
    }
  }

  async loadAgentConfigs(): Promise<StoredAgentConfig[]> {
    const index: string[] = ((await this.db.get(this.k('state:index:agents'))) as string[]) ?? [];
    const configs: StoredAgentConfig[] = [];
    for (const id of index) {
      const config = await this.db.get(this.k(`state:agent:${id}`));
      if (config) configs.push(config as StoredAgentConfig);
    }
    return configs;
  }

  private async getHopIndex(taskId: string): Promise<string[]> {
    return ((await this.db.get(this.k(`state:index:hop:${taskId}`))) as string[]) ?? [];
  }
}
