import { BaseAgent } from './BaseAgent.ts';
import { WarmPool } from './WarmPool.ts';
import type { Capability, CapabilityType } from '@mynth/sdk';
import type { EventBus } from '../message-bus/EventBus.ts';

export class AgentPool {
  private warm = new WarmPool();

  setBus(bus: EventBus): void {
    this.warm = new WarmPool(bus as any);
  }

  createAgent(id: string, name: string, capabilities: Capability[]): BaseAgent {
    return this.warm.createAgent(id, name, capabilities, 'cold');
  }

  getAgent(id: string): BaseAgent | undefined {
    return this.warm.getAgent(id);
  }

  getAllAgents(): BaseAgent[] {
    return this.warm.getAllAgents();
  }

  acquire(capabilityType: CapabilityType): BaseAgent | null {
    return this.warm.acquire(capabilityType);
  }

  release(agent: BaseAgent): void {
    this.warm.release(agent);
  }

  findAgent(capabilityType: CapabilityType): BaseAgent | null {
    return this.warm.acquire(capabilityType);
  }

  findByCapability(capabilityType: CapabilityType): BaseAgent[] {
    return this.getAllAgents().filter((a) => a.capabilities.some((c) => c.type === capabilityType));
  }

  destroyAgent(agentId: string): void {
    const agent = this.warm.getAgent(agentId);
    if (agent) {
      agent.shutdown();
      this.warm.removeAgent(agentId);
    }
  }

  evictIdle(): number {
    return this.warm.evictIdle();
  }
}
