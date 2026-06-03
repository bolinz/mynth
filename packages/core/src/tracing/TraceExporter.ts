import { writeFile } from 'fs/promises';
import type { Span, Tracer } from '../meta/Tracer.ts';

export interface ExportedSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  metadata?: Record<string, unknown>;
}

export class TraceExporter {
  constructor(private tracer: Tracer) {}

  export(): ExportedSpan[] {
    return this.tracer
      .getAllSpans()
      .filter((s: Span) => s.endTime !== undefined)
      .map((s: Span) => ({
        traceId: s.traceId,
        spanId: s.spanId,
        parentSpanId: s.parentSpanId,
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime!,
        duration: s.duration ?? 0,
        metadata: s.metadata,
      }));
  }

  async exportToJSON(filePath: string): Promise<void> {
    const spans = this.export();
    await writeFile(filePath, JSON.stringify(spans, null, 2), 'utf-8');
  }
}
