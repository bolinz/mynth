import { describe, expect, it } from 'vitest';
import { Intervener } from '../../src/meta/Intervener.ts';

describe('Intervener', () => {
  it('should decide termination for hop count exceeded', () => {
    const inv = new Intervener();
    const action = inv.decide({ type: 'hop_count_exceeded', threshold: 10, current: 15 });
    expect(action.type).toBe('terminate');
  });

  it('should decide replacement for agent error', () => {
    const inv = new Intervener();
    const action = inv.decide({ type: 'agent_error', agentId: 'a' });
    expect(action.type).toBe('replace');
  });

  it('should decide reroute for cycle pattern', () => {
    const inv = new Intervener();
    const action = inv.decide({ type: 'cycle_pattern', agents: ['a', 'b', 'a', 'b'] });
    expect(action.type).toBe('reroute');
  });
});
