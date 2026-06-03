export interface Counter {
  inc(value?: number): number;
  value(): number;
}

export interface Gauge {
  set(value: number): number;
  inc(value?: number): number;
  dec(value?: number): number;
  value(): number;
}

export interface Histogram {
  observe(value: number): void;
  value(): number;
  quantiles(): Record<string, number>;
}

class CounterImpl implements Counter {
  private _value = 0;
  inc(v = 1): number {
    this._value += v;
    return this._value;
  }
  value(): number {
    return this._value;
  }
}

class GaugeImpl implements Gauge {
  private _value = 0;
  set(v: number): number {
    this._value = v;
    return this._value;
  }
  inc(v = 1): number {
    this._value += v;
    return this._value;
  }
  dec(v = 1): number {
    this._value -= v;
    return this._value;
  }
  value(): number {
    return this._value;
  }
}

class HistogramImpl implements Histogram {
  private values: number[] = [];
  private buckets: number[];

  constructor(buckets = [1, 5, 10, 50, 100, 500, 1000, 5000]) {
    this.buckets = buckets;
  }

  observe(v: number): void {
    this.values.push(v);
  }

  value(): number {
    return this.values.length;
  }

  quantiles(): Record<string, number> {
    const sorted = [...this.values].sort((a, b) => a - b);
    const result: Record<string, number> = {};
    for (const b of this.buckets) {
      result[String(b)] = sorted.filter((v) => v <= b).length;
    }
    return result;
  }
}

export class MetricsRegistry {
  private counters = new Map<string, CounterImpl>();
  private gauges = new Map<string, GaugeImpl>();
  private histograms = new Map<string, HistogramImpl>();
  private helps = new Map<string, string>();

  counter(name: string, help: string): Counter {
    this.helps.set(name, help);
    if (!this.counters.has(name)) this.counters.set(name, new CounterImpl());
    return this.counters.get(name)!;
  }

  gauge(name: string, help: string): Gauge {
    this.helps.set(name, help);
    if (!this.gauges.has(name)) this.gauges.set(name, new GaugeImpl());
    return this.gauges.get(name)!;
  }

  histogram(name: string, help: string, buckets?: number[]): Histogram {
    this.helps.set(name, help);
    if (!this.histograms.has(name)) this.histograms.set(name, new HistogramImpl(buckets));
    return this.histograms.get(name)!;
  }

  metrics(): string {
    const lines: string[] = [];
    for (const [name, c] of this.counters) {
      lines.push(`# HELP ${name} ${this.helps.get(name) ?? ''}`);
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${c.value()}`);
    }
    for (const [name, g] of this.gauges) {
      lines.push(`# HELP ${name} ${this.helps.get(name) ?? ''}`);
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${g.value()}`);
    }
    for (const [name, h] of this.histograms) {
      lines.push(`# HELP ${name} ${this.helps.get(name) ?? ''}`);
      lines.push(`# TYPE ${name} histogram`);
      const q = h.quantiles();
      for (const [bucket, count] of Object.entries(q)) {
        lines.push(`${name}_bucket{le="${bucket}"} ${count}`);
      }
      lines.push(`${name}_count ${h.value()}`);
    }
    return lines.join('\n');
  }
}
