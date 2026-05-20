export type CapabilityType =
  | 'reasoning'
  | 'codegen'
  | 'review'
  | 'search'
  | 'plan'
  | 'memory'
  | 'math'
  | 'creative'
  | 'critique'
  | 'synthesis'
  | 'coordination';

export interface Capability {
  type: CapabilityType;
  level: number;
  confidence: number;
  examples?: string[];
}

export type AgentState =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting'
  | 'transferring'
  | 'error'
  | 'intervened'
  | 'shutdown';

export interface Agent {
  id: string;
  name: string;
  capabilities: Capability[];
  state: AgentState;
  metadata: AgentMetadata;
}

export interface AgentMetadata {
  createdAt: number;
  lastActiveAt: number;
  taskCount: number;
  successRate: number;
  avgHopDuration: number;
}

export type AgentId = string;
