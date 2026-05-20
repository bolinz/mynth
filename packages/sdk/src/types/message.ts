import type { AgentId } from './agent.ts';
import type { Checkpoint, TaskContext } from './task.ts';

export type MessageType =
  | 'init'
  | 'execute'
  | 'transfer'
  | 'complete'
  | 'anomaly'
  | 'intervene'
  | 'rollback'
  | 'query'
  | 'inform'
  | 'ack';

export interface Message {
  id: string;
  from: AgentId;
  to: AgentId | 'broadcast';
  type: MessageType;
  content: unknown;
  context: TaskContext;
  timestamp: number;
  replyTo?: string;
}

export interface TransferDecision {
  nextAgent?: AgentId;
  action: 'continue' | 'complete' | 'rollback' | 'escalate';
  reason: string;
  checkpoint: Checkpoint;
}
