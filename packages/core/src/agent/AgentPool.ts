import type { AgentId, Capability, CapabilityType } from '@mynth/sdk';
import type { MessageBus } from '../message-bus/MessageBus.ts';
import { BaseAgent } from './BaseAgent.ts';

export class AgentPool {
  private agents = new Map<AgentId, BaseAgent>();
  private bus?: MessageBus;

  setBus(bus: MessageBus): void {
    this.bus = bus;
  }

  createAgent(id: string, name: string, capabilities: Capability[]): BaseAgent {
    const agent = new BaseAgent(id, name, capabilities, this.bus as any);
    this.agents.set(agent.id, agent);
    return agent;
  }

  acquire(capabilityType: CapabilityType): BaseAgent | null {
    for (const agent of this.agents.values()) {
      if (agent.state === 'idle' && agent.capabilities.some((c) => c.type === capabilityType)) {
        return agent;
      }
    }
    return null;
  }

  release(agent: BaseAgent): void {
    agent.complete();
  }

  getAgent(agentId: AgentId): BaseAgent | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  findByCapability(capabilityType: CapabilityType): BaseAgent[] {
    return this.getAllAgents().filter((a) => a.capabilities.some((c) => c.type === capabilityType));
  }

  destroyAgent(agentId: AgentId): void {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.shutdown();
      this.agents.delete(agentId);
    }
  }
}
