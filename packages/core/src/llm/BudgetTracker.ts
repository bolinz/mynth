export interface BudgetConfig {
  perTaskInput?: number;
  perTaskOutput?: number;
}

export interface UsageRecord {
  inputTokens: number;
  outputTokens: number;
}

export class BudgetTracker {
  private usage = new Map<string, UsageRecord>();

  constructor(private config: BudgetConfig = {}) {}

  record(taskId: string, _capability: string, inputTokens: number, outputTokens: number): void {
    const key = taskId;
    const existing = this.usage.get(key) ?? { inputTokens: 0, outputTokens: 0 };
    this.usage.set(key, {
      inputTokens: existing.inputTokens + inputTokens,
      outputTokens: existing.outputTokens + outputTokens,
    });
  }

  check(taskId: string, _capability: string): boolean {
    const usage = this.usage.get(taskId);
    if (!usage) return true;
    if (this.config.perTaskInput && usage.inputTokens > this.config.perTaskInput) return false;
    if (this.config.perTaskOutput && usage.outputTokens > this.config.perTaskOutput) return false;
    return true;
  }

  getTaskUsage(taskId: string): UsageRecord {
    return this.usage.get(taskId) ?? { inputTokens: 0, outputTokens: 0 };
  }
}
