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

### Run a task (chain transfer)

```bash
mynth run "implement a login form with validation"
```

The Orchestrator analyzes the task, infers needed capabilities, then agents autonomously pass the task along a chain:

```
reasoning → codegen → review → complete
```

### View system status

```bash
mynth status
# Shows agent pool: agent names, states, capabilities
```

### List tasks

```bash
mynth list
# Shows task IDs, statuses, ages
```

### View persisted history

```bash
mynth history
# Shows all tasks and agents persisted to LevelDB (~/.mynth/data)
```

### View task hop details

```bash
mynth logs task_1779340000000
# Shows each hop: fromAgent → toAgent, duration
```

### Cancel a task

```bash
mynth stop task_1779340000000
```

### Scaffold a new project

```bash
mynth init my-project
# Creates my-project/ with mynth.config.json, src/index.ts, data/
```

## TUI (Terminal UI)

```bash
mynth         # Launch TUI (default)
mynth tui     # Explicit launch
```

**Keyboard shortcuts:**

| Key | Action |
|-----|--------|
| `Enter` | Submit task |
| `↑` `↓` | Command history |
| `Esc` `c` | Cancel running task |
| `Ctrl+L` | Clear event log |
| `q` | Quit |

**REPL commands** (prefix with `/`):

| Command | Description |
|---------|-------------|
| `/status` | Show agent pool |
| `/list` | List tasks |
| `/logs <id>` | View hop details |
| `/help` | Show commands |

## Web UI

```bash
mynth ui     # Launch at http://localhost:3000
```

- **Agent Pool panel** — shows all agents with colored status dots (green=working, gray=idle)
- **System stats** — task count, hop count, agent count
- **Chain visualization** — flow chart showing agent transfers
- **Event log** — real-time events via Server-Sent Events
- **Task detail** — click any task ID to view hop chain with durations
- **Stop button** — cancel running task

## SDK Usage

### In-process (embed mynth in your app)

```typescript
import { CoreEngine, InProcessClient } from '@mynth/core';

const engine = new CoreEngine({ dbPath: './data' });
await engine.start();

const client = new InProcessClient(engine);
const result = await client.run('write a function');
console.log(result); // { taskId, status, hops }

// Subscribe to events
client.subscribe('hop.recorded', (topic, payload) => {
  console.log(`${payload.from} → ${payload.to}`);
});

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
    }
  ]
}
```

Validated with Zod schema on engine start.

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

## Performance Benchmarks

| Metric | Result | Target |
|--------|--------|--------|
| Chain transfer (single hop) | 21ms | <100ms |
| Message queue throughput | 520K msg/s | >10K |
| Task scheduling | 6ms/1K | <10ms |

Run benchmarks: `pnpm test bench`
