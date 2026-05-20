import type { Capability, CapabilityType } from '@mynth/sdk';
import type { EventBus } from '../message-bus/EventBus.ts';
import { SubAgent } from './SubAgent.ts';

export interface ParallelResult {
  subAgentId: string;
  success: boolean;
  error?: string;
}

export class SubAgentPool {
  private agents: SubAgent[] = [];
  private counter = 0;

  constructor(
    private parentId: string,
    private maxSize = 5,
    private eventBus?: EventBus,
  ) {}

  createSubAgent(name: string, capabilities: Capability[]): SubAgent {
    if (this.agents.length >= this.maxSize) {
      throw new Error(`SubAgent pool full (max ${this.maxSize})`);
    }
    const id = `${this.parentId}/sub/${this.counter++}`;
    const agent = new SubAgent(id, name, capabilities, this.parentId, this.eventBus);
    this.agents.push(agent);
    return agent;
  }

  acquire(capabilityType: CapabilityType): SubAgent | null {
    const idx = this.agents.findIndex(
      (a) => a.state === 'idle' && a.capabilities.some((c) => c.type === capabilityType),
    );
    if (idx === -1) return null;
    return this.agents[idx];
  }

  release(agent: SubAgent): void {
    // SubAgent resets to idle on execute completion, nothing extra needed
  }

  getAgent(id: string): SubAgent | undefined {
    return this.agents.find((a) => a.id === id);
  }

  getAll(): SubAgent[] {
    return [...this.agents];
  }

  size(): number {
    return this.agents.length;
  }

  availableCount(capabilityType: CapabilityType): number {
    return this.agents.filter(
      (a) => a.state === 'idle' && a.capabilities.some((c) => c.type === capabilityType),
    ).length;
  }

  async executeParallel(
    tasks: Array<{ subAgent: SubAgent; task: unknown }>,
  ): Promise<ParallelResult[]> {
    const results = await Promise.allSettled(
      tasks.map(({ subAgent, task }) => subAgent.execute(task)),
    );
    return tasks.map(({ subAgent }, i) => {
      const r = results[i];
      return {
        subAgentId: subAgent.id,
        success: r.status === 'fulfilled',
        error: r.status === 'rejected' ? String(r.reason) : undefined,
      };
    });
  }

  destroyAll(): void {
    this.agents = [];
  }
}
