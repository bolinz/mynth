import type { GlobalMemory } from './GlobalMemory.ts';

export interface Contribution {
  source: string;
  key: string;
  value: unknown;
  timestamp: number;
}

export interface Skill {
  id: string;
  name: string;
  trigger: { keywords?: string[]; taskType?: string[] };
  procedure: { steps: string[] };
  meta: { source: string[]; successRate: number; usageCount: number };
}

export class MemoryGateway {
  private contributions: Contribution[] = [];
  private contributionCounts = new Map<string, number>();

  constructor(private memory: GlobalMemory) {}

  async writeContribution(
    source: string,
    key: string,
    value: unknown,
  ): Promise<{ accepted: boolean; reason?: string }> {
    // Dedup: same source + key + value
    const duplicate = this.contributions.some(
      (c) =>
        c.source === source && c.key === key && JSON.stringify(c.value) === JSON.stringify(value),
    );
    if (duplicate) {
      return { accepted: false, reason: 'duplicate contribution' };
    }

    // Format validation
    if (!key || typeof key !== 'string') {
      return { accepted: false, reason: 'invalid key' };
    }

    const contribution: Contribution = { source, key, value, timestamp: Date.now() };
    this.contributions.push(contribution);

    // Track frequency for potential skill distillation
    const patternKey = `${source}:${key}`;
    const count = (this.contributionCounts.get(patternKey) ?? 0) + 1;
    this.contributionCounts.set(patternKey, count);

    await this.memory.write(key, value);
    return { accepted: true };
  }

  getContributions(): Contribution[] {
    return [...this.contributions];
  }

  getContributionCount(): number {
    return this.contributions.length;
  }

  checkSkillDistillation(threshold = 50): Skill | null {
    for (const [patternKey, count] of this.contributionCounts) {
      if (count >= threshold) {
        const [source] = patternKey.split(':');
        this.contributionCounts.set(patternKey, 0); // reset
        return {
          id: `skill_${Date.now()}`,
          name: `${source} pattern`,
          trigger: { keywords: [source] },
          procedure: { steps: [`execute ${source}`] },
          meta: { source: [source], successRate: 0.9, usageCount: count },
        };
      }
    }
    return null;
  }
}
