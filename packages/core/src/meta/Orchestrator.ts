import type { AgentId, HandoverConstraints, Task, TaskContext } from '@mynth/sdk';

export interface ChainAnalysis {
  firstAgent: AgentId;
  capabilities: string[];
  constraints: HandoverConstraints;
}

export class Orchestrator {
  constructor(private agentIds: AgentId[]) {}

  async analyze(task: Task): Promise<ChainAnalysis> {
    const capabilities = this.inferCapabilities(task.description);
    const firstAgent = this.selectFirst(capabilities);
    return {
      firstAgent,
      capabilities,
      constraints: {
        requiredCapabilities: [],
        forbiddenAgents: [],
        maxHops: 10,
      },
    };
  }

  async initializeChain(task: Task, firstAgent: AgentId): Promise<TaskContext> {
    return {
      taskId: task.id,
      description: task.description,
      priority: task.priority,
      status: 'running',
      neededCapabilities: [],
      hopHistory: [],
      currentAgent: firstAgent,
      createdAt: Date.now(),
    };
  }

  private inferCapabilities(_description: string): string[] {
    return ['reasoning'];
  }

  private selectFirst(_capabilities: string[]): AgentId {
    return this.agentIds[0] ?? '';
  }
}
