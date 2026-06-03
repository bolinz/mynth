import { describe, expect, it } from 'vitest';
import { Tracer } from '../../src/meta/Tracer.ts';
import { TraceExporter } from '../../src/tracing/TraceExporter.ts';

describe('TraceExporter', () => {
  it('should export completed spans', () => {
    const tracer = new Tracer();
    const s = tracer.startSpan('test', 'trace-1');
    tracer.endSpan(s.spanId);

    const exporter = new TraceExporter(tracer);
    const spans = exporter.export();
    expect(spans.length).toBe(1);
    expect(spans[0].name).toBe('test');
    expect(spans[0].duration).toBeGreaterThanOrEqual(0);
  });

  it('should not export incomplete spans', () => {
    const tracer = new Tracer();
    tracer.startSpan('incomplete', 'trace-1');

    const exporter = new TraceExporter(tracer);
    expect(exporter.export().length).toBe(0);
  });
});
