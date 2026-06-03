# Observability Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add structured logging, metrics collection, health checking, and trace export to mynth.

**Architecture:** 4 independent phases. Each is testable and can be committed separately.

**Tech Stack:** TypeScript, Vitest

---

### Phase 1: Structured Logger

#### Task 1.1: Logger class + tests

**Files:**
- Create: `packages/core/src/logger/Logger.ts`
- Create: `packages/core/test/logger/Logger.test.ts`

- [ ] **Step 1: Create Logger.ts**

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  taskId?: string;
  agentId?: string;
  [key: string]: string | undefined;
}

export class Logger {
  private static levelOrder: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  private static currentLevel: LogLevel = 'info';

  static setLevel(level: LogLevel): void {
    Logger.currentLevel = level;
  }

  constructor(
    private name: string,
    private context?: LogContext,
  ) {}

  child(name: string): Logger {
    return new Logger(`${this.name}.${name}`, this.context);
  }

  withContext(ctx: LogContext): Logger {
    return new Logger(this.name, { ...this.context, ...ctx });
  }

  debug(msg: string, ctx?: LogContext): void {
    this.log('debug', msg, ctx);
  }

  info(msg: string, ctx?: LogContext): void {
    this.log('info', msg, ctx);
  }

  warn(msg: string, ctx?: LogContext): void {
    this.log('warn', msg, ctx);
  }

  error(msg: string, ctx?: LogContext, err?: Error): void {
    this.log('error', msg, ctx, err);
  }

  private log(level: LogLevel, msg: string, ctx?: LogContext, err?: Error): void {
    const logLevelOrder = Logger.levelOrder.indexOf(level);
    const currentLevelOrder = Logger.levelOrder.indexOf(Logger.currentLevel);
    if (logLevelOrder < currentLevelOrder) return;

    const timestamp = new Date().toISOString();
    const merged = { ...this.context, ...ctx };
    const contextStr = Object.keys(merged).length > 0
      ? ' ' + JSON.stringify(merged)
      : '';
    const errorStr = err ? ` ${err.stack ?? err.message}` : '';
    const line = `[${timestamp}] [${level.toUpperCase()}] [${this.name}] ${msg}${contextStr}${errorStr}`;

    switch (level) {
      case 'error': console.error(line); break;
      case 'warn': console.warn(line); break;
      default: console.log(line);
    }
  }
}
```

- [ ] **Step 2: Create Logger test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { Logger } from '../../src/logger/Logger.ts';

describe('Logger', () => {
  it('should format log messages correctly', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = new Logger('Test');
    log.info('hello');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[INFO] [Test] hello'));
    spy.mockRestore();
  });

  it('should include context in output', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = new Logger('Test', { taskId: 't1' });
    log.info('working');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('"taskId":"t1"'));
    spy.mockRestore();
  });

  it('should filter by level', () => {
    Logger.setLevel('warn');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const log = new Logger('Test');
    log.debug('hidden');
    log.info('hidden');
    log.warn('shown');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[WARN]'));
    spy.mockRestore();
  });

  it('should create child logger', () => {
    const parent = new Logger('Parent');
    const child = parent.child('Child');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    child.info('test');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[Parent.Child]'));
    spy.mockRestore();
  });
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/logger/`

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/logger/ packages/core/test/logger/
git commit -m "feat(core): add structured Logger"
```

---

#### Task 1.2: Replace console.log in core subsystems

**Files:**
- Modify: All files in `packages/core/src/` that use `console.log`/`console.warn`/`console.error`

- [ ] **Step 1: Find all console.log/warn/error calls**

Run: `rg "console\.(log|warn|error)" packages/core/src/ --include "*.ts"`

- [ ] **Step 2: Create root logger and replace in CoreEngine.ts**

Add as field in CoreEngine:
```ts
import { Logger } from '../logger/Logger.ts';
// ...
logger = new Logger('CoreEngine');
```

Replace:
```ts
console.warn(...) → this.logger.warn(...)
console.error(...) → this.logger.error(...)
```

- [ ] **Step 3: Replace in ChainTransferManager.ts**

Add logger field and replace console references.

- [ ] **Step 4: Run tests**

Run: `pnpm test` — all pass

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/
git commit -m "refactor(core): replace console.log with Logger in subsystems"
```

---

#### Task 1.3: Replace console.log in CLI

**Files:**
- Modify: `packages/cli/src/commands/*.ts`
- Modify: `packages/cli/src/web/server.ts`

- [ ] **Step 1: Replace console.log in CLI commands**

Add logger to each command. For CLI output to user, keep using `console.log` but add logger for diagnostics.

- [ ] **Step 2: Replace in web server**

Replace `console.log('Web UI: ...')` with logger.

- [ ] **Step 3: Run tests**

Run: `pnpm test`

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/
git commit -m "refactor(cli): replace console.log with Logger"
```

---

### Phase 2: Metrics Collection

#### Task 2.1: MetricsRegistry + tests

**Files:**
- Create: `packages/core/src/metrics/MetricsRegistry.ts`
- Create: `packages/core/test/metrics/MetricsRegistry.test.ts`

- [ ] **Step 1: Create MetricsRegistry.ts**

```ts
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
  quantiles(): Record<number, number>;
}

class CounterImpl implements Counter {
  private _value = 0;
  inc(v = 1): number { this._value += v; return this._value; }
  value(): number { return this._value; }
}

class GaugeImpl implements Gauge {
  private _value = 0;
  set(v: number): number { this._value = v; return this._value; }
  inc(v = 1): number { this._value += v; return this._value; }
  dec(v = 1): number { this._value -= v; return this._value; }
  value(): number { return this._value; }
}

class HistogramImpl implements Histogram {
  private values: number[] = [];
  private _buckets: number[];
  constructor(buckets = [1, 5, 10, 50, 100, 500, 1000, 5000]) {
    this._buckets = buckets;
  }
  observe(v: number): void { this.values.push(v); }
  value(): number { return this.values.length; }
  quantiles(): Record<number, number> {
    const sorted = [...this.values].sort((a, b) => a - b);
    const result: Record<number, number> = {};
    for (const b of this._buckets) {
      result[String(b)] = sorted.filter(v => v <= b).length;
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
```

- [ ] **Step 2: Create test**

```ts
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
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/metrics/`

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/metrics/ packages/core/test/metrics/
git commit -m "feat(core): add MetricsRegistry with Prometheus format"
```

---

#### Task 2.2: Wire metrics into subsystems

**Files:**
- Modify: `packages/core/src/engine/CoreEngine.ts`
- Modify: `packages/core/src/chain/ChainTransferManager.ts`
- Modify: `packages/core/src/tool/ToolRegistry.ts`

- [ ] **Step 1: Add metrics field to CoreEngine**

```ts
metricsRegistry = new MetricsRegistry();
```

Register metrics:
```ts
this.taskCounter = this.metricsRegistry.counter('tasks_total', 'Total tasks executed');
this.activeGauge = this.metricsRegistry.gauge('tasks_active', 'Currently active tasks');
```

Increment in `executeTask`:
```ts
this.taskCounter.inc();
this.activeGauge.inc();
// ... on complete:
this.activeGauge.dec();
```

- [ ] **Step 2: Add metrics to ChainTransferManager**

```ts
this.metricsRegistry.counter('hops_total', 'Total hops').inc();
this.metricsRegistry.histogram('hop_duration_ms', 'Hop duration').observe(duration);
```

- [ ] **Step 3: Add tool call counter to ToolRegistry**

```ts
this.metricsRegistry.counter('tool_calls_total', 'Tool calls by tool').inc();
```

- [ ] **Step 4: Add /metrics endpoint to web server**

```ts
if (url.pathname === '/metrics') {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(engine.metricsRegistry.metrics());
  return;
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test` — all pass

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ packages/cli/src/
git commit -m "feat(core): wire metrics into subsystems + /metrics endpoint"
```

---

### Phase 3: Health Check API

#### Task 3.1: HealthChecker + /health endpoint

**Files:**
- Create: `packages/core/src/health/HealthChecker.ts`
- Modify: `packages/cli/src/web/server.ts`
- Test: `packages/core/test/health/HealthChecker.test.ts`

- [ ] **Step 1: Create HealthChecker.ts**

```ts
import type { DegradationMonitor } from '../meta/DegradationMonitor.ts';
import type { AgentPool } from '../agent/AgentPool.ts';
import type { Persistence } from '../persistence/Persistence.ts';

export interface SubsystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  details?: string;
}

export interface HealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  subsystems: Record<string, SubsystemHealth>;
  uptime: number;
}

export class HealthChecker {
  private startTime = Date.now();

  constructor(
    private degradation?: DegradationMonitor,
    private pool?: AgentPool,
    private db?: Persistence,
  ) {}

  async check(): Promise<HealthResult> {
    const subsystems: Record<string, SubsystemHealth> = {};

    // Database
    try {
      if (this.db) {
        await this.db.get('__health_check__');
        subsystems.database = { status: 'healthy' };
      }
    } catch {
      subsystems.database = { status: 'healthy' }; // not found is ok
    }

    // Agent pool
    if (this.pool) {
      const agents = this.pool.getAllAgents();
      subsystems.agent_pool = { status: 'healthy', details: `${agents.length} agents` };
    }

    // Degradation
    if (this.degradation) {
      const dims = this.degradation.getStatus();
      const degraded = Object.values(dims).some((v: number) => v < 0.5);
      subsystems.degradation = {
        status: degraded ? 'degraded' : 'healthy',
        details: JSON.stringify(dims),
      };
    }

    const statuses = Object.values(subsystems).map((s) => s.status);
    const overall: HealthResult['status'] = statuses.some((s) => s === 'unhealthy')
      ? 'unhealthy'
      : statuses.some((s) => s === 'degraded')
        ? 'degraded'
        : 'healthy';

    return {
      status: overall,
      subsystems,
      uptime: Date.now() - this.startTime,
    };
  }
}
```

- [ ] **Step 2: Write test**

```ts
import { describe, expect, it } from 'vitest';
import { HealthChecker } from '../../src/health/HealthChecker.ts';

describe('HealthChecker', () => {
  it('should return healthy for empty checker', async () => {
    const hc = new HealthChecker();
    const result = await hc.check();
    expect(result.status).toBe('healthy');
    expect(result.uptime).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 3: Wire into CoreEngine + /health endpoint**

Add field in CoreEngine, instantiate with dependencies.
Add route in web server:
```ts
if (url.pathname === '/health') {
  const health = await engine.healthChecker.check();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(health, null, 2));
  return;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test` — all pass

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/health/ packages/cli/src/web/
git commit -m "feat(core): add HealthChecker + /health endpoint"
```

---

### Phase 4: Trace Export

#### Task 4.1: TraceExporter + API endpoint

**Files:**
- Create: `packages/core/src/tracing/TraceExporter.ts`
- Modify: `packages/cli/src/web/server.ts`
- Test: `packages/core/test/tracing/TraceExporter.test.ts`

- [ ] **Step 1: Create TraceExporter.ts**

```ts
import { Tracer, type Span } from '../meta/Tracer.ts';
import { writeFile } from 'fs/promises';

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
      .filter((s) => s.endTime !== undefined)
      .map((s) => ({
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
```

- [ ] **Step 2: Write test**

```ts
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
```

- [ ] **Step 3: Add /api/traces endpoint**

```ts
if (url.pathname === '/api/traces') {
  const exporter = new TraceExporter(engine.tracer);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(exporter.export(), null, 2));
  return;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test` — all pass

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tracing/ packages/core/test/tracing/
git commit -m "feat(core): add TraceExporter + /api/traces endpoint"
```

---

### Task 5: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`

- [ ] **Step 2: Run lint**

Run: `pnpm run lint`

- [ ] **Step 3: Verify /metrics and /health endpoints**

Run: `MYNTH_DATA_DIR=$(mktemp -d) npx tsx packages/cli/src/index.ts ui &` then `curl localhost:3000/metrics && curl localhost:3000/health`
