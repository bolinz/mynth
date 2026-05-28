# Mynth Usage Guide

## Installation

```bash
git clone https://github.com/bolinz/mynth.git
cd mynth
pnpm install
pnpm run build
```

## LLM Configuration

Set an API key to enable real LLM-powered agent execution:

```bash
# Anthropic (Claude)
export ANTHROPIC_API_KEY=sk-ant-...

# or OpenAI (GPT)
export OPENAI_API_KEY=sk-...
```

Without an API key, agents fall back to simulated execution (no real LLM calls).

## CLI Commands

```bash
mynth run "task"             # Run chain transfer
mynth status                 # Agent pool status
mynth list                   # List tasks
mynth history                # Persisted task history
mynth logs <taskId>          # View hop details for a task
mynth stop <taskId>          # Cancel a task
mynth trace [taskId]         # Distributed tracing
mynth approve <id>           # Approve a HITL request
mynth pending                # List pending approvals
mynth init <project>         # Scaffold a new project
mynth tui                    # Terminal UI
mynth ui                     # Web UI (http://localhost:3000)
```

### Run a task (chain transfer)

```bash
mynth run "implement a login form with validation"
```

The Orchestrator analyzes the task, infers needed capabilities from 40+ keywords across 8 types, then agents autonomously pass the task along a chain:

```
reasoning → codegen → review → complete
```

Events (agent state changes, hop transfers, anomalies, interventions) are streamed to the console in real-time.

### Distributed tracing

```bash
mynth trace                  # All spans
mynth trace task_123         # Filter by task ID
# Shows span tree: hop.* and llm.* spans with timing
```

### HITL approval

```bash
mynth approve hitl_...       # Approve a pending request
mynth approve hitl_... --reject  # Reject
mynth approve hitl_... --note "needs more info"  # With note
mynth pending                 # List all pending approvals
```

## Task Tree System

Tasks are organized in a hierarchical tree with 5 built-in types:

| Type | Icon | Purpose |
|------|------|---------|
| Mission | ◈ | Top-level goal, auto-archives on new mission |
| Quest | ◆ | Sub-goal within a mission |
| Task | • | Atomic unit of work |
| Urgent | ⚡ | Interrupts current chain, saved context |
| SideQuest | ⚠ | Deviation detected, low priority |

### Progress tracking
- Leaf tasks: progress = -1 (hidden)
- Parent tasks: progress = (completed / total children) × 100
- Progress is zero-cost — no LLM call needed

### Interrupt / Resume
- Urgent tasks can interrupt the current chain
- Context (parent chain, mission) is saved to a 4-slot stack
- `resume()` restores the interrupted task

### Deviation detection
- Uses Jaccard similarity on inferred capabilities
- Threshold < 0.3 → flagged as sidequest
- Prevents mission drift during task execution

## TUI (Terminal UI)

```bash
mynth         # Launch TUI (default)
mynth tui     # Explicit launch
```

### Keyboard shortcuts

| Key | Action |
|-----|--------|
| `Enter` | Submit a task (type any text) |
| `↑` `↓` | Command history navigation |
| `t` | Toggle task tree panel |
| `a` | Approve first pending HITL request |
| `r` | Reject first pending HITL request |
| `Esc` / `c` | Cancel running task |
| `Ctrl+L` | Clear event log |
| `q` / `Ctrl+C` | Quit |

### REPL commands (prefix with `/`)

| Command | Description |
|---------|-------------|
| `/status` | Show agent pool with states and capabilities |
| `/list` | List all tasks |
| `/logs <taskId>` | View hop-chain with durations |
| `/views` | Show registered renderers |
| `/pending` | List pending approvals |
| `/help` | Show all commands |

### Panels

| Panel | Content |
|-------|---------|
| Agents (left) | Agent names, states (● idle / ● working / ▶ transferring), capabilities |
| System (top right) | Task count, hop count, agent count, degradation level |
| Chain (center right) | Flow visualization: agent → agent transfers with timing |
| Task Tree (toggle `t`) | Hierarchical tree: Mission ◆ Quest • Task ⚡ Urgent ⚠ SideQuest |
| Events (bottom left) | Real-time event log with timestamps |
| Approvals (bottom right) | Pending HITL approval requests |

## Web UI

```bash
mynth ui     # Launch at http://localhost:3000
```

### Pages

| Route | Content |
|-------|---------|
| `/` | Dashboard: agent pool, system stats, chain viz, event log |
| `/tree` | Task tree board: nested hierarchy, progress bars, path breadcrumbs |
| `/tasks` | Task JSON |
| `/status` | Agent pool JSON |
| `/pending-approvals` | Pending HITL requests |
| `/run` (POST) | Execute a task via API |
| `/approve` (POST) | Approve/reject HITL requests |
| `/checkpoints?taskId=` | Hop records for a task |
| `/events` | SSE stream for live updates |

### Live updates

The Web UI uses Server-Sent Events (`/events`) to stream:

- `agent.state_changed` — agent transitions
- `hop.recorded` — chain transfer hops
- `anomaly.detected` — meta-layer anomalies
- `intervention.executed` — automated interventions
- `task.submitted` / `task.completed` — task lifecycle
- `task.progress_changed` — tree progress updates
- `hitl.requested` / `hitl.resolved` — approval workflow
- `system.degradation_changed` — health status
- `agent.response` — LLM agent output

## Multi-Tenant

Mynth supports multi-tenant isolation via `TenantContext`:

```typescript
import { StateStore } from '@mynth/core';

const store = new StateStore(db, { tenantId: 'acme-corp' });
```

All StateStore keys are prefixed with `tenant:<tenantId>:` for complete data isolation between tenants within the same LevelDB instance.

## Distributed Tracing

The Tracer records spans for each hop and LLM call:

```typescript
const tracer = new Tracer();
const span = tracer.startSpan('hop.codegen', 'task-123');
// ... work ...
tracer.endSpan(span.spanId, { agent: 'coder', duration: 150 });
```

View traces via CLI:
```bash
mynth trace task_123
# Output:
#   abc123def456  hop.reasoning     150ms    {"agent":"reasoner"}
#     def456abc78  llm.reasoning    120ms
```

## Interaction Protocol

Agents can produce rich responses using 7 built-in renderers:

| Renderer | Description | TUI | Web |
|----------|-------------|-----|-----|
| `markdown` | Formatted text with HTML escaping | Plain text | HTML |
| `table` | Tabular data | ASCII grid | `<table>` |
| `cards` | Interactive cards | Card list | Cards with data-actions |
| `diff` | Code diffs with hunks | Colored diff | Syntax-highlighted |
| `flowchart` | Node/edge diagrams | ASCII nodes → edges | Data attributes for JS |
| `chart` | Bar/line/pie charts | Text values | Data attributes |
| `raw_html` | Raw HTML (sanitized) | Browser hint | `<iframe>` |

## SDK Usage

### In-process (embed mynth in your app)

```typescript
import { CoreEngine } from '@mynth/core';

const engine = new CoreEngine({
  dbPath: './data',
  maxHops: 10,
  agents: [
    { id: 'reasoner', name: 'Reasoner',
      capabilities: [{ type: 'reasoning', level: 8, confidence: 0.9 }] },
    { id: 'coder', name: 'Coder',
      capabilities: [{ type: 'codegen', level: 8, confidence: 0.85 }] },
  ],
});
await engine.start();

const result = await engine.executeTask('write a function');
console.log(result); // { taskId, status, hops }

await engine.stop();
```

### HTTP client (connect to remote mynth)

```typescript
import { HttpClient } from '@mynth/sdk';

const client = new HttpClient('http://localhost:3000');
const result = await client.run('write a function');
const agents = await client.status();
const tasks = await client.tasks();
```

## Configuration

### Engine config (mynth.config.json)

```json
{
  "dbPath": "./data",
  "maxHops": 10,
  "agents": [
    {
      "id": "reasoner",
      "name": "Reasoner",
      "capabilities": [{ "type": "reasoning", "level": 8, "confidence": 0.9 }]
    },
    {
      "id": "coder",
      "name": "Coder",
      "capabilities": [{ "type": "codegen", "level": 8, "confidence": 0.85 }]
    }
  ]
}
```

Validated with Zod schema on engine start. Snapshots can be saved and restored via ConfigManager.

### Available capability types

| Type | Triggers (keywords) |
|------|---------------------|
| reasoning | analyze, reason, think, evaluate, debug |
| codegen | implement, write, create, build, function, class |
| review | review, check, audit, inspect, verify |
| plan | plan, design, architecture, strategy |
| search | search, find, lookup, query |
| creative | design, create, generate, prototype, ui, ux |
| math | calculate, compute, math, formula |
| synthesis | summarize, synthesize, combine, report |
| coordination | coordinate, assign, delegate, manage |
| critique | critique, evaluate, assess, benchmark |

### Capability Router

Use the LLM-powered capability router for smarter agent selection:

```json
{
  "capabilityRouter": {
    "provider": "claude-sonnet",
    "strategy": "llm_boost"
  }
}
```

## Examples

```bash
# Simple agent lifecycle
pnpm --filter @mynth/examples simple

# Multi-agent collaboration chain
pnpm --filter @mynth/examples collab

# Task tree system (mission/quest/task)
pnpm --filter @mynth/examples tree

# Multi-tenant isolation
pnpm --filter @mynth/examples tenant

# Standalone Web UI server
pnpm --filter @mynth/examples web
```

## Testing

```bash
pnpm test                 # 379 tests (unit + integration)
pnpm bench                # Performance benchmarks
pnpm run lint             # Biome check
pnpm test -- --coverage   # With coverage report
```

## Performance Benchmarks

| Metric | Result | Target |
|--------|--------|--------|
| Chain transfer (single hop) | 21ms | <100ms |
| Message queue throughput | 520K msg/s | >10K |
| Task scheduling (1K tasks) | 6ms | <10ms |
| Vector search (10K × 128d) | 62ms | Phase 1 OK |
