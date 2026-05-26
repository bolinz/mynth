import type { AgentId, Capability, CapabilityType, HopRecord, TaskContext } from '@mynth/sdk';
import type { AgentPool } from '../agent/AgentPool.ts';
import { ReActLoop } from '../agent/ReActLoop.ts';
import type { BudgetTracker } from '../llm/BudgetTracker.ts';
import type { CapabilityRouter } from '../llm/CapabilityRouter.ts';
import type { LLMPool } from '../llm/LLMPool.ts';
import type { MessageBus } from '../message-bus/MessageBus.ts';
import type { InterventionAction } from '../meta/Intervener.ts';
import type { Intervener } from '../meta/Intervener.ts';
import type { Observer } from '../meta/Observer.ts';
import type { PromptRegistry } from '../prompt/PromptRegistry.ts';

export interface TransferResult {
  taskId: string;
  status: 'complete' | 'escalated' | 'terminated';
  hopCount: number;
  hopHistory: HopRecord[];
  finalAgent?: AgentId;
  interventions: InterventionAction[];
}

export class ChainTransferManager {
  private hopHistory: HopRecord[] = [];
  private _taskContext?: TaskContext;
  private _currentAgentId?: AgentId;
  private satisfiedTypes = new Set<CapabilityType>();
  private interventions: InterventionAction[] = [];

  constructor(
    private pool: AgentPool,
    private observer?: Observer,
    private intervener?: Intervener,
    private maxHops = 10,
    private bus?: MessageBus,
    private llmPool?: LLMPool,
    private promptRegistry?: PromptRegistry,
    private budgetTracker?: BudgetTracker,
    private capabilityRouter?: CapabilityRouter,
  ) {}

  async startChain(taskContext: TaskContext, firstAgentId: AgentId): Promise<TransferResult> {
    this._taskContext = taskContext;
    this._currentAgentId = firstAgentId;
    this.hopHistory = [];
    this.satisfiedTypes = new Set();
    this.interventions = [];

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
      // Check for anomalies before each hop (allows pre-seeded or cross-hop detection)
      const preAction = await this.checkIntervention();
      if (preAction) {
        const handled = await this.handleIntervention(preAction);
        const failReason =
          'reason' in preAction ? (preAction as { reason?: string }).reason : 'intervention_failed';
        if (!handled) return this.terminate(failReason ?? 'intervention_failed');
      }

      const agent = this._currentAgentId ? this.pool.getAgent(this._currentAgentId) : undefined;
      if (!agent) {
        return this.escalate('agent_not_found');
      }

      agent.startWork();
      const cap = agent.capabilities[0]?.type ?? 'reasoning';
      const llmResult = await this.executeWithLLM(agent.id, this._taskContext?.description ?? '', cap);

      agent.lastLlmOutput = llmResult ?? '';

      const hopStart = Date.now();
      const remaining = this.computeRemaining();
      const decision = agent.decideTransfer(remaining, this.pool);
      const duration = Date.now() - hopStart;

      const llmSummary = agent.lastLlmOutput
        ? agent.lastLlmOutput.slice(0, 200)
        : '';
      const note = decision.reason + (llmSummary ? ` | ${llmSummary}` : '');

      this.recordHop(
        agent.id,
        decision.action === 'complete' ? '' : (decision.nextAgent ?? ''),
        note,
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
    }

    return this.escalate('max_hops_exceeded');
  }

  private async checkIntervention(): Promise<InterventionAction | null> {
    if (!this.intervener || !this.observer) return null;
    const anomalies = this.observer.detectAnomalies();
    if (anomalies.length === 0) return null;

    const anomaly = anomalies[anomalies.length - 1];
    const action = this.intervener.decide({
      type: anomaly.type,
      agentId: anomaly.agentId,
    });
    this.interventions.push(action);

    this.bus?.publish('anomaly.detected', {
      type: anomaly.type,
      agentId: anomaly.agentId,
      details: anomaly.details,
    });
    return action;
  }

  private async handleIntervention(action: InterventionAction): Promise<boolean> {
    const actionReason = 'reason' in action ? (action as { reason?: string }).reason : undefined;
    this.bus?.publish('intervention.executed', {
      type: action.type,
      reason: actionReason,
    });

    switch (action.type) {
      case 'warn':
        return true;

      case 'pause':
        await new Promise((r) => setTimeout(r, 50));
        return true;

      case 'replace': {
        if (!this._currentAgentId) return false;
        const idleAgents = this.pool
          .getAllAgents()
          .filter((a) => a.id !== this._currentAgentId && a.state === 'idle');
        if (idleAgents.length === 0) return false;
        this._currentAgentId = idleAgents[0].id;
        idleAgents[0].assignTask(this._taskContext!);
        return true;
      }

      case 'reroute': {
        const idleAgents = this.pool.getAllAgents().filter((a) => a.state === 'idle');
        if (idleAgents.length === 0) return false;
        this._currentAgentId = idleAgents[0].id;
        this.satisfiedTypes = new Set();
        idleAgents[0].assignTask(this._taskContext!);
        return true;
      }

      case 'rollback': {
        if (this.hopHistory.length < 2) return false;
        const prevHop = this.hopHistory[this.hopHistory.length - 2];
        this._currentAgentId = prevHop.fromAgent;
        const prevAgent = this.pool.getAgent(prevHop.fromAgent);
        if (prevAgent) {
          prevAgent.assignTask(this._taskContext!);
        }
        return true;
      }

      case 'terminate':
        return false;

      default:
        return true;
    }
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
    this.bus?.publish('hop.recorded', {
      from,
      to: to || '',
      note,
      duration,
      hopNumber: this.hopHistory.length,
    });
  }

  private async executeWithLLM(agentId: string, task: string, capability: string): Promise<string> {
    if (!this.llmPool) {
      await new Promise((r) => setTimeout(r, 20));
      return '';
    }

    if (this.budgetTracker) {
      const check = this.budgetTracker.check(agentId, capability);
      if (!check.allowed) {
        this.bus?.publish('intervention.executed', {
          type: 'warn',
          reason: `Budget exceeded for ${agentId}: ${JSON.stringify(check.details)}`,
        });
        return '';
      }
    }

    try {
      const resolvedProvider = this.capabilityRouter
        ? this.capabilityRouter.resolve(capability)?.provider
        : null;

      const provider = resolvedProvider
        ?? (process.env.ANTHROPIC_API_KEY
          ? this.llmPool.resolve({ model: 'claude-sonnet' })
          : process.env.OPENAI_API_KEY
            ? this.llmPool.resolve({ model: 'gpt-4o' })
            : null);

      if (!provider) {
        await new Promise((r) => setTimeout(r, 20));
        return '';
      }
      const loop = new ReActLoop(provider);
      const prompt = this.promptRegistry?.buildPrompt(capability, task, '') ?? task;
      const result = await loop.execute(prompt, capability);

      if (this.budgetTracker) {
        this.budgetTracker.record(agentId, capability, prompt.length, result.length);
      }

      return result;
    } catch (err) {
      this.bus?.publish('anomaly.detected', {
        type: 'agent_error',
        agentId,
        details: { error: String(err) },
      });
      return '';
    }
  }

  private success(agentId: AgentId): TransferResult {
    return {
      taskId: this._taskContext?.taskId ?? '',
      status: 'complete',
      hopCount: this.hopHistory.length,
      hopHistory: [...this.hopHistory],
      finalAgent: agentId,
      interventions: this.interventions,
    };
  }

  private escalate(reason: string): TransferResult {
    return {
      taskId: this._taskContext?.taskId ?? '',
      status: 'escalated',
      hopCount: this.hopHistory.length,
      hopHistory: [...this.hopHistory],
      interventions: this.interventions,
    };
  }

  private terminate(reason: string): TransferResult {
    return {
      taskId: this._taskContext?.taskId ?? '',
      status: 'terminated',
      hopCount: this.hopHistory.length,
      hopHistory: [...this.hopHistory],
      interventions: this.interventions,
    };
  }
}
