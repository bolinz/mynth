import type { CoreEngine } from '@mynth/core';

export async function traceCommand(engine: CoreEngine, taskId?: string): Promise<void> {
  const spans = taskId ? engine.tracer.getTrace(taskId) : engine.tracer.getAllSpans();

  if (spans.length === 0) {
    console.log('No traces available.');
    return;
  }

  console.log(`\nTraces (${spans.length} spans):\n`);
  for (const span of spans) {
    const indent = span.parentSpanId ? '  ' : '';
    const duration = span.duration !== undefined ? `${span.duration}ms` : 'running';
    const meta = span.metadata ? ` ${JSON.stringify(span.metadata)}` : '';
    console.log(
      `${indent}${span.spanId.slice(0, 12)}  ${span.name.padEnd(20)}  ${duration.padEnd(10)}${meta}`,
    );
  }
}
