import type { PrivateMemory } from '../memory/PrivateMemory.ts';
import type { VectorStore } from '../vector/VectorStore.ts';

export type ContextMode = 'incremental' | 'full' | 'vector_retrieval';

export interface ContextManager {
  getContext(task: string, history: string[]): Promise<string>;
  updateContext(result: string): void;
  clear(): void;
}

export class IncrementalContextManager implements ContextManager {
  private recent: string[] = [];

  async getContext(task: string, _history: string[]): Promise<string> {
    if (this.recent.length === 0) return task;
    const relevant = this.recent.slice(-3);
    return `${task}\n\nPrevious work:\n${relevant.join('\n')}`;
  }

  updateContext(result: string): void {
    this.recent.push(result);
    if (this.recent.length > 10) this.recent.shift();
  }

  clear(): void {
    this.recent = [];
  }
}

export class FullContextManager implements ContextManager {
  private fullHistory: string[] = [];

  async getContext(task: string, _history: string[]): Promise<string> {
    if (this.fullHistory.length === 0) return task;
    return `${task}\n\nFull context (${this.fullHistory.length} entries):\n${this.fullHistory.join('\n')}`;
  }

  updateContext(result: string): void {
    this.fullHistory.push(result);
  }

  clear(): void {
    this.fullHistory = [];
  }
}

export class VectorRetrievalContextManager implements ContextManager {
  private memories: string[] = [];

  constructor(private vectorStore: VectorStore) {}

  async getContext(task: string, _history: string[]): Promise<string> {
    if (this.memories.length === 0) return task;
    // Use vector search to find relevant memories
    const taskVec = this.textToSimpleVec(task);
    const results = await this.vectorStore.search(taskVec, 5);
    const relevant = results
      .map((r) => this.memories[Number.parseInt(r.id)])
      .filter(Boolean)
      .slice(0, 3);
    if (relevant.length === 0) return task;
    return `${task}\n\nRelevant context:\n${relevant.join('\n')}`;
  }

  updateContext(result: string): void {
    const idx = this.memories.length;
    this.memories.push(result);
    // Store vector for later retrieval (simplified - uses index as id)
    const vec = this.textToSimpleVec(result);
    this.vectorStore.add(String(idx), vec);
  }

  clear(): void {
    this.memories = [];
  }

  private textToSimpleVec(text: string): number[] {
    const hash = text.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return Array.from({ length: 16 }, (_, i) => Math.sin(hash * (i + 1)));
  }
}
