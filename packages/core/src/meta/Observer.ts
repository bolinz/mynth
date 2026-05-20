export interface Anomaly {
  type: string;
  agentId?: string;
  details?: Record<string, unknown>;
}

export class Observer {
  private running = false;
  private hopHistory: Array<{ from: string; to: string; duration: number }> = [];
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

  detectAnomalies(): Anomaly[] {
    const anomalies: Anomaly[] = [];

    if (this.detectCycle()) {
      anomalies.push({ type: 'cycle_pattern', details: { hops: this.hopHistory.length } });
    }

    const avgDuration = this.averageDuration();
    if (avgDuration > 10000) {
      anomalies.push({ type: 'duration_exceeded', details: { avgDuration } });
    }

    return anomalies;
  }

  private detectCycle(): boolean {
    if (this.hopHistory.length < 4) return false;
    const recent = this.hopHistory.slice(-4).map((h) => h.from);
    return recent[0] === recent[2] && recent[1] === recent[3];
  }

  private averageDuration(): number {
    if (this.hopHistory.length === 0) return 0;
    return this.hopHistory.reduce((sum, h) => sum + h.duration, 0) / this.hopHistory.length;
  }
}
