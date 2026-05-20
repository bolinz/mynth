import type { AgentId } from '@mynth/sdk';
import type { GlobalMemory } from './GlobalMemory.ts';

export interface CheckpointData {
  id: string;
  agentId: AgentId;
  timestamp: number;
  state: string;
  partialResult: unknown;
}

export class CheckpointManager {
  private checkpoints: CheckpointData[] = [];

  constructor(private memory: GlobalMemory) {}

  async create(data: Omit<CheckpointData, 'id' | 'timestamp'>): Promise<CheckpointData> {
    const cp: CheckpointData = {
      id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      ...data,
    };
    this.checkpoints.push(cp);
    return cp;
  }

  restore(checkpointId: string): CheckpointData | null {
    return this.checkpoints.find((cp) => cp.id === checkpointId) ?? null;
  }

  list(): CheckpointData[] {
    return [...this.checkpoints];
  }

  cleanup(maxCount: number): void {
    if (this.checkpoints.length > maxCount) {
      this.checkpoints = this.checkpoints.slice(-maxCount);
    }
  }
}
