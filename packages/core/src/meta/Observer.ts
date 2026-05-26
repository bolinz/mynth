export interface Anomaly {
  type: string;
  agentId?: string;
  details?: Record<string, unknown>;
}

export class Observer {
  private running = false;
  private hopHistory: Array<{ from: string; to: string; duration: number }> = [];
  private errorCounts = new Map<string, number>();
  private anomalyHandlers: Array<(anomaly: Anomaly) => void> = [];

  start(_config: { interval: number }): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  onAnomaly(handler: (anomaly: Anomaly) => void): void {
    this.anomalyHandlers.push(handler);
  }

  recordHop(from: string, to: string, duration: number): void {
    this.hopHistory.push({ from, to, duration });
  }

  recordError(agentId: string): void {
    this.errorCounts.set(agentId, (this.errorCounts.get(agentId) ?? 0) + 1);
  }

  hopCount(): number {
    return this.hopHistory.length;
  }

  detectAnomalies(): Anomaly[] {
    const anomalies: Anomaly[] = [];

    if (this.detectCycle()) {
      anomalies.push({
        type: 'cycle_pattern',
        details: {
          hops: this.hopHistory.length,
          agents: this.hopHistory.slice(-4).map((h) => h.from),
        },
      });
    }

    const avgDuration = this.averageDuration();
    if (avgDuration > 500 && this.hopHistory.length >= 3) {
      anomalies.push({
        type: 'duration_exceeded',
        details: { avgDuration, threshold: 500 },
      });
    }

    for (const [agentId, count] of this.errorCounts) {
      if (count >= 3) {
        anomalies.push({
          type: 'agent_error',
          agentId,
          details: { errorCount: count },
        });
      }
    }

    return anomalies;
  }

  private detectCycle(): boolean {
    if (this.hopHistory.length < 4) return false;

    const fromAgents = this.hopHistory.map((h) => h.from);
    const n = fromAgents.length;

    // Check adjacent windows: if the last L hops repeat the preceding L hops
    for (let l = 2; l <= Math.floor(n / 2); l++) {
      const tail = fromAgents.slice(n - l);
      const prev = fromAgents.slice(n - l * 2, n - l);
      if (tail.length === prev.length && tail.every((v, i) => v === prev[i])) {
        return true;
      }
    }

    return false;
  }

  private averageDuration(): number {
    if (this.hopHistory.length === 0) return 0;
    return this.hopHistory.reduce((sum, h) => sum + h.duration, 0) / this.hopHistory.length;
  }
}
