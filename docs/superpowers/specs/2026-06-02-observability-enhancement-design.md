# Observability Enhancement Design

**Goal:** Add structured logging, metrics collection, health checking, and trace export to mynth.

**Architecture:** 4 independent phases built on existing infrastructure (Tracer, DegradationMonitor, Web server).

**Status:** Design approved.

---

## Phase 1: Structured Logger

**File:** `packages/core/src/logger/Logger.ts`

```ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  taskId?: string;
  agentId?: string;
  [key: string]: string | undefined;
}

class Logger {
  constructor(private name: string)

  debug(msg: string, ctx?: LogContext): void
  info(msg: string, ctx?: LogContext): void
  warn(msg: string, ctx?: LogContext): void
  error(msg: string, ctx?: LogContext, err?: Error): void

  child(name: string): Logger
  withContext(ctx: LogContext): Logger
}
```

**Output format:** `[timestamp] [LEVEL] [name] message {key: value}`

**Replaces all `console.log`/`console.warn`/`console.error`** in:
- `packages/core/src/` (CoreEngine, ChainTransferManager, subsystems)
- `packages/cli/src/` (commands, server)

---

## Phase 2: Metrics Collection

**File:** `packages/core/src/metrics/MetricsRegistry.ts`

```ts
interface Counter { inc(v?: number): number; value(): number }
interface Gauge { set(v: number): number; inc(v?: number): number; dec(v?: number): number; value(): number }
interface Histogram { observe(v: number): void; quantiles(): Record<number, number> }

class MetricsRegistry {
  counter(name: string, help: string): Counter
  gauge(name: string, help: string): Gauge
  histogram(name: string, help: string, buckets?: number[]): Histogram
  metrics(): string // Prometheus text format
}
```

**Built-in metrics:**
| Metric | Type | Wired in |
|--------|------|----------|
| `task_total` | Counter | CoreEngine |
| `task_active` | Gauge | CoreEngine |
| `hop_total` | Counter | ChainTransferManager |
| `hop_duration_ms` | Histogram | ChainTransferManager |
| `error_total{type}` | Counter | CoreEngine, subsystems |
| `tool_call_total{tool}` | Counter | ToolRegistry |

**Web endpoint:** `GET /metrics` → Prometheus text format.

---

## Phase 3: Health Check

**File:** `packages/core/src/health/HealthChecker.ts`

Integration with existing DegradationMonitor. Exposes:
- `GET /health` → JSON with subsystem statuses
- Status: healthy / degraded / unhealthy
- Subsystems: database, agent_pool, message_bus, degradation

---

## Phase 4: Trace Export

**File:** `packages/core/src/tracing/TraceExporter.ts`

Reads from existing Tracer. Exports:
- `GET /api/traces` → JSON array of completed spans
- `exportToJSON(path)` → write to file

---

## Implementation Order

Phase 1 → Phase 2 → Phase 3 → Phase 4. Each is independent and testable.
