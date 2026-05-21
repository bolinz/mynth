import type { Capability, CapabilityType } from '@mynth/sdk';
import type { EventBus } from '../message-bus/EventBus.ts';
import { BaseAgent } from './BaseAgent.ts';

export type WarmLevel = 'hot' | 'warm' | 'cold';

interface WarmAgent {
  level: WarmLevel;
  agent: BaseAgent;
  lastUsed: number;
}

export class WarmPool {
  private pools = new Map<CapabilityType, WarmAgent[]>();
  private idleTimeout: number;

  constructor(
    private eventBus?: EventBus,
    idleTimeout = 60000,
  ) {
    this.idleTimeout = idleTimeout;
  }

  createAgent(
    id: string,
    name: string,
    capabilities: Capability[],
    level: WarmLevel = 'cold',
  ): BaseAgent {
    const agent = new BaseAgent(id, name, capabilities, this.eventBus as any);
    for (const cap of capabilities) {
      const pool = this.pools.get(cap.type) || [];
      pool.push({ level, agent, lastUsed: Date.now() });
      this.pools.set(cap.type, pool);
    }
    return agent;
  }

  acquire(capabilityType: CapabilityType): BaseAgent | null {
    const pool = this.pools.get(capabilityType);
    if (!pool || pool.length === 0) return null;

    // Try hot first, then warm, then cold
    for (const level of ['hot', 'warm', 'cold'] as WarmLevel[]) {
      const entry = pool.find((a) => a.level === level && a.agent.state === 'idle');
      if (entry) {
        entry.lastUsed = Date.now();
        if (entry.level === 'warm') entry.level = 'hot';
        return entry.agent;
      }
    }

    return null;
  }

  release(agent: BaseAgent): void {
    agent.complete();
    // Downgrade to warm after release
    for (const pool of this.pools.values()) {
      for (const entry of pool) {
        if (entry.agent.id === agent.id) {
          entry.level = 'warm';
          entry.lastUsed = Date.now();
        }
      }
    }
  }

  getAllAgents(): BaseAgent[] {
    const seen = new Set<string>();
    const agents: BaseAgent[] = [];
    for (const pool of this.pools.values()) {
      for (const entry of pool) {
        if (!seen.has(entry.agent.id)) {
          seen.add(entry.agent.id);
          agents.push(entry.agent);
        }
      }
    }
    return agents;
  }

  getAgent(id: string): BaseAgent | undefined {
    return this.getAllAgents().find((a) => a.id === id);
  }

  evictIdle(): number {
    let evicted = 0;
    const now = Date.now();
    for (const [capType, pool] of this.pools) {
      const remaining = pool.filter((entry) => {
        if (entry.level === 'hot') return true;
        if (now - entry.lastUsed < this.idleTimeout) return true;
        evicted++;
        return false;
      });
      this.pools.set(capType, remaining);
    }
    return evicted;
  }

  size(capabilityType?: CapabilityType): number {
    if (capabilityType) {
      return this.pools.get(capabilityType)?.length ?? 0;
    }
    let total = 0;
    for (const pool of this.pools.values()) {
      total += pool.length;
    }
    return total;
  }
}
