export type AgentState =
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting'
  | 'transferring'
  | 'error'
  | 'intervened'
  | 'shutdown';

const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  idle: ['thinking', 'working', 'shutdown'],
  thinking: ['working', 'waiting', 'error'],
  working: ['transferring', 'waiting', 'error'],
  waiting: ['working', 'transferring', 'error'],
  transferring: ['working', 'idle', 'error'],
  error: ['idle', 'intervened', 'shutdown'],
  intervened: ['idle', 'working'],
  shutdown: [],
};

export class AgentStateMachine {
  current: AgentState = 'idle';

  transition(to: AgentState): void {
    const allowed = VALID_TRANSITIONS[this.current];
    if (!allowed?.includes(to)) {
      throw new Error(
        `Invalid transition: ${this.current} -> ${to}. Allowed: ${allowed?.join(', ') ?? 'none'}`,
      );
    }
    this.current = to;
  }

  reset(): void {
    this.current = 'idle';
  }
}
