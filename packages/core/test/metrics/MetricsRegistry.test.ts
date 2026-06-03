import { describe, expect, it } from 'vitest';
import { MetricsRegistry } from '../../src/metrics/MetricsRegistry.ts';

describe('MetricsRegistry', () => {
  it('should create and increment counter', () => {
    const reg = new MetricsRegistry();
    const c = reg.counter('test_total', 'Test counter');
    expect(c.inc()).toBe(1);
    expect(c.inc(5)).toBe(6);
    expect(c.value()).toBe(6);
  });

  it('should set gauge value', () => {
    const reg = new MetricsRegistry();
    const g = reg.gauge('active', 'Active items');
    g.set(10);
    expect(g.value()).toBe(10);
    g.inc(5);
    expect(g.value()).toBe(15);
    g.dec(3);
    expect(g.value()).toBe(12);
  });

  it('should observe histogram', () => {
    const reg = new MetricsRegistry();
    const h = reg.histogram('duration_ms', 'Duration', [10, 100]);
    h.observe(5);
    h.observe(50);
    expect(h.value()).toBe(2);
  });

  it('should format Prometheus output', () => {
    const reg = new MetricsRegistry();
    reg.counter('tasks_total', 'Total tasks').inc(3);
    reg.gauge('active', 'Active tasks').set(2);
    const output = reg.metrics();
    expect(output).toContain('# HELP tasks_total');
    expect(output).toContain('tasks_total 3');
    expect(output).toContain('active 2');
  });

  it('should reuse same metric instance for same name', () => {
    const reg = new MetricsRegistry();
    const c1 = reg.counter('x', 'X');
    const c2 = reg.counter('x', 'X');
    expect(c1).toBe(c2);
  });
});
