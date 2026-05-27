import type { Persistence } from '../persistence/Persistence.ts';
import type { GlobalMemory } from './GlobalMemory.ts';

export interface MemoryItem {
  key: string;
  value: unknown;
  timestamp: number;
  importance: number;
  accessCount: number;
}

export class PrivateMemory {
  private l1 = new Map<string, MemoryItem>();
  private maxShortTerm = 50;

  constructor(
    private agentId: string,
    private persistence?: Persistence,
  ) {}

  async remember(key: string, value: unknown, importance = 0.5): Promise<void> {
    const item: MemoryItem = {
      key,
      value,
      timestamp: Date.now(),
      importance,
      accessCount: 0,
    };

    this.l1.set(key, item);
    if (this.persistence) {
      await this.persistence.put(`mem:${this.agentId}:${key}`, item);
    }

    // LRU eviction
    if (this.l1.size > this.maxShortTerm) {
      const oldest = [...this.l1.entries()].sort(([, a], [, b]) => a.timestamp - b.timestamp)[0];
      if (oldest) this.l1.delete(oldest[0]);
    }
  }

  async recall(key: string): Promise<unknown> {
    const l1 = this.l1.get(key);
    if (l1) {
      l1.accessCount++;
      return l1.value;
    }

    if (this.persistence) {
      const item = (await this.persistence.get(`mem:${this.agentId}:${key}`)) as MemoryItem | null;
      if (item) {
        item.accessCount++;
        this.l1.set(key, item);
        return item.value;
      }
    }

    return null;
  }

  async forget(key: string): Promise<void> {
    this.l1.delete(key);
    if (this.persistence) {
      await this.persistence.delete(`mem:${this.agentId}:${key}`);
    }
  }

  async prune(threshold = 0.2): Promise<number> {
    const now = Date.now();
    let removed = 0;
    for (const [key, item] of this.l1) {
      const daysOld = (now - item.timestamp) / 86400000;
      const decayed = item.importance * 0.9 ** daysOld;
      if (decayed < threshold && item.accessCount < 3) {
        this.l1.delete(key);
        if (this.persistence) {
          await this.persistence.delete(`mem:${this.agentId}:${key}`);
        }
        removed++;
      }
    }
    return removed;
  }

  size(): number {
    return this.l1.size;
  }

  async backup(globalMemory: GlobalMemory, namespace?: string): Promise<void> {
    const prefix = `mem:${this.agentId}:${namespace ? namespace + ':' : ''}`;
    const keys: Record<string, boolean> = {};
    for (const [key, item] of this.l1) {
      await globalMemory.write(`${prefix}${key}`, item.value);
      keys[key] = true;
    }
    await globalMemory.write(`${prefix}__snapshot__`, keys);
  }

  async restore(globalMemory: GlobalMemory, namespace?: string): Promise<number> {
    const prefix = `mem:${this.agentId}:${namespace ? namespace + ':' : ''}`;
    let restored = 0;
    if (this.persistence) {
      const raw = await this.persistence.range(`mem:${this.agentId}:`, `mem:${this.agentId}~`);
      if (raw.length > 0) return 0;
    }
    const snapshot = await globalMemory.read(`${prefix}__snapshot__`);
    if (snapshot && typeof snapshot === 'object') {
      const keys = snapshot as Record<string, unknown>;
      for (const key of Object.keys(keys)) {
        const val = await globalMemory.read(`${prefix}${key}`);
        if (val !== null) {
          await this.remember(key, val);
          restored++;
        }
      }
    }
    return restored;
  }
}
