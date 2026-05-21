import type { GlobalMemory } from '../memory/GlobalMemory.ts';
import type { Persistence } from '../persistence/Persistence.ts';
import type { Scheduler } from '../scheduler/Scheduler.ts';

export interface ShutdownConfig {
  drainTimeout: number;
}

export class GracefulShutdown {
  private draining = false;

  constructor(
    private scheduler: Scheduler,
    private memory: GlobalMemory,
    private db: Persistence,
    private config: ShutdownConfig,
  ) {}

  isDraining(): boolean {
    return this.draining;
  }

  async shutdown(): Promise<void> {
    this.draining = true;

    // Wait for running tasks to complete
    const running = this.scheduler.getAllTasks().filter((t) => t.status === 'running');
    if (running.length > 0) {
      const deadline = Date.now() + this.config.drainTimeout;
      for (const task of running) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;
        // Wait briefly for task to complete
        await new Promise((r) => setTimeout(r, Math.min(remaining, 1000)));
      }
    }

    await this.db.close();
  }
}
