export interface Span {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

export class Tracer {
  private spans = new Map<string, Span>();

  startSpan(name: string, traceId: string, parentSpanId?: string): Span {
    if (this.spans.size >= 5000) {
      let evicted = false;
      for (const [key, span] of this.spans) {
        if (span.endTime !== undefined) {
          this.spans.delete(key);
          evicted = true;
          break;
        }
      }
      if (!evicted) {
        const firstKey = this.spans.keys().next().value;
        if (firstKey !== undefined) this.spans.delete(firstKey);
      }
    }
    const spanId = `span_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const span: Span = {
      spanId,
      traceId,
      parentSpanId,
      name,
      startTime: Date.now(),
    };
    this.spans.set(spanId, span);
    return span;
  }

  endSpan(spanId: string, metadata?: Record<string, unknown>): void {
    const span = this.spans.get(spanId);
    if (!span || span.endTime !== undefined) return;
    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    if (metadata) span.metadata = { ...span.metadata, ...metadata };
  }

  getTrace(traceId: string): Span[] {
    return Array.from(this.spans.values()).filter((s) => s.traceId === traceId);
  }

  getAllSpans(): Span[] {
    return Array.from(this.spans.values());
  }

  clear(): void {
    this.spans.clear();
  }
}
