# HITL 审批框架实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent 执行高风险操作前暂停并请求用户审批，支持 TUI + Web UI 双端审批。

**Architecture:** HITLManager 管理审批请求生命周期，Guard 扩展后提供审批判断，EventBus 推送实时事件，CLI/TUI/Web 提供审批界面。默认内存存储，可选 LevelDB 持久化。

**Tech Stack:** TypeScript, Vitest, neo-blessed, http

---

### Task 1: HITLManager 核心逻辑

**Files:**
- Create: `packages/core/src/meta/HITLManager.ts`
- Create: `packages/core/test/meta/HITLManager.test.ts`
- Modify: `packages/core/src/meta/Guard.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: 创建 HITLManager**

Create `packages/core/src/meta/HITLManager.ts`:

```typescript
import type { Persistence } from '../persistence/Persistence.ts';

export interface HITLOperation {
  type: string;
  target: string;
  summary: string;
}

export interface HITLRequest {
  id: string;
  agentId: string;
  taskId: string;
  operation: HITLOperation;
  triggeredBy: 'guard_rule' | 'agent_self_assess';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  decidedAt?: number;
  decidedBy?: string;
  note?: string;
}

export class HITLManager {
  private requests = new Map<string, HITLRequest>();
  private persistence?: Persistence;

  constructor(persistence?: Persistence) {
    this.persistence = persistence;
  }

  async submit(data: Omit<HITLRequest, 'id' | 'status' | 'createdAt'>): Promise<HITLRequest> {
    const request: HITLRequest = {
      ...data,
      id: `hitl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: 'pending',
      createdAt: Date.now(),
    };
    this.requests.set(request.id, request);
    if (this.persistence) {
      await this.persistence.put(`hitl:${request.id}`, request);
    }
    return request;
  }

  async approve(id: string, by: string, note?: string): Promise<boolean> {
    const req = this.requests.get(id);
    if (!req || req.status !== 'pending') return false;
    req.status = 'approved';
    req.decidedAt = Date.now();
    req.decidedBy = by;
    req.note = note;
    if (this.persistence) {
      await this.persistence.put(`hitl:${id}`, req);
    }
    return true;
  }

  async reject(id: string, by: string, note?: string): Promise<boolean> {
    const req = this.requests.get(id);
    if (!req || req.status !== 'pending') return false;
    req.status = 'rejected';
    req.decidedAt = Date.now();
    req.decidedBy = by;
    req.note = note;
    if (this.persistence) {
      await this.persistence.put(`hitl:${id}`, req);
    }
    return true;
  }

  getPending(): HITLRequest[] {
    return Array.from(this.requests.values()).filter((r) => r.status === 'pending');
  }

  getPendingCount(): number {
    return this.getPending().length;
  }

  getById(id: string): HITLRequest | undefined {
    return this.requests.get(id);
  }

  getAll(): HITLRequest[] {
    return Array.from(this.requests.values());
  }

  async loadAll(): Promise<void> {
    if (!this.persistence) return;
    const raw = await this.persistence.range('hitl:', 'hitl~');
    for (const [, value] of raw) {
      const req = value as HITLRequest;
      this.requests.set(req.id, req);
    }
  }
}
```

- [ ] **Step 2: 扩展 Guard 新增 checkOperation**

In `packages/core/src/meta/Guard.ts`, add after `approveTool`:

```typescript
import type { HITLOperation } from './HITLManager.ts';

export interface OperationCheck {
  allowed: boolean;
  needsApproval: boolean;
  reason?: string;
  requestData?: {
    agentId: string;
    taskId: string;
    operation: HITLOperation;
    triggeredBy: 'guard_rule' | 'agent_self_assess';
  };
}

// Add method to Guard class:
  checkOperation(
    agentId: string,
    taskId: string,
    operation: HITLOperation,
  ): OperationCheck {
    const role = this.agentRoles.get(agentId) ?? 'viewer';

    // Rule: budget override requires approval for non-admin
    if (operation.type === 'budget.override' && role !== 'admin') {
      return {
        allowed: false,
        needsApproval: true,
        reason: 'budget override requires admin approval',
        requestData: { agentId, taskId, operation, triggeredBy: 'guard_rule' },
      };
    }

    // Rule: config modification requires approval
    if (operation.type === 'config.modify') {
      return {
        allowed: false,
        needsApproval: true,
        reason: 'config modification requires approval',
        requestData: { agentId, taskId, operation, triggeredBy: 'guard_rule' },
      };
    }

    // Rule: cancel other agent's task requires approval
    if (operation.type === 'task.cancel' && role !== 'admin') {
      return {
        allowed: false,
        needsApproval: true,
        reason: 'cancelling tasks requires approval',
        requestData: { agentId, taskId, operation, triggeredBy: 'guard_rule' },
      };
    }

    return { allowed: true, needsApproval: false };
  }
```

- [ ] **Step 3: 导出 HITLManager**

In `packages/core/src/index.ts`, add to the meta exports section:

```typescript
export { HITLManager } from './meta/HITLManager.ts';
export type { HITLRequest, HITLOperation } from './meta/HITLManager.ts';
```

- [ ] **Step 4: 编写 HITLManager 测试**

Create `packages/core/test/meta/HITLManager.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { HITLManager } from '../../src/meta/HITLManager.ts';

describe('HITLManager', () => {
  it('should submit and return pending requests', async () => {
    const mgr = new HITLManager();
    const req = await mgr.submit({
      agentId: 'agent-1',
      taskId: 'task-1',
      operation: { type: 'config.modify', target: 'budget', summary: 'Modify budget limit' },
      triggeredBy: 'guard_rule',
    });
    expect(req.status).toBe('pending');
    expect(req.id).toBeDefined();
    expect(mgr.getPendingCount()).toBe(1);
  });

  it('should approve a pending request', async () => {
    const mgr = new HITLManager();
    const req = await mgr.submit({
      agentId: 'agent-1', taskId: 't1',
      operation: { type: 'config.modify', target: 'budget', summary: 'test' },
      triggeredBy: 'guard_rule',
    });
    const ok = await mgr.approve(req.id, 'user-1');
    expect(ok).toBe(true);
    const approved = mgr.getById(req.id)!;
    expect(approved.status).toBe('approved');
    expect(approved.decidedBy).toBe('user-1');
  });

  it('should reject a pending request', async () => {
    const mgr = new HITLManager();
    const req = await mgr.submit({
      agentId: 'agent-1', taskId: 't1',
      operation: { type: 'config.modify', target: 'budget', summary: 'test' },
      triggeredBy: 'guard_rule',
    });
    const ok = await mgr.reject(req.id, 'user-1', 'not now');
    expect(ok).toBe(true);
    const rejected = mgr.getById(req.id)!;
    expect(rejected.status).toBe('rejected');
    expect(rejected.note).toBe('not now');
  });

  it('should not approve non-pending request', async () => {
    const mgr = new HITLManager();
    expect(await mgr.approve('nonexistent', 'user')).toBe(false);
  });

  it('should return all requests', async () => {
    const mgr = new HITLManager();
    await mgr.submit({
      agentId: 'a', taskId: 't1',
      operation: { type: 'config.modify', target: 'x', summary: 'x' },
      triggeredBy: 'guard_rule',
    });
    await mgr.submit({
      agentId: 'b', taskId: 't2',
      operation: { type: 'budget.override', target: 'y', summary: 'y' },
      triggeredBy: 'guard_rule',
    });
    expect(mgr.getAll().length).toBe(2);
  });
});
```

- [ ] **Step 5: 运行测试验证**

Run: `pnpm test -- packages/core/test/meta/HITLManager.test.ts`
Expected: 5 tests PASS

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/meta/HITLManager.ts packages/core/src/meta/Guard.ts packages/core/src/index.ts packages/core/test/meta/HITLManager.test.ts
git commit -m "feat(core): HITLManager with submit/approve/reject lifecycle"
```

---

### Task 2: EventBus 事件集成

**Files:**
- Modify: `packages/core/src/message-bus/EventBus.ts`

- [ ] **Step 1: 扩展 EventTopic 和 EventPayload**

In `packages/core/src/message-bus/EventBus.ts`, add to `EventTopic`:

```typescript
export type EventTopic =
  | 'agent.state_changed'
  | 'task.submitted'
  | 'task.completed'
  | 'transfer.started'
  | 'transfer.completed'
  | 'hop.recorded'
  | 'anomaly.detected'
  | 'intervention.executed'
  | 'hitl.requested'
  | 'hitl.resolved';
```

Add after `InterventionExecutedEvent`:

```typescript
export interface HITLRequestedEvent {
  requestId: string;
  agentId: string;
  operation: string;
  summary: string;
  createdAt: number;
}

export interface HITLResolvedEvent {
  requestId: string;
  status: string;
  decidedBy?: string;
}
```

Add to `EventPayload` union:

```typescript
export type EventPayload =
  | AgentStateChangedEvent
  | TaskSubmittedEvent
  | TaskCompletedEvent
  | TransferStartedEvent
  | TransferCompletedEvent
  | HopRecordedEvent
  | AnomalyDetectedEvent
  | InterventionExecutedEvent
  | HITLRequestedEvent
  | HITLResolvedEvent;
```

- [ ] **Step 2: 运行测试**

Run: `pnpm test -- packages/core/test/message-bus/EventBus.test.ts`
Expected: 5 tests PASS

- [ ] **Step 3: 提交**

```bash
git add packages/core/src/message-bus/EventBus.ts
git commit -m "feat(core): add hitl.requested and hitl.resolved event topics"
```

---

### Task 3: CoreEngine 集成 HITLManager

**Files:**
- Modify: `packages/core/src/engine/CoreEngine.ts`

- [ ] **Step 1: 在 CoreEngine 中集成 HITLManager**

In `packages/core/src/engine/CoreEngine.ts`:

Add import:

```typescript
import { HITLManager } from '../meta/HITLManager.ts';
```

Add field declaration after `degradation`:

```typescript
  hitlManager!: HITLManager;
```

In `start()`, after `this.degradation = new DegradationMonitor();`, add:

```typescript
    this.hitlManager = new HITLManager(this.db);
    await this.hitlManager.loadAll();
```

- [ ] **Step 2: 运行测试**

Run: `pnpm test`
Expected: All tests pass

- [ ] **Step 3: 提交**

```bash
git add packages/core/src/engine/CoreEngine.ts
git commit -m "feat(core): wire HITLManager into CoreEngine"
```

---

### Task 4: CLI 审批命令

**Files:**
- Create: `packages/cli/src/commands/pending.ts`
- Create: `packages/cli/src/commands/approve.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: 创建 pending 命令**

Create `packages/cli/src/commands/pending.ts`:

```typescript
import type { CoreEngine } from '@mynth/core';

export async function pendingCommand(engine: CoreEngine): Promise<void> {
  const pending = engine.hitlManager.getPending();
  if (pending.length === 0) {
    console.log('No pending approvals.');
    return;
  }
  console.log(`\nPending Approvals (${pending.length}):\n`);
  for (const req of pending) {
    console.log(`  ${req.id}`);
    console.log(`    Agent:    ${req.agentId}`);
    console.log(`    Task:     ${req.taskId}`);
    console.log(`    Action:   ${req.operation.type}: ${req.operation.summary}`);
    console.log(`    Target:   ${req.operation.target}`);
    console.log(`    Time:     ${new Date(req.createdAt).toLocaleString()}`);
    console.log('');
  }
}
```

- [ ] **Step 2: 创建 approve 命令**

Create `packages/cli/src/commands/approve.ts`:

```typescript
import type { CoreEngine } from '@mynth/core';

export interface ApproveOptions {
  reject?: boolean;
  note?: string;
}

export async function approveCommand(
  engine: CoreEngine,
  requestId: string,
  options: ApproveOptions,
): Promise<void> {
  const req = engine.hitlManager.getById(requestId);
  if (!req) {
    console.error(`Request not found: ${requestId}`);
    return;
  }
  if (req.status !== 'pending') {
    console.error(`Request ${requestId} is already ${req.status}`);
    return;
  }

  if (options.reject) {
    await engine.hitlManager.reject(requestId, 'cli', options.note);
    console.log(`Rejected: ${requestId}`);
  } else {
    await engine.hitlManager.approve(requestId, 'cli', options.note);
    console.log(`Approved: ${requestId}`);
  }
}
```

- [ ] **Step 3: 注册命令到 CLI**

In `packages/cli/src/index.ts`, add imports:

```typescript
import { pendingCommand } from './commands/pending.ts';
import { approveCommand } from './commands/approve.ts';
```

Add after the `stop` command registration:

```typescript
cli.command('pending', 'Show pending approval requests').action(async () => {
  await engine.start();
  await pendingCommand(engine);
  await engine.stop();
});

cli
  .command('approve <id>', 'Approve or reject a pending request')
  .option('-r, --reject', 'Reject instead of approve')
  .option('-n, --note <text>', 'Optional note')
  .action(async (id: string, options: { reject?: boolean; note?: string }) => {
    await engine.start();
    await approveCommand(engine, id, options);
    await engine.stop();
  });
```

- [ ] **Step 4: 提交**

```bash
git add packages/cli/src/commands/pending.ts packages/cli/src/commands/approve.ts packages/cli/src/index.ts
git commit -m "feat(cli): add pending and approve CLI commands"
```

---

### Task 5: TUI 审批面板

**Files:**
- Modify: `packages/cli/src/tui/index.ts`

- [ ] **Step 1: 添加审批面板到 TUI**

In `packages/cli/src/tui/index.ts`, add after the logPanel definition (after line 71):

```typescript
  const approvalPanel = blessed.box({
    top: '60%',
    left: '50%',
    width: '50%',
    height: '40%-2',
    label: ' {bold}Approvals{/bold} ',
    border: { type: 'line' },
    style: { border: { fg: 220 }, label: { fg: 'yellow' } },
    scrollable: true,
    alwaysScroll: true,
    tags: true,
    hidden: true,
  });
```

Append it: `screen.append(approvalPanel);` after the line appending logPanel.

Add variable: `let pendingApprovals: string[] = [];` after the state variables (line ~106).

Change statusBar content in `updateStats()` to include pending count:

```typescript
    const pending = engine.hitlManager.getPendingCount();
    statusBar.setContent(
      ` {black-fg}{231-fg} Agents:{/} ${agents.length}  |  Tasks: ${taskCount}  |  Hops: ${hopCount}  |  ${pending > 0 ? '{yellow-fg}Pending:' + pending + '{/}' : ''}`,
    );
```

Add function to update approval panel:

```typescript
  function updateApprovalPanel(): void {
    const pending = engine.hitlManager.getPending();
    if (pending.length === 0) {
      approvalPanel.hide();
      return;
    }
    approvalPanel.show();
    const lines = pending.map((req) => {
      return `  {bold}${req.id}{/}\n` +
        `    Agent: ${req.agentId}  |  Type: {yellow-fg}${req.operation.type}{/}\n` +
        `    {white-fg}${req.operation.summary}{/}\n`;
    });
    approvalPanel.setContent('\n' + lines.join(''));
    screen.render();
  }
```

Add approval event subscriptions alongside existing subscriptions (after line ~258):

```typescript
  unsubs.push(
    engine.eventBus.subscribe('hitl.requested', () => {
      updateApprovalPanel();
      updateStats();
    }),
  );
  unsubs.push(
    engine.eventBus.subscribe('hitl.resolved', () => {
      updateApprovalPanel();
      updateStats();
    }),
  );
```

Call `updateApprovalPanel()` in the initial render section (before `screen.render()` near line 414).

Adjust logPanel dimensions to share bottom half with approvalPanel (change logPanel height to 50%, left to 0, width to 50%):

```typescript
  const logPanel = blessed.box({
    top: '60%',
    left: 0,
    width: '50%',
    height: '40%-2',
    ...
  });
```

- [ ] **Step 2: 提交**

```bash
git add packages/cli/src/tui/index.ts
git commit -m "feat(tui): add approval panel with pending count indicator"
```

---

### Task 6: Web UI 审批 API

**Files:**
- Modify: `packages/cli/src/web/server.ts`

- [ ] **Step 1: 添加审批 API 端点**

In `packages/cli/src/web/server.ts`, add after the `/run` handler:

```typescript
    if (url.pathname === '/pending-approvals') {
      const pending = engine.hitlManager.getPending().map((r) => ({
        id: r.id,
        agentId: r.agentId,
        operation: r.operation,
        createdAt: r.createdAt,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(pending));
      return;
    }

    if (url.pathname === '/approve' && req.method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        try {
          const { id, action, note } = JSON.parse(body);
          const reqData = engine.hitlManager.getById(id);
          if (!reqData) {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Request not found' }));
            return;
          }
          if (action === 'approve') {
            await engine.hitlManager.approve(id, 'web', note);
          } else if (action === 'reject') {
            await engine.hitlManager.reject(id, 'web', note);
          } else {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid action' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      return;
    }
```

Add `'hitl.requested'` and `'hitl.resolved'` to the SSE topics list:

```typescript
  const topics = [
    'agent.state_changed',
    'hop.recorded',
    'anomaly.detected',
    'intervention.executed',
    'task.submitted',
    'task.completed',
    'hitl.requested',
    'hitl.resolved',
  ] as const;
```

- [ ] **Step 2: 提交**

```bash
git add packages/cli/src/web/server.ts
git commit -m "feat(web): add approval API endpoints and SSE events"
```
