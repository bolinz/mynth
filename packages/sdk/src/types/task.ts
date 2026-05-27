import type { AgentId, Capability } from './agent.ts';

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rolled_back';

export interface Task {
  id: string;
  description: string;
  priority: number;
  constraints?: HandoverConstraints;
}

export interface TaskContext {
  taskId: string;
  description: string;
  priority: number;
  status: TaskStatus;
  neededCapabilities: Capability[];
  hopHistory: HopRecord[];
  currentAgent: AgentId;
  checkpoint?: Checkpoint;
  result?: unknown;
  createdAt: number;
}

export interface HopRecord {
  fromAgent: AgentId;
  toAgent: AgentId;
  timestamp: number;
  handoverNote: string;
  duration: number;
}

export interface Checkpoint {
  agentId: AgentId;
  timestamp: number;
  state: string;
  partialResult: unknown;
  context: TaskContext;
}

export interface TenantContext {
  tenantId: string;
}

export interface HandoverConstraints {
  requiredCapabilities: Capability[];
  forbiddenAgents: AgentId[];
  maxHops: number;
  deadline?: number;
}
