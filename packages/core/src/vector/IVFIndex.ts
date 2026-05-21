import type { SearchResult } from './VectorStore.ts';

interface IVFCluster {
  centroid: number[];
  itemIds: string[];
}

export class IVFIndex {
  private clusters: IVFCluster[] = [];
  private trained = false;
  private dimension = 0;

  constructor(
    private nClusters = 10,
    private nProbe = 3,
  ) {}

  train(items: Map<string, number[]>): void {
    if (items.size === 0) return;
    this.dimension = [...items.values()][0].length;

    // Initialize centroids (random sampling)
    const ids = [...items.keys()];
    const centroids: number[][] = [];
    const shuffled = [...ids].sort(() => Math.random() - 0.5);
    for (let i = 0; i < Math.min(this.nClusters, ids.length); i++) {
      centroids.push([...items.get(shuffled[i])!]);
    }

    this.clusters = centroids.map((centroid) => ({ centroid, itemIds: [] }));

    // Assign items to nearest centroid
    for (const [id, vec] of items) {
      let minDist = Number.POSITIVE_INFINITY;
      let bestCluster = 0;
      for (let c = 0; c < this.clusters.length; c++) {
        const dist = this.euclideanDist(vec, this.clusters[c].centroid);
        if (dist < minDist) {
          minDist = dist;
          bestCluster = c;
        }
      }
      this.clusters[bestCluster].itemIds.push(id);
    }

    this.trained = true;
  }

  search(query: number[], topK: number, items: Map<string, number[]>): SearchResult[] {
    if (!this.trained || this.clusters.length === 0) {
      return this.bruteForce(query, topK, items);
    }

    // Find nearest clusters
    const clusterDists = this.clusters.map((c, i) => ({
      index: i,
      dist: this.euclideanDist(query, c.centroid),
    }));
    clusterDists.sort((a, b) => a.dist - b.dist);
    const probeClusters = clusterDists.slice(0, this.nProbe);

    // Search only the probe clusters
    const results: SearchResult[] = [];
    for (const { index: ci } of probeClusters) {
      for (const id of this.clusters[ci].itemIds) {
        const vec = items.get(id);
        if (!vec) continue;
        const score = this.cosineSimilarity(query, vec);
        results.push({ id, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  private bruteForce(query: number[], topK: number, items: Map<string, number[]>): SearchResult[] {
    const results: SearchResult[] = [];
    for (const [id, vec] of items) {
      const score = this.cosineSimilarity(query, vec);
      results.push({ id, score });
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

  private euclideanDist(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }
}
