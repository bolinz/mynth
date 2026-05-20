import type { Persistence } from '../persistence/Persistence.ts';

interface MemoryEntry {
  value: unknown;
  timestamp: number;
}

export class GlobalMemory {
  private data = new Map<string, MemoryEntry>();

  constructor(private persistence?: Persistence) {}

  async read(key: string): Promise<unknown> {
    const entry = this.data.get(key);
    if (entry !== undefined) return entry.value;
    if (this.persistence) {
      const val = await this.persistence.get(key);
      if (val !== null) {
        this.data.set(key, { value: val, timestamp: Date.now() });
        return val;
      }
    }
    return null;
  }

  async write(key: string, value: unknown): Promise<void> {
    this.data.set(key, { value, timestamp: Date.now() });
    if (this.persistence) {
      await this.persistence.put(key, value);
    }
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
    if (this.persistence) {
      await this.persistence.delete(key);
    }
  }

  snapshot(): Map<string, MemoryEntry> {
    return new Map(this.data);
  }

  restore(snap: Map<string, MemoryEntry>): void {
    this.data = new Map(snap);
  }
}
