export type DimensionHealth = 'ok' | 'degraded' | 'down';
export type DegradationLevel = 0 | 1 | 2 | 3 | 4;

export interface DimensionState {
  health: DimensionHealth;
  lastCheck: number;
  reason?: string;
}

export class DegradationMonitor {
  private dimensions: Record<string, DimensionState> = {
    llm: { health: 'ok', lastCheck: Date.now() },
    memory: { health: 'ok', lastCheck: Date.now() },
    messaging: { health: 'ok', lastCheck: Date.now() },
    agent_pool: { health: 'ok', lastCheck: Date.now() },
  };

  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private _onLevelChange?: (level: DegradationLevel) => void;

  setDimension(dim: string, health: DimensionHealth, reason?: string): void {
    this.dimensions[dim] = { health, lastCheck: Date.now(), reason };
    const level = this.computeLevel();
    this._onLevelChange?.(level);
  }

  getDimension(dim: string): DimensionState {
    return this.dimensions[dim] ?? { health: 'ok', lastCheck: Date.now() };
  }

  getLevel(): DegradationLevel {
    return this.computeLevel();
  }

  onLevelChange(handler: (level: DegradationLevel) => void): void {
    this._onLevelChange = handler;
  }

  private computeLevel(): DegradationLevel {
    const healths = Object.values(this.dimensions).map((d) => d.health);
    if (healths.every((h) => h === 'ok')) return 0;
    if (healths.some((h) => h === 'down')) return 4;
    if (healths.filter((h) => h === 'degraded').length >= 2) return 2;
    if (healths.some((h) => h === 'degraded')) return 1;
    return 0;
  }

  scheduleRecovery(dim: string, delayMs = 30000): void {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = setTimeout(() => {
      this.setDimension(dim, 'ok', 'recovered after timeout');
      this.recoveryTimer = null;
    }, delayMs);
  }

  cancelRecovery(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }
  }

  getSummary(): Record<string, DimensionState> {
    return { ...this.dimensions };
  }
}
