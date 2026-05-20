import type { Capability, CapabilityType } from '@mynth/sdk';
import type { EventBus } from '../message-bus/EventBus.ts';
import { type AgentState, AgentStateMachine } from './AgentState.ts';

export class SubAgent {
  readonly id: string;
  readonly name: string;
  readonly capabilities: Capability[];
  readonly metadata: { taskCount: number; createdAt: number };

  private stateMachine = new AgentStateMachine();
  private _lastState: AgentState = 'idle';
  lastError: Error | null = null;

  constructor(
    id: string,
    name: string,
    capabilities: Capability[],
    readonly parentId: string,
    private eventBus?: EventBus,
  ) {
    this.id = id;
    this.name = name;
    this.capabilities = capabilities;
    this.metadata = { taskCount: 0, createdAt: Date.now() };
  }

  get state(): AgentState {
    return this.stateMachine.current;
  }

  async execute(task: unknown): Promise<void> {
    this.transition('thinking');
    this.transition('working');
    await new Promise((r) => setTimeout(r, 10));
    this.metadata.taskCount++;
    this.stateMachine.reset();
    this.publishState();
  }

  handleError(error: Error): void {
    this.lastError = error;
    this.transition('error');
  }

  private transition(to: AgentState): void {
    try {
      this.stateMachine.transition(to);
    } catch {
      // If transition is invalid (e.g., idle -> error), go through thinking first
      if (this.state === 'idle' && to === 'error') {
        this.stateMachine.transition('thinking');
        this.stateMachine.transition('error');
      } else {
        throw new Error(`Invalid transition: ${this.state} -> ${to}`);
      }
    }
    this.publishState();
  }

  private publishState(): void {
    const newState = this.state;
    if (this.eventBus && this._lastState !== newState) {
      this.eventBus.publish('agent.state_changed', {
        agentId: this.id,
        fromState: this._lastState,
        toState: newState,
      });
      this._lastState = newState;
    }
  }
}
