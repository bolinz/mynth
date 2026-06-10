import type { AgentId, Capability } from './agent.ts';

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'rolled_back'
  | 'pending_review'
  | 'paused'
  | 'blocked'
  | 'archived';

export interface Task {
  id: string;
  description: string;
  priority: number;
  status: TaskStatus;
  constraints?: HandoverConstraints;
  type?: string;
  parentId?: string;
  childIds?: string[];
  dependsOn?: string[];
  tags?: string[];
  progress?: number;
  rootMissionId?: string;
  isInterrupt?: boolean;
  contextSnapshot?: {
    interruptedTaskId: string;
    stack: string[];
  };
  metadata?: Record<string, unknown>;
  createdAt?: number;
  startedAt?: number;
  completedAt?: number;
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
  type?: string;
  parentId?: string;
  childIds?: string[];
  dependsOn?: string[];
  tags?: string[];
  progress?: number;
  rootMissionId?: string;
  isInterrupt?: boolean;
  contextSnapshot?: {
    interruptedTaskId: string;
    stack: string[];
  };
  metadata?: Record<string, unknown>;
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
