import { describe, expect, it, vi } from 'vitest';
import { Observer } from '../../src/meta/Observer.ts';

describe('Observer', () => {
  it('should start and stop monitoring', () => {
    const obs = new Observer();
    obs.start({ interval: 100 });
    expect(obs.isRunning()).toBe(true);
    obs.stop();
    expect(obs.isRunning()).toBe(false);
  });

  it('should detect cycle pattern anomaly', () => {
    const obs = new Observer();
    const onAnomaly = vi.fn();
    obs.onAnomaly(onAnomaly);

    obs.recordHop('a', 'b', 100);
    obs.recordHop('b', 'c', 100);
    obs.recordHop('a', 'b', 100);
    obs.recordHop('b', 'c', 100);
    const anomalies = obs.detectAnomalies();
    expect(anomalies.length).toBeGreaterThanOrEqual(1);
    expect(anomalies[0].type).toBe('cycle_pattern');
  });
});
