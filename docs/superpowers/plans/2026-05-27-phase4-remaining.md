# Phase 4 剩余功能实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 实现路线图中剩余的 5 个 Phase 4 特性：死锁检测、配置版本管理、能力收敛、限流背压、消息回溯 WAL。

**Architecture:** 各功能独立实现，按复杂度从小到大依次实施。每个功能都是自包含的子系统扩展。

**Tech Stack:** TypeScript, Vitest

---

### Task 1: 死锁检测 (Deadlock Detection)

**问题：** 多个 Agent 在协商或共识阶段可能互相等待形成死锁。当前系统为链式传递，Agent 不持有资源，但需要在 `Observer` 中增加等待图检测。

**Files:**
- Modify: `packages/core/src/meta/Observer.ts`
- Create: `packages/core/test/meta/DeadlockDetection.test.ts`

- [ ] **在 Observer 中添加等待图检测**

在 Observer 中添加 `deadlockDetection` 方法：

```typescript
  // Agent 发送等待信号时调用
  recordWait(agentId: string, waitingFor: string): void {
    if (!this.waitGraph.has(agentId)) {
      this.waitGraph.set(agentId, new Set());
    }
    this.waitGraph.get(agentId)!.add(waitingFor);
  }

  // Agent 解除等待时调用
  resolveWait(agentId: string): void {
    this.waitGraph.delete(agentId);
  }

  // 检测死锁（DFS 环检测）
  detectDeadlock(): Anomaly[] {
    const anomalies: Anomaly[] = [];
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string): boolean => {
      if (recursionStack.has(node)) return true;
      if (visited.has(node)) return false;
      visited.add(node);
      recursionStack.add(node);

      const waitSet = this.waitGraph.get(node);
      if (waitSet) {
        for (const waitingFor of waitSet) {
          if (dfs(waitingFor)) return true;
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const node of this.waitGraph.keys()) {
      if (!visited.has(node)) {
        if (dfs(node)) {
          anomalies.push({
            type: 'deadlock_detected',
            agentId: node,
            details: { waitGraph: Array.from(this.waitGraph.entries()).map(([k, v]) => ({ from: k, waitingFor: Array.from(v) })) },
          });
        }
      }
    }

    return anomalies;
  }
```

Add field: `private waitGraph = new Map<string, Set<string>>();`

- [ ] **创建测试并提交**

```bash
git add packages/core/src/meta/Observer.ts packages/core/test/meta/DeadlockDetection.test.ts
git commit -m "feat(core): add deadlock detection with wait graph"
```

---

### Task 2: 配置版本管理 (Config Version Management)

**问题：** 配置修改后无法回滚。需要 ConfigSnapshot 机制。

**Files:**
- Modify: `packages/core/src/config/ConfigManager.ts`
- Create: `packages/core/test/config/ConfigVersion.test.ts`

- [ ] **添加配置快照功能**

```typescript
import type { Persistence } from '../persistence/Persistence.ts';

export interface ConfigSnapshot {
  id: string;
  timestamp: number;
  config: Record<string, unknown>;
  label?: string;
}

export class ConfigManager {
  private snapshots: ConfigSnapshot[] = [];
  private persistence?: Persistence;

  constructor(persistence?: Persistence) {
    this.persistence = persistence;
  }

  async saveSnapshot(config: Record<string, unknown>, label?: string): Promise<ConfigSnapshot> {
    const snapshot: ConfigSnapshot = {
      id: `cfg_${Date.now()}`,
      timestamp: Date.now(),
      config,
      label,
    };
    this.snapshots.push(snapshot);
    if (this.persistence) {
      await this.persistence.put(`config:snapshot:${snapshot.id}`, snapshot);
    }
    return snapshot;
  }

  getSnapshot(id: string): ConfigSnapshot | undefined {
    return this.snapshots.find((s) => s.id === id);
  }

  listSnapshots(): ConfigSnapshot[] {
    return [...this.snapshots].sort((a, b) => b.timestamp - a.timestamp);
  }

  async loadFromPersistence(): Promise<void> {
    if (!this.persistence) return;
    const raw = await this.persistence.range('config:snapshot:', 'config:snapshot~');
    for (const [, value] of raw) {
      this.snapshots.push(value as ConfigSnapshot);
    }
  }
}
```

- [ ] **创建测试并提交**

```bash
git add packages/core/src/config/ConfigManager.ts packages/core/test/config/ConfigVersion.test.ts
git commit -m "feat(core): add config snapshot and rollback support"
```

---

### Task 3: 能力收敛 (Capability Convergence)

**问题：** `CapabilityRouter.learn()` 可能因单次执行结果频繁切换 primary/fallback，导致震荡。

**Files:**
- Modify: `packages/core/src/llm/CapabilityRouter.ts`
- Modify: `packages/core/test/llm/CapabilityRouter.test.ts`

- [ ] **添加滑动窗口收敛机制**

在 CapabilityRouter 中添加 `ConvergenceConfig`：

```typescript
export interface ConvergenceConfig {
  windowSize: number;          // 滑动窗口大小，默认 10
  confidenceThreshold: number; // 切换阈值，默认 0.5
  minSamples: number;          // 最少样本数，默认 10
  cooldownMs: number;          // 切换冷却期 ms，默认 60000
}
```

修改 `learn()` 实现滑动窗口：

```typescript
  private convergence: ConvergenceConfig = {
    windowSize: 10,
    confidenceThreshold: 0.5,
    minSamples: 10,
    cooldownMs: 60000,
  };
  private lastSwapTime = new Map<string, number>();
  private recentResults = new Map<string, boolean[]>(); // 滑动窗口

  setConvergence(config: Partial<ConvergenceConfig>): void {
    Object.assign(this.convergence, config);
  }

  learn(capabilityType: string, success: boolean): void {
    const key = capabilityType;
    const recent = this.recentResults.get(key) ?? [];
    recent.push(success);
    if (recent.length > this.convergence.windowSize) recent.shift();
    this.recentResults.set(key, recent);

    // Only evaluate when min samples reached
    if (recent.length < this.convergence.minSamples) return;

    const successes = recent.filter(Boolean).length;
    const rate = successes / recent.length;

    const entry = this.history.get(key) ?? { successes: 0, failures: 0 };
    if (success) entry.successes++;
    else entry.failures++;
    this.history.set(key, entry);

    // Cool-down check
    const lastSwap = this.lastSwapTime.get(key) ?? 0;
    if (Date.now() - lastSwap < this.convergence.cooldownMs) return;

    // Swap if rate below threshold
    if (rate < this.convergence.confidenceThreshold) {
      const rule = this.routes.find((r) => r.type === capabilityType);
      if (rule) {
        const { primary, fallback } = rule;
        rule.primary = fallback;
        rule.fallback = primary;
        this.lastSwapTime.set(key, Date.now());
      }
    }
  }
```

- [ ] **创建测试并提交**

```bash
git add packages/core/src/llm/CapabilityRouter.ts packages/core/test/llm/CapabilityRouter.test.ts
git commit -m "feat(core): add sliding window convergence to CapabilityRouter"
```

---

### Task 4: 限流背压 (Backpressure)

**问题：** 上游 Agent 可能打爆下游消息队列。当前 MemoryQueue 无背压机制。

**Files:**
- Modify: `packages/core/src/message-bus/MemoryQueue.ts`
- Create: `packages/core/test/message-bus/Backpressure.test.ts`

- [ ] **添加背压控制**

在 MemoryQueue 中添加水位检测和背压信号：

```typescript
export interface BackpressureStatus {
  severity: 'mild' | 'critical' | 'normal';
  queueDepth: number;
  maxCapacity: number;
  suggestedDelayMs: number;
}

export class MemoryQueue {
  private queues = new Map<string, QueueMessage[]>();
  private consumers = new Map<string, MessageHandler>();
  private maxQueueSize = 100;
  private mildThreshold = 0.6;  // 60% → mild
  private criticalThreshold = 0.8; // 80% → critical

  setCapacity(maxSize: number): void {
    this.maxQueueSize = maxSize;
  }

  async enqueue(message: QueueMessage): Promise<BackpressureStatus | null> {
    const q = this.queues.get(message.to) || [];
    const depth = q.length;

    if (depth >= this.maxQueueSize) {
      return {
        severity: 'critical',
        queueDepth: depth,
        maxCapacity: this.maxQueueSize,
        suggestedDelayMs: 1000,
      };
    }

    q.push(message);
    this.queues.set(message.to, q);

    const handler = this.consumers.get(message.to);
    if (handler) handler(message);

    // Return backpressure signal if needed
    const ratio = (q.length / this.maxQueueSize);
    if (ratio >= this.criticalThreshold) {
      return {
        severity: 'critical',
        queueDepth: q.length,
        maxCapacity: this.maxQueueSize,
        suggestedDelayMs: 500,
      };
    }
    if (ratio >= this.mildThreshold) {
      return {
        severity: 'mild',
        queueDepth: q.length,
        maxCapacity: this.maxQueueSize,
        suggestedDelayMs: 100,
      };
    }

    return null;
  }
```

- [ ] **创建测试并提交**

```bash
git add packages/core/src/message-bus/MemoryQueue.ts packages/core/test/message-bus/Backpressure.test.ts
git commit -m "feat(core): add backpressure control to MemoryQueue"
```

---

### Task 5: 消息回溯 WAL (Write-Ahead Log)

**问题：** Memory Gateway 崩溃后，内存传输中的消息丢失。需要 WAL 保证 at-least-once。

**Files:**
- Modify: `packages/core/src/memory/MemoryGateway.ts`
- Create: `packages/core/test/memory/WAL.test.ts`

- [ ] **添加 WAL 支持**

```typescript
import type { Persistence } from '../persistence/Persistence.ts';

export class MemoryGateway {
  private contributions: Contribution[] = [];
  private contributionCounts = new Map<string, number>();
  private persistence?: Persistence;
  private walBuffer: Contribution[] = [];
  private walTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private memory: GlobalMemory, persistence?: Persistence) {
    this.persistence = persistence;
  }

  private async walAppend(contribution: Contribution): Promise<void> {
    this.walBuffer.push(contribution);
    // Batch flush every 50ms
    if (!this.walTimer) {
      this.walTimer = setTimeout(() => this.walFlush(), 50);
    }
  }

  private async walFlush(): Promise<void> {
    this.walTimer = null;
    if (this.walBuffer.length === 0 || !this.persistence) return;
    const batch = [...this.walBuffer];
    this.walBuffer = [];
    const timestamp = Date.now();
    await this.persistence.put(`wal:${timestamp}`, batch);
  }

  async recover(): Promise<number> {
    if (!this.persistence) return 0;
    let recovered = 0;
    const raw = await this.persistence.range('wal:', 'wal~');
    for (const [key, value] of raw) {
      const batch = value as Contribution[];
      for (const c of batch) {
        await this.memory.write(c.key, c.value);
        recovered++;
      }
      await this.persistence.delete(key);
    }
    return recovered;
  }

  async writeContribution(...): Promise<...> {
    // existing code...
    await this.walAppend(contribution);
    // existing code...
  }
}
```

- [ ] **创建测试并提交**

```bash
git add packages/core/src/memory/MemoryGateway.ts packages/core/test/memory/WAL.test.ts
git commit -m "feat(core): add WAL with batch flush and recovery to MemoryGateway"
```
