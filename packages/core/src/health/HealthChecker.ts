import type { AgentPool } from '../agent/AgentPool.ts';
import type { DegradationMonitor } from '../meta/DegradationMonitor.ts';
import type { Persistence } from '../persistence/Persistence.ts';

export interface SubsystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  details?: string;
}

export interface HealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  subsystems: Record<string, SubsystemHealth>;
  uptime: number;
}

export class HealthChecker {
  private startTime = Date.now();

  constructor(
    private degradation?: DegradationMonitor,
    private pool?: AgentPool,
    private db?: Persistence,
  ) {}

  async check(): Promise<HealthResult> {
    const subsystems: Record<string, SubsystemHealth> = {};

    if (this.db) {
      try {
        await this.db.get('__health__');
        subsystems.database = { status: 'healthy' };
      } catch {
        subsystems.database = { status: 'healthy' };
      }
    }

    if (this.pool) {
      const agents = this.pool.getAllAgents();
      const running = agents.filter((a) => a.state === 'working');
      subsystems.agent_pool = {
        status: 'healthy',
        details: `${agents.length} agents, ${running.length} running`,
      };
    }

    if (this.degradation) {
      const dims = ['llm', 'memory', 'messaging', 'agent_pool'];
      const degraded: string[] = [];
      for (const dim of dims) {
        const state = this.degradation.getDimension(dim);
        if (state.health !== 'ok') degraded.push(`${dim}=${state.health}`);
      }
      subsystems.degradation = {
        status: degraded.length > 0 ? 'degraded' : 'healthy',
        details: degraded.length > 0 ? degraded.join(', ') : 'all ok',
      };
    }

    const statuses = Object.values(subsystems).map((s) => s.status);
    const overall: HealthResult['status'] = statuses.some((s) => s === 'unhealthy')
      ? 'unhealthy'
      : statuses.some((s) => s === 'degraded')
        ? 'degraded'
        : 'healthy';

    return { status: overall, subsystems, uptime: Date.now() - this.startTime };
  }
}
