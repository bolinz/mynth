import type { AgentId, AgentMetadata, Capability } from '@mynth/sdk';
import { type AgentState, AgentStateMachine } from './AgentState.ts';

export class BaseAgent {
  readonly id: AgentId;
  readonly name: string;
  readonly capabilities: Capability[];
  readonly metadata: AgentMetadata;
  protected stateMachine = new AgentStateMachine();
  lastError: Error | null = null;
  onStateChange?: (state: AgentState) => void;

  private _taskCount = 0;

  constructor(id: string, name: string, capabilities: Capability[]) {
    this.id = id;
    this.name = name;
    this.capabilities = capabilities;
    this.metadata = {
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      taskCount: 0,
      successRate: 1,
      avgHopDuration: 0,
    };
  }

  get state(): AgentState {
    return this.stateMachine.current;
  }

  assignTask(_task: unknown): void {
    this.stateMachine.transition('thinking');
    this.stateChanged();
  }

  startWork(): void {
    this.stateMachine.transition('working');
    this.stateChanged();
  }

  startTransfer(): void {
    this.stateMachine.transition('transferring');
    this.stateChanged();
  }

  waitForResume(): void {
    this.stateMachine.transition('waiting');
    this.stateChanged();
  }

  resume(): void {
    this.stateMachine.transition('working');
    this.stateChanged();
  }

  complete(): void {
    this._taskCount++;
    this.metadata.taskCount = this._taskCount;
    this.metadata.lastActiveAt = Date.now();
    this.stateMachine.reset();
    this.stateChanged();
  }

  handleError(error: Error): void {
    this.lastError = error;
    this.stateMachine.transition('error');
    this.stateChanged();
  }

  shutdown(): void {
    this.stateMachine.transition('shutdown');
    this.stateChanged();
  }

  canHandle(required: Capability[]): boolean {
    return required.every((req) =>
      this.capabilities.some(
        (c) => c.type === req.type && c.level >= req.level && c.confidence >= req.confidence,
      ),
    );
  }

  private stateChanged(): void {
    this.onStateChange?.(this.state);
  }
}
