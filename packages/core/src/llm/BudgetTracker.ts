export interface BudgetConfig {
  perAgentTask?: number;
  perTask?: number;
  perUser?: { daily?: number; monthly?: number };
  perGlobal?: { daily?: number };
  onExceed?: 'reject' | 'downgrade' | 'warn';
}

export interface UsageRecord {
  inputTokens: number;
  outputTokens: number;
}

type ExceedDetail = { level: string; current: number; limit: number };

export class BudgetTracker {
  private usage = new Map<string, UsageRecord>();
  private globalDaily = 0;
  private globalDayStart = this.today();

  constructor(private config: BudgetConfig = {}) {}

  record(taskId: string, _capability: string, inputTokens: number, outputTokens: number): void {
    const existing = this.usage.get(taskId) ?? { inputTokens: 0, outputTokens: 0 };
    this.usage.set(taskId, {
      inputTokens: existing.inputTokens + inputTokens,
      outputTokens: existing.outputTokens + outputTokens,
    });
    this.globalDaily += inputTokens + outputTokens;
    if (this.today() !== this.globalDayStart) {
      this.globalDaily = inputTokens + outputTokens;
      this.globalDayStart = this.today();
    }
  }

  check(taskId: string, _capability: string): { allowed: boolean; details?: ExceedDetail } {
    const usage = this.usage.get(taskId);
    const input = usage?.inputTokens ?? 0;
    const output = usage?.outputTokens ?? 0;

    if (this.config.perAgentTask && input + output > this.config.perAgentTask) {
      return {
        allowed: false,
        details: {
          level: 'per_agent_task',
          current: input + output,
          limit: this.config.perAgentTask,
        },
      };
    }
    if (this.config.perTask && input + output > this.config.perTask) {
      return {
        allowed: false,
        details: { level: 'per_task', current: input + output, limit: this.config.perTask },
      };
    }
    if (this.config.perGlobal?.daily && this.globalDaily > this.config.perGlobal.daily) {
      return {
        allowed: false,
        details: {
          level: 'global_daily',
          current: this.globalDaily,
          limit: this.config.perGlobal.daily,
        },
      };
    }

    return { allowed: true };
  }

  getTaskUsage(taskId: string): UsageRecord {
    return this.usage.get(taskId) ?? { inputTokens: 0, outputTokens: 0 };
  }

  getGlobalDaily(): number {
    return this.globalDaily;
  }

  private today(): number {
    return Math.floor(Date.now() / 86400000);
  }
}
