import { describe, expect, it } from 'vitest';
import { Tracer } from '../../src/meta/Tracer.ts';

describe('Tracer', () => {
  it('should create and end spans', () => {
    const tracer = new Tracer();
    const span = tracer.startSpan('test.span', 'trace-1');
    expect(span.spanId).toBeDefined();
    expect(span.name).toBe('test.span');

    tracer.endSpan(span.spanId, { key: 'val' });
    const spans = tracer.getTrace('trace-1');
    expect(spans.length).toBe(1);
    expect(spans[0].duration).toBeGreaterThanOrEqual(0);
    expect(spans[0].metadata?.key).toBe('val');
  });

  it('should return spans for a trace', () => {
    const tracer = new Tracer();
    tracer.startSpan('a', 't1');
    tracer.startSpan('b', 't1');
    tracer.startSpan('c', 't2');
    expect(tracer.getTrace('t1').length).toBe(2);
    expect(tracer.getTrace('t2').length).toBe(1);
  });

  it('should clear all spans', () => {
    const tracer = new Tracer();
    tracer.startSpan('test', 't1');
    tracer.clear();
    expect(tracer.getAllSpans().length).toBe(0);
  });
});
