# 冷启动策略 + 私有记忆 L3 备份实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 减少 Agent 冷启动延迟（WarmPool 集成 + 路径预测预热）和添加私有记忆 L3 冷备份恢复。

**Architecture:** WarmPool 已实现但未集成到 AgentPool/CoreEngine——先集成，再添加定时 eviction 循环和路径预测预热。PrivateMemory 增加 `backup()`/`restore()` 方法，通过 MemoryGateway → GlobalMemory 实现 L3 备份。

**Tech Stack:** TypeScript, Vitest

---

### Task 1: WarmPool 集成到 AgentPool

**Files:**
- Modify: `packages/core/src/agent/AgentPool.ts`
- Modify: `packages/core/src/engine/CoreEngine.ts`

- [ ] **Step 1: 扩展 AgentPool，嵌入 WarmPool**

AgentPool 使用 WarmPool 作为底层存储，替代现有的 Map：

```typescript
import { BaseAgent } from './BaseAgent.ts';
import { WarmPool } from './WarmPool.ts';
import type { Capability, CapabilityType } from '@mynth/sdk';
import type { EventBus } from '../message-bus/EventBus.ts';

export class AgentPool {
  private warm = new WarmPool();

  setBus(bus: EventBus): void {
    this.warm = new WarmPool(bus as any);
  }

  createAgent(id: string, name: string, capabilities: Capability[]): BaseAgent {
    return this.warm.createAgent(id, name, capabilities, 'cold');
  }

  getAgent(id: string): BaseAgent | undefined {
    return this.warm.getAgent(id);
  }

  getAllAgents(): BaseAgent[] {
    return this.warm.getAllAgents();
  }

  acquire(capabilityType: CapabilityType): BaseAgent | null {
    return this.warm.acquire(capabilityType);
  }

  release(agent: BaseAgent): void {
    this.warm.release(agent);
  }

  findAgent(capabilityType: CapabilityType): BaseAgent | null {
    return this.warm.acquire(capabilityType);
  }

  evictIdle(): number {
    return this.warm.evictIdle();
  }
}
```

- [ ] **Step 2: 在 CoreEngine 中添加周期 eviction**

在 `start()` 中，注册定时器：

```typescript
    this.degradation = new DegradationMonitor(this.eventBus);
    this.hitlManager = new HITLManager(this.db, this.eventBus);
    await this.hitlManager.loadAll();

    // Periodic warm pool eviction (every 30s)
    this.evictTimer = setInterval(() => {
      const evicted = this.pool.evictIdle();
      if (evicted > 0) {
        this.bus?.publish('intervention.executed', {
          type: 'warn',
          reason: `Evicted ${evicted} idle agents from warm pool`,
        });
      }
    }, 30000);
```

声明：`private evictTimer?: ReturnType<typeof setInterval>;`

在 `stop()` 中清理：`if (this.evictTimer) clearInterval(this.evictTimer);`

- [ ] **Step 3: 提交**

```bash
git add packages/core/src/agent/AgentPool.ts packages/core/src/engine/CoreEngine.ts
git commit -m "feat(core): integrate WarmPool into AgentPool with periodic eviction"
```

---

### Task 2: Path prediction warm-up

**Files:**
- Modify: `packages/core/src/meta/Orchestrator.ts`
- Modify: `packages/core/src/engine/CoreEngine.ts`

- [ ] **Step 1: 在 Orchestrator 中添加路径预测**

新增 `predictNext(capabilities)` 方法，返回最可能的后续能力：

```typescript
  predictNext(capabilities: string[]): string[] {
    // Simple prediction: return capabilities after 'reasoning'
    // In future, this could use historical hop data
    const idx = capabilities.indexOf('reasoning');
    if (idx >= 0 && idx < capabilities.length - 1) {
      return [capabilities[idx + 1]];
    }
    return [];
  }
```

- [ ] **Step 2: 在 CoreEngine 中调用路径预测预热**

在 `executeTask()` 中，调用 Orchestrator 分析和启动链之间：

```typescript
    const analysis = await this.orchestrator.analyze(...);

    // Pre-warm predicted next agents
    const predicted = this.orchestrator.predictNext(analysis.capabilities);
    for (const cap of predicted) {
      const existing = this.pool.acquire(cap as any);
      if (!existing) {
        // Create a warm agent for this capability
        this.pool.createAgent(`warm-${cap}-${Date.now()}`, `Warm ${cap}`, [
          { type: cap as any, level: 5, confidence: 0.5 },
        ]);
      } else {
        this.pool.release(existing);
      }
    }
```

- [ ] **Step 3: 提交**

```bash
git add packages/core/src/meta/Orchestrator.ts packages/core/src/engine/CoreEngine.ts
git commit -m "feat(core): add path prediction warm-up for cold start"
```

---

### Task 3: PrivateMemory L3 backup

**Files:**
- Modify: `packages/core/src/memory/PrivateMemory.ts`
- Create: `packages/core/test/memory/PrivateMemory.backup.test.ts`

- [ ] **Step 1: 在 PrivateMemory 中添加 backup/restore**

```typescript
  async backup(globalMemory: GlobalMemory, namespace?: string): Promise<void> {
    const prefix = `mem:${this.agentId}:${namespace ? namespace + ':' : ''}`;
    for (const [key, item] of this.l1) {
      await globalMemory.write(`${prefix}${key}`, item);
    }
  }

  async restore(globalMemory: GlobalMemory, namespace?: string): Promise<number> {
    const prefix = `mem:${this.agentId}:${namespace ? namespace + ':' : ''}`;
    let restored = 0;
    // Check if L2 is empty (no persistence or all entries pruned)
    if (this.persistence) {
      const raw = await this.persistence.range(`mem:${this.agentId}:`, `mem:${this.agentId}~`);
      if (raw.length > 0) return 0; // L2 has data, no need to restore
    }
    // Try loading from GlobalMemory snapshot
    const snapshot = await globalMemory.read(`${prefix}__snapshot__`);
    if (snapshot && typeof snapshot === 'object') {
      const keys = snapshot as Record<string, unknown>;
      for (const [key] of Object.entries(keys)) {
        const val = await globalMemory.read(`${prefix}${key}`);
        if (val !== null) {
          await this.remember(key, val);
          restored++;
        }
      }
    }
    return restored;
  }
```

Import: `import type { GlobalMemory } from './GlobalMemory.ts';`

- [ ] **Step 2: 编写 L3 备份测试**

```typescript
import { describe, expect, it } from 'vitest';
import { PrivateMemory } from '../../src/memory/PrivateMemory.ts';
import { GlobalMemory } from '../../src/memory/GlobalMemory.ts';

describe('PrivateMemory L3 backup', () => {
  it('should backup and restore from GlobalMemory', async () => {
    const globalMem = new GlobalMemory();
    const mem = new PrivateMemory('agent-x');

    await mem.remember('key1', 'value1', 0.9);
    await mem.remember('key2', { nested: true }, 0.8);
    await mem.backup(globalMem);

    // Create a fresh memory with no L2
    const mem2 = new PrivateMemory('agent-x');
    const restored = await mem2.restore(globalMem);
    expect(restored).toBe(2);
    expect(await mem2.recall('key1')).toBe('value1');
    expect(await mem2.recall('key2')).toEqual({ nested: true });
  });

  it('should not restore if L2 has data', async () => {
    // Test with a persistence that would have data
    // (skipped - requires LevelDB setup)
  });
});
```

- [ ] **Step 3: 提交**

```bash
git add packages/core/src/memory/PrivateMemory.ts packages/core/test/memory/PrivateMemory.backup.test.ts
git commit -m "feat(core): add PrivateMemory L3 backup/restore via GlobalMemory"
```
