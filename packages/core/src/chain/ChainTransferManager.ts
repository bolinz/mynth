import type { AgentId, Capability, CapabilityType, HopRecord, TaskContext } from '@mynth/sdk';
import type { AgentPool } from '../agent/AgentPool.ts';
import type { Intervener } from '../meta/Intervener.ts';
import type { Observer } from '../meta/Observer.ts';

export interface TransferResult {
  taskId: string;
  status: 'complete' | 'escalated' | 'terminated';
  hopCount: number;
  hopHistory: HopRecord[];
  finalAgent?: AgentId;
}

export class ChainTransferManager {
  private hopHistory: HopRecord[] = [];
  private _taskContext?: TaskContext;
  private _currentAgentId?: AgentId;
  private satisfiedTypes = new Set<CapabilityType>();

  constructor(
    private pool: AgentPool,
    private observer?: Observer,
    private intervener?: Intervener,
    private maxHops = 10,
  ) {}

  async startChain(taskContext: TaskContext, firstAgentId: AgentId): Promise<TransferResult> {
    this._taskContext = taskContext;
    this._currentAgentId = firstAgentId;
    this.hopHistory = [];
    this.satisfiedTypes = new Set();

    const firstAgent = this.pool.getAgent(firstAgentId);
    if (!firstAgent) {
      return this.escalate('first_agent_not_found');
    }
    firstAgent.assignTask(taskContext);

    return this.runChain();
  }

  get hops(): HopRecord[] {
    return [...this.hopHistory];
  }

  private async runChain(): Promise<TransferResult> {
    while (this.hopHistory.length < this.maxHops) {
      const agent = this._currentAgentId ? this.pool.getAgent(this._currentAgentId) : undefined;
      if (!agent) {
        return this.escalate('agent_not_found');
      }

      agent.startWork();
      await this.simulateWork();

      const hopStart = Date.now();
      const remaining = this.computeRemaining();
      const decision = agent.decideTransfer(remaining, this.pool);
      const duration = Date.now() - hopStart;

      // Record the hop
      this.recordHop(
        agent.id,
        decision.action === 'complete' ? '' : (decision.nextAgent ?? ''),
        decision.reason,
        duration,
      );

      agent.complete();

      if (decision.action === 'complete') {
        return this.success(agent.id);
      }

      if (decision.action === 'continue' && decision.nextAgent) {
        const nextAgent = this.pool.getAgent(decision.nextAgent);
        if (!nextAgent || nextAgent.state !== 'idle') {
          return this.escalate('next_agent_unavailable');
        }

        for (const cap of agent.capabilities) {
          if (this._taskContext?.neededCapabilities.some((c) => c.type === cap.type)) {
            this.satisfiedTypes.add(cap.type);
          }
        }

        this._currentAgentId = decision.nextAgent;
        nextAgent.assignTask(this._taskContext!);
      } else {
        return this.escalate(decision.reason);
      }

      if (this.intervener && this.observer) {
        const anomalies = this.observer.detectAnomalies();
        const anomaly = anomalies.pop();
        if (anomaly) {
          const action = this.intervener.decide({
            type: anomaly.type,
            agentId: anomaly.agentId,
          } as any);
          if (action.type === 'terminate') {
            return this.terminate(action.reason);
          }
        }
      }
    }

    return this.escalate('max_hops_exceeded');
  }

  private computeRemaining(): Capability[] {
    if (!this._taskContext) return [];
    return this._taskContext.neededCapabilities.filter((c) => !this.satisfiedTypes.has(c.type));
  }

  private recordHop(from: AgentId, to: AgentId, note: string, duration: number): void {
    this.hopHistory.push({
      fromAgent: from,
      toAgent: to,
      timestamp: Date.now(),
      handoverNote: note,
      duration,
    });
    this.observer?.recordHop(from, to || 'complete', duration);
  }

  private async simulateWork(): Promise<void> {
    await new Promise((r) => setTimeout(r, 20));
  }

  private success(agentId: AgentId): TransferResult {
    return {
      taskId: this._taskContext?.taskId ?? '',
      status: 'complete',
      hopCount: this.hopHistory.length,
      hopHistory: [...this.hopHistory],
      finalAgent: agentId,
    };
  }

  private escalate(reason: string): TransferResult {
    return {
      taskId: this._taskContext?.taskId ?? '',
      status: 'escalated',
      hopCount: this.hopHistory.length,
      hopHistory: [...this.hopHistory],
    };
  }

  private terminate(reason: string): TransferResult {
    return {
      taskId: this._taskContext?.taskId ?? '',
      status: 'terminated',
      hopCount: this.hopHistory.length,
      hopHistory: [...this.hopHistory],
    };
  }
}
