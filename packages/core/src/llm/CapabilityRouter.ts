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

  constructor(private pool: LLMPool) {
    this.routes = [
      { type: 'reasoning', primary: 'claude-sonnet', fallback: 'gpt-4o' },
      { type: 'codegen', primary: 'claude-sonnet', fallback: 'gpt-4o' },
      { type: 'review', primary: 'claude-sonnet', fallback: 'gpt-4o' },
      { type: 'plan', primary: 'claude-sonnet', fallback: 'gpt-4o' },
      { type: 'creative', primary: 'claude-sonnet', fallback: 'gpt-4o' },
    ];
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
    const entry = this.history.get(key) ?? { successes: 0, failures: 0 };
    if (success) entry.successes++;
    else entry.failures++;
    this.history.set(key, entry);

    const total = entry.successes + entry.failures;
    if (total >= 10) {
      const rate = entry.successes / total;
      if (rate < 0.5 && this.routes.length > 1) {
        const rule = this.routes.find((r) => r.type === capabilityType);
        if (rule) {
          // Swap primary and fallback if success rate is low
          const { primary, fallback } = rule;
          rule.primary = fallback;
          rule.fallback = primary;
        }
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
