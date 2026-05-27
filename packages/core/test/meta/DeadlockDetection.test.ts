import { describe, expect, it } from 'vitest';
import { Observer } from '../../src/meta/Observer.ts';

describe('Deadlock detection', () => {
  it('should detect simple cycle', () => {
    const obs = new Observer();
    obs.recordWait('agent-a', 'agent-b');
    obs.recordWait('agent-b', 'agent-a');
    const anomalies = obs.detectDeadlock();
    expect(anomalies.some((a) => a.type === 'deadlock_detected')).toBe(true);
  });

  it('should detect longer cycle', () => {
    const obs = new Observer();
    obs.recordWait('a', 'b');
    obs.recordWait('b', 'c');
    obs.recordWait('c', 'a');
    const anomalies = obs.detectDeadlock();
    expect(anomalies.some((a) => a.type === 'deadlock_detected')).toBe(true);
  });

  it('should not false-positive on linear waits', () => {
    const obs = new Observer();
    obs.recordWait('a', 'b');
    obs.recordWait('b', 'c');
    obs.recordWait('c', 'd');
    const anomalies = obs.detectDeadlock();
    expect(anomalies.some((a) => a.type === 'deadlock_detected')).toBe(false);
  });

  it('should clear when resolved', () => {
    const obs = new Observer();
    obs.recordWait('a', 'b');
    obs.recordWait('b', 'a');
    obs.resolveWait('a');
    obs.resolveWait('b');
    const anomalies = obs.detectDeadlock();
    expect(anomalies.some((a) => a.type === 'deadlock_detected')).toBe(false);
  });
});
