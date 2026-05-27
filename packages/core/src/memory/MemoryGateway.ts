import type { Persistence } from '../persistence/Persistence.ts';
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
  private persistence?: Persistence;
  private walBuffer: Contribution[] = [];
  private walTimer: ReturnType<typeof setTimeout> | null = null;
  private walCounter = 0;

  constructor(
    private memory: GlobalMemory,
    persistence?: Persistence,
  ) {
    this.persistence = persistence;
  }

  private async walAppend(contribution: Contribution): Promise<void> {
    this.walBuffer.push(contribution);
    if (!this.walTimer) {
      this.walTimer = setTimeout(() => this.walFlush(), 50);
    }
  }

  private async walFlush(): Promise<void> {
    this.walTimer = null;
    if (this.walBuffer.length === 0 || !this.persistence) return;
    const batch = [...this.walBuffer];
    this.walBuffer = [];
    this.walCounter++;
    await this.persistence.put(`wal:${Date.now()}_${this.walCounter}`, batch);
  }

  async recover(): Promise<number> {
    if (!this.persistence) return 0;
    let recovered = 0;
    const raw = await this.persistence.range('wal:', 'wal~');
    for (const [key, value] of raw) {
      const batch = value as Contribution[];
      for (const c of batch) {
        await this.memory.write(c.key, c.value);
        recovered++;
      }
      await this.persistence.delete(key);
    }
    return recovered;
  }

  async writeContribution(
    source: string,
    key: string,
    value: unknown,
  ): Promise<{ accepted: boolean; reason?: string }> {
    const duplicate = this.contributions.some(
      (c) =>
        c.source === source && c.key === key && JSON.stringify(c.value) === JSON.stringify(value),
    );
    if (duplicate) {
      return { accepted: false, reason: 'duplicate contribution' };
    }

    if (!key || typeof key !== 'string') {
      return { accepted: false, reason: 'invalid key' };
    }

    const contribution: Contribution = { source, key, value, timestamp: Date.now() };
    this.contributions.push(contribution);
    await this.walAppend(contribution);

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
        this.contributionCounts.set(patternKey, 0);
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
