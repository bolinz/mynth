import { describe, expect, it } from 'vitest';
import { AgentStateMachine } from '../../src/agent/AgentState.ts';

describe('AgentStateMachine', () => {
  it('should start in idle state', () => {
    const sm = new AgentStateMachine();
    expect(sm.current).toBe('idle');
  });

  it('should transition idle -> thinking', () => {
    const sm = new AgentStateMachine();
    sm.transition('thinking');
    expect(sm.current).toBe('thinking');
  });

  it('should transition thinking -> working', () => {
    const sm = new AgentStateMachine();
    sm.transition('thinking');
    sm.transition('working');
    expect(sm.current).toBe('working');
  });

  it('should reject invalid transitions', () => {
    const sm = new AgentStateMachine();
    expect(() => sm.transition('error')).toThrow('Invalid transition');
  });

  it('should transition working -> error', () => {
    const sm = new AgentStateMachine();
    sm.transition('thinking');
    sm.transition('working');
    sm.transition('error');
    expect(sm.current).toBe('error');
  });

  it('should transition working -> transferring -> idle on transfer complete', () => {
    const sm = new AgentStateMachine();
    sm.transition('thinking');
    sm.transition('working');
    sm.transition('transferring');
    expect(sm.current).toBe('transferring');
    sm.transition('idle');
    expect(sm.current).toBe('idle');
  });

  it('should transition idle -> thinking -> waiting -> working', () => {
    const sm = new AgentStateMachine();
    sm.transition('thinking');
    sm.transition('waiting');
    expect(sm.current).toBe('waiting');
    sm.transition('working');
    expect(sm.current).toBe('working');
  });

  it('should transition error -> idle on reset', () => {
    const sm = new AgentStateMachine();
    sm.transition('thinking');
    sm.transition('working');
    sm.transition('error');
    sm.transition('idle');
    expect(sm.current).toBe('idle');
  });

  it('should allow reset to idle from any state after error/intervened', () => {
    const sm = new AgentStateMachine();
    sm.transition('thinking');
    sm.transition('working');
    sm.transition('error');
    sm.transition('idle');
    expect(sm.current).toBe('idle');
  });
});
