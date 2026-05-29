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
    if (this.draining) return;
    this.draining = true;
    this.scheduler.setDraining(true);

    const running = this.scheduler
      .getAllTasks()
      .filter((t) => t.status === 'running' || t.status === 'queued');

    if (running.length > 0) {
      const drained = await this.scheduler.waitForEmpty(this.config.drainTimeout);
      if (!drained) {
        console.warn(
          `[GracefulShutdown] ${running.length} tasks still running after ${this.config.drainTimeout}ms, closing DB`,
        );
      }
    }

    await this.db.close();
  }
}
