import { IVFIndex } from './IVFIndex.ts';

export interface VectorItem {
  id: string;
  vector: number[];
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export class VectorStore {
  private items = new Map<string, VectorItem>();
  private ivf = new IVFIndex();
  private rebuildThreshold = 50000;

  constructor(private dimension: number) {}

  async add(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    if (vector.length !== this.dimension) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.dimension}, got ${vector.length}`,
      );
    }
    this.items.set(id, { id, vector, metadata });
    if (this.items.size >= this.rebuildThreshold) {
      await this.rebuildIVF();
    }
  }

  async addBatch(items: VectorItem[]): Promise<void> {
    for (const item of items) {
      if (item.vector.length !== this.dimension) {
        throw new Error(
          `Vector dimension mismatch: expected ${this.dimension}, got ${item.vector.length}`,
        );
      }
      this.items.set(item.id, { id: item.id, vector: item.vector, metadata: item.metadata });
    }
    if (this.items.size >= this.rebuildThreshold) {
      await this.rebuildIVF();
    }
  }

  async search(query: number[], topK: number): Promise<SearchResult[]> {
    if (this.items.size === 0) return [];

    if (this.items.size < this.rebuildThreshold) {
      return this.bruteForceSearch(query, topK);
    }

    const vecs = new Map<string, number[]>();
    for (const [id, item] of this.items) {
      vecs.set(id, item.vector);
    }
    const results = this.ivf.search(query, topK, vecs);
    // Attach metadata
    for (const r of results) {
      r.metadata = this.items.get(r.id)?.metadata;
    }
    return results;
  }

  async update(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    if (!this.items.has(id)) {
      throw new Error(`Vector not found: ${id}`);
    }
    this.items.set(id, { id, vector, metadata });
    if (this.items.size >= this.rebuildThreshold) {
      await this.rebuildIVF();
    }
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async query(metadataFilter: Record<string, unknown>): Promise<string[]> {
    const results: string[] = [];
    for (const [id, item] of this.items) {
      if (item.metadata && this.matchesFilter(item.metadata, metadataFilter)) {
        results.push(id);
      }
    }
    return results;
  }

  size(): number {
    return this.items.size;
  }

  private async rebuildIVF(): Promise<void> {
    const vecs = new Map<string, number[]>();
    for (const [id, item] of this.items) {
      vecs.set(id, item.vector);
    }
    this.ivf.train(vecs);
  }

  private bruteForceSearch(query: number[], topK: number): SearchResult[] {
    const results: SearchResult[] = [];
    for (const [id, item] of this.items) {
      const score = this.cosineSimilarity(query, item.vector);
      results.push({ id, score, metadata: item.metadata });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0,
      normA = 0,
      normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private matchesFilter(
    metadata: Record<string, unknown>,
    filter: Record<string, unknown>,
  ): boolean {
    for (const [key, value] of Object.entries(filter)) {
      if (metadata[key] !== value) return false;
    }
    return true;
  }
}
