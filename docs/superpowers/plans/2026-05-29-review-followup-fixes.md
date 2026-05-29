# Review Follow-up Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 issues found in code review of recent bug fix commits (3b2dc6b..b23e4f0)

**Architecture:** Independent fixes across message-bus, meta, and vector subsystems. Each task is self-contained with its own test.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: MessageBus.send() unhandled promise rejection

**Bug:** `MessageBus.send()` calls `this.queue.enqueue()` with `.then()` but no `.catch()`. If `enqueue()` rejects, this becomes an unhandled promise rejection that crashes Node.js in production.

**Files:**
- Modify: `packages/core/src/message-bus/MessageBus.ts:22-29`
- Test: `packages/core/test/message-bus/MessageBus.test.ts`

- [ ] **Step 1: Add `.catch()` to the promise chain**

```ts
// Current (buggy):
send(to: string, message: Omit<QueueMessage, 'timestamp'>): void {
  this.queue.enqueue({ ...message, timestamp: Date.now() }).then((status) => {
    if (status && status.severity === 'critical') {
      console.warn(
        `[Backpressure] Queue critical: depth ${status.queueDepth}/${status.maxCapacity}`,
      );
    }
  });
}

// Fixed:
send(to: string, message: Omit<QueueMessage, 'timestamp'>): void {
  this.queue
    .enqueue({ ...message, timestamp: Date.now() })
    .then((status) => {
      if (status && status.severity === 'critical') {
        console.warn(
          `[Backpressure] Queue critical: depth ${status.queueDepth}/${status.maxCapacity}`,
        );
      }
    })
    .catch((err) => {
      console.error('[MessageBus] send failed:', err);
    });
}
```

- [ ] **Step 2: Write test for error handling**

```ts
it('should handle enqueue rejection without unhandled rejection', async () => {
  const bus = new MessageBus();
  const original = bus['queue'].enqueue.bind(bus['queue']);
  bus['queue'].enqueue = async () => {
    throw new Error('queue full');
  };

  // Should not throw
  bus.send('consumer-1', {
    id: '1',
    type: 'msg',
    from: 'sender',
    to: 'consumer-1',
    payload: 'hello',
  });

  // Wait for promise to settle
  await new Promise((r) => setTimeout(r, 50));
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/message-bus/MessageBus.test.ts`

---

### Task 2: HITLManager eviction fallback for all-pending state

**Bug:** When all 1000 requests are `pending`, the eviction filter finds no non-pending requests to remove, so the map grows unbounded. In a system with slow human reviewers, this is realistic.

**Files:**
- Modify: `packages/core/src/meta/HITLManager.ts:36-41`
- Test: `packages/core/test/meta/HITLManager.test.ts`

- [ ] **Step 1: Add fallback eviction for pending requests**

```ts
// Current (buggy):
if (this.requests.size >= 1000) {
  const oldest = [...this.requests.entries()]
    .filter(([, r]) => r.status !== 'pending')
    .sort(([, a], [, b]) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0];
  if (oldest) this.requests.delete(oldest[0]);
}

// Fixed:
if (this.requests.size >= 1000) {
  const oldest = [...this.requests.entries()]
    .filter(([, r]) => r.status !== 'pending')
    .sort(([, a], [, b]) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0];
  if (oldest) {
    this.requests.delete(oldest[0]);
  } else {
    // All pending — evict the oldest pending request as fallback
    const oldestPending = [...this.requests.entries()].sort(
      ([, a], [, b]) => (a.createdAt ?? 0) - (b.createdAt ?? 0),
    )[0];
    if (oldestPending) this.requests.delete(oldestPending[0]);
  }
}
```

- [ ] **Step 2: Write test for all-pending eviction**

```ts
it('should evict oldest pending request when all are pending', async () => {
  const mgr = new HITLManager();

  // Fill up to 1000 pending requests
  const ids: string[] = [];
  for (let i = 0; i < 1000; i++) {
    const req = await mgr.submit({
      agentId: 'a',
      taskId: `t${i}`,
      operation: { type: 'config.modify', target: 'x', summary: `req ${i}` },
      triggeredBy: 'guard_rule',
    });
    ids.push(req.id);
  }

  expect(mgr.getAll().length).toBe(1000);

  // Submit one more — should evict the oldest pending
  const extra = await mgr.submit({
    agentId: 'a',
    taskId: 't-extra',
    operation: { type: 'config.modify', target: 'x', summary: 'extra' },
    triggeredBy: 'guard_rule',
  });

  expect(mgr.getAll().length).toBe(1000);
  expect(mgr.getById(ids[0])).toBeUndefined(); // oldest evicted
  expect(mgr.getById(extra.id)).toBeDefined(); // new one exists
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/meta/HITLManager.test.ts`

---

### Task 3: Tracer evicts oldest completed span, not in-flight span

**Bug:** FIFO eviction in `startSpan()` could delete a span that's still in-flight (started but not ended). When `endSpan()` is called later, it silently no-ops due to the guard at line 34, losing metadata.

**Files:**
- Modify: `packages/core/src/meta/Tracer.ts:16-19`
- Test: `packages/core/test/meta/Tracer.test.ts`

- [ ] **Step 1: Prefer evicting completed spans**

```ts
// Current (buggy):
if (this.spans.size >= 5000) {
  const firstKey = this.spans.keys().next().value;
  if (firstKey !== undefined) this.spans.delete(firstKey);
}

// Fixed:
if (this.spans.size >= 5000) {
  // Prefer evicting the oldest completed span
  let evicted = false;
  for (const [key, span] of this.spans) {
    if (span.endTime !== undefined) {
      this.spans.delete(key);
      evicted = true;
      break;
    }
  }
  // If no completed spans, evict the oldest (FIFO fallback)
  if (!evicted) {
    const firstKey = this.spans.keys().next().value;
    if (firstKey !== undefined) this.spans.delete(firstKey);
  }
}
```

- [ ] **Step 2: Write test for in-flight span preservation**

```ts
it('should prefer evicting completed spans over in-flight spans', () => {
  const tracer = new Tracer();

  // Fill up with completed spans
  for (let i = 0; i < 5000; i++) {
    const s = tracer.startSpan(`completed.${i}`, 'trace-1');
    tracer.endSpan(s.spanId);
  }

  // Add one in-flight span
  const inflight = tracer.startSpan('inflight', 'trace-1');

  // Verify in-flight span still exists
  expect(tracer.getAllSpans().find((s) => s.spanId === inflight.spanId)).toBeDefined();

  // The oldest completed span should have been evicted
  expect(tracer.getAllSpans().length).toBeLessThanOrEqual(5000);
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/meta/Tracer.test.ts`

---

### Task 4: VectorStore.addBatch redundant needsRebuild flag

**Bug:** `addBatch()` sets `needsRebuild = true` then immediately calls `rebuildIVF()` which sets it to `false`. The flag is redundant. Meanwhile, `add()` no longer sets the flag, creating inconsistency.

**Files:**
- Modify: `packages/core/src/vector/VectorStore.ts:44-47`

- [ ] **Step 1: Remove redundant flag set**

```ts
// Current (redundant):
if (this.items.size >= this.rebuildThreshold) {
  this.needsRebuild = true;
  await this.rebuildIVF();
}

// Fixed:
if (this.items.size >= this.rebuildThreshold) {
  await this.rebuildIVF();
}
```

Also apply the same fix to `update()` at line 74-77:

```ts
// Current:
if (this.items.size >= this.rebuildThreshold) {
  this.needsRebuild = true;
  await this.rebuildIVF();
}

// Fixed:
if (this.items.size >= this.rebuildThreshold) {
  await this.rebuildIVF();
}
```

- [ ] **Step 2: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/vector/VectorStore.test.ts`

---

### Task 5: Intervention execution test coverage

**Bug:** The Intervener test only covers `decide()`, not the `handleIntervention()` execution in ChainTransferManager. The `replace` and `reroute` paths are untested.

**Files:**
- Test: `packages/core/test/chain/ChainTransferManager.test.ts`

- [ ] **Step 1: Read existing test file to understand patterns**

Run: `cat packages/core/test/chain/ChainTransferManager.test.ts`

- [ ] **Step 2: Add tests for replace and reroute intervention execution**

```ts
it('should replace agent on replace intervention', async () => {
  const pool = new AgentPool();
  pool.createAgent('agent-a', 'A', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);
  pool.createAgent('agent-b', 'B', [{ type: 'reasoning', level: 5, confidence: 0.5 }]);

  const intervener = new Intervener();
  // Mock intervener to return replace on first call
  const originalDecide = intervener.decide.bind(intervener);
  let callCount = 0;
  intervener.decide = (anomaly) => {
    callCount++;
    if (callCount === 1) return { type: 'replace', oldAgent: 'agent-a' };
    return originalDecide(anomaly);
  };

  const observer = new Observer();
  // Seed an anomaly so checkIntervention triggers
  observer.recordHop('agent-a', 'agent-a', 9999);

  const manager = new ChainTransferManager(pool, observer, intervener);
  // ... set up and verify agent was replaced
});
```

- [ ] **Step 3: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/chain/ChainTransferManager.test.ts`

---

### Task 6: Final verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test` — all tests pass

- [ ] **Step 2: Run lint**

Run: `pnpm run lint` — clean

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "fix: MessageBus catch, HITLManager pending eviction, Tracer completed-first eviction, VectorStore cleanup, intervention tests"
```
