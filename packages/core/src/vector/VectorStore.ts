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

  constructor(private dimension: number) {}

  async add(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    if (vector.length !== this.dimension) {
      throw new Error(
        `Vector dimension mismatch: expected ${this.dimension}, got ${vector.length}`,
      );
    }
    this.items.set(id, { id, vector, metadata });
  }

  async addBatch(items: VectorItem[]): Promise<void> {
    for (const item of items) {
      await this.add(item.id, item.vector, item.metadata);
    }
  }

  async search(query: number[], topK: number): Promise<SearchResult[]> {
    if (this.items.size === 0) return [];
    const results: SearchResult[] = [];
    for (const [id, item] of this.items) {
      const score = this.cosineSimilarity(query, item.vector);
      results.push({ id, score, metadata: item.metadata });
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  async update(id: string, vector: number[], metadata?: Record<string, unknown>): Promise<void> {
    if (!this.items.has(id)) {
      throw new Error(`Vector not found: ${id}`);
    }
    this.items.set(id, { id, vector, metadata });
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
