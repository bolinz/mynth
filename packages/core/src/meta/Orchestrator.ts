import type { AgentId, HandoverConstraints, Task, TaskContext } from '@mynth/sdk';

export interface AgentCapabilityMap {
  agentId: AgentId;
  capabilities: string[];
}

export interface ChainAnalysis {
  firstAgent: AgentId;
  capabilities: string[];
  constraints: HandoverConstraints;
}

const KEYWORD_MAP: Record<string, string[]> = {
  codegen: [
    'implement',
    'write',
    'create',
    'build',
    'function',
    'class',
    'component',
    'module',
    'api',
    'endpoint',
    'route',
    'schema',
    'migration',
    'test',
    'code',
    'program',
    'script',
  ],
  review: ['review', 'check', 'audit', 'inspect', 'verify', 'validate', 'approve', 'cr', 'pr'],
  plan: ['plan', 'design', 'architecture', 'strategy', 'roadmap', 'outline', 'proposal'],
  search: ['search', 'find', 'lookup', 'query', 'fetch', 'retrieve', 'discover'],
  creative: [
    'design',
    'create',
    'generate',
    'imagine',
    'brainstorm',
    'mockup',
    'prototype',
    'ui',
    'ux',
    'interface',
  ],
  reasoning: [
    'analyze',
    'reason',
    'think',
    'evaluate',
    'compare',
    'assess',
    'diagnose',
    'investigate',
    'debug',
  ],
  math: ['calculate', 'compute', 'math', 'formula', 'statistics', 'statistical'],
  synthesis: ['summarize', 'synthesize', 'combine', 'merge', 'consolidate', 'report'],
};

const ALL_CAPABILITIES = Object.keys(KEYWORD_MAP);

export class Orchestrator {
  private agentMap = new Map<AgentId, string[]>();

  constructor(
    private agentIds: AgentId[],
    agentCapabilities?: AgentCapabilityMap[],
  ) {
    if (agentCapabilities) {
      for (const entry of agentCapabilities) {
        this.agentMap.set(entry.agentId, entry.capabilities);
      }
    }
  }

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

  private inferCapabilities(description: string): string[] {
    const lower = description.toLowerCase();
    const words = lower.split(/[\s,]+/);
    const matched = new Set<string>();

    for (const [cap, keywords] of Object.entries(KEYWORD_MAP)) {
      if (keywords.some((kw) => words.includes(kw) || lower.includes(kw))) {
        matched.add(cap);
      }
    }

    matched.add('reasoning');

    const result = Array.from(matched);
    result.sort((a, b) => (a === 'reasoning' ? -1 : b === 'reasoning' ? 1 : 0));
    return result;
  }

  private selectFirst(capabilities: string[]): AgentId {
    if (capabilities.length === 0) return this.agentIds[0] ?? '';

    for (const cap of capabilities) {
      // Try explicit mapping first
      for (const [agentId, caps] of this.agentMap) {
        if (caps.includes(cap)) return agentId;
      }
      // Fall back to substring matching (backward compat)
      const agent = this.agentIds.find((id) => id.includes(cap));
      if (agent) return agent;
    }
    return this.agentIds[0] ?? '';
  }
}
