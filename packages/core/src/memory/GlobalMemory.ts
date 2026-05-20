interface MemoryEntry {
  value: unknown;
  timestamp: number;
}

export class GlobalMemory {
  private data = new Map<string, MemoryEntry>();

  async read(key: string): Promise<unknown> {
    const entry = this.data.get(key);
    return entry ? entry.value : null;
  }

  async write(key: string, value: unknown): Promise<void> {
    this.data.set(key, { value, timestamp: Date.now() });
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
  }

  snapshot(): Map<string, MemoryEntry> {
    return new Map(this.data);
  }

  restore(snap: Map<string, MemoryEntry>): void {
    this.data = new Map(snap);
  }
}
