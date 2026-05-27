import type { CapabilityType } from '@mynth/sdk';
import type { LLMPool } from './LLMPool.ts';
import type { LLMProvider } from './LLMProvider.ts';

export interface RouteResult {
  provider: LLMProvider;
  model: string;
}

export interface RoutingRule {
  type: string;
  primary: string;
  fallback: string;
}

export class CapabilityRouter {
  private routes: RoutingRule[] = [];
  private history = new Map<string, { successes: number; failures: number }>();
  private convergenceConfig = {
    windowSize: 10,
    confidenceThreshold: 0.5,
    minSamples: 10,
    cooldownMs: 60000,
  };
  private lastSwapTime = new Map<string, number>();
  private recentResults = new Map<string, boolean[]>();

  constructor(private pool: LLMPool) {
    this.routes = [
      { type: 'reasoning', primary: 'claude-sonnet', fallback: 'gpt-4o' },
      { type: 'codegen', primary: 'claude-sonnet', fallback: 'gpt-4o' },
      { type: 'review', primary: 'claude-sonnet', fallback: 'gpt-4o' },
      { type: 'plan', primary: 'claude-sonnet', fallback: 'gpt-4o' },
      { type: 'creative', primary: 'claude-sonnet', fallback: 'gpt-4o' },
    ];
  }

  setConvergence(config: Partial<typeof this.convergenceConfig>): void {
    Object.assign(this.convergenceConfig, config);
  }

  getRoutes(): RoutingRule[] {
    return [...this.routes];
  }

  resolve(capabilityType: string): RouteResult | null {
    const rule = this.routes.find((r) => r.type === capabilityType) || this.routes[0];
    if (!rule) return null;

    try {
      const provider = this.pool.resolve({ model: rule.primary });
      return { provider, model: rule.primary };
    } catch {
      try {
        const provider = this.pool.resolve({ model: rule.fallback });
        return { provider, model: rule.fallback };
      } catch {
        return null;
      }
    }
  }

  learn(capabilityType: string, success: boolean): void {
    const key = capabilityType;

    // Sliding window for swap decisions
    const recent = this.recentResults.get(key) ?? [];
    recent.push(success);
    if (recent.length > this.convergenceConfig.windowSize) recent.shift();
    this.recentResults.set(key, recent);

    // Update permanent history (always, for stats)
    const entry = this.history.get(key) ?? { successes: 0, failures: 0 };
    if (success) entry.successes++;
    else entry.failures++;
    this.history.set(key, entry);

    // Not enough samples yet for swap decision
    if (recent.length < this.convergenceConfig.minSamples) return;

    const successes = recent.filter(Boolean).length;
    const rate = successes / recent.length;

    // Cool-down check
    const lastSwap = this.lastSwapTime.get(key) ?? 0;
    if (Date.now() - lastSwap < this.convergenceConfig.cooldownMs) return;

    // Swap if rate is low
    if (rate < this.convergenceConfig.confidenceThreshold && this.routes.length > 1) {
      const rule = this.routes.find((r) => r.type === capabilityType);
      if (rule) {
        const { primary, fallback } = rule;
        rule.primary = fallback;
        rule.fallback = primary;
        this.lastSwapTime.set(key, Date.now());
      }
    }
  }

  getStats(capabilityType: string): { successes: number; failures: number; rate: number } {
    const entry = this.history.get(capabilityType);
    if (!entry) return { successes: 0, failures: 0, rate: 1 };
    const total = entry.successes + entry.failures;
    return {
      successes: entry.successes,
      failures: entry.failures,
      rate: total > 0 ? entry.successes / total : 1,
    };
  }
}
