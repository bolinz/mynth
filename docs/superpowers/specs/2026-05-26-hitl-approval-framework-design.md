# HITL 审批框架设计

> 为 mynth 系统添加 Human-in-the-Loop 审批能力，允许 Agent 执行高风险操作前暂停并请求用户审批。

## 设计目标

- 实现通用的审批请求/审批流程框架
- Guard 规则引擎扩展，支持硬编码审批规则
- 默认内存存储，可选 LevelDB 持久化
- TUI + Web UI 双端审批界面
- CLI 命令行审批支持

## 数据模型

```typescript
interface HITLRequest {
  id: string;
  agentId: string;
  taskId: string;
  operation: {
    type: string;       // 操作类型，如 "chain.transfer", "config.modify", "budget.override"
    target: string;     // 操作目标
    summary: string;    // 操作描述（展示给用户看）
  };
  triggeredBy: 'guard_rule' | 'agent_self_assess';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  decidedAt?: number;
  decidedBy?: string;
  note?: string;
}
```

## 组件设计

### HITLManager

`packages/core/src/meta/HITLManager.ts`

核心类，管理审批请求生命周期。

```
HITLManager
├── requests: Map<string, HITLRequest>    // 内存存储
├── persistence?: Persistence              // 可选 LevelDB 持久化
│
├── submit(request) → string               // 提交审批请求，返回 id
├── approve(id, by, note?) → boolean       // 批准
├── reject(id, by, note?) → boolean        // 拒绝
├── getPending() → HITLRequest[]          // 待审批列表
├── getById(id) → HITLRequest | null      // 查询单条
├── getAll() → HITLRequest[]              // 全部历史
├── getPendingCount() → number            // 待审批计数
│
└── loadFromPersistence()                  // 启动时恢复
```

### Guard 扩展

在 `Guard.ts` 中新增 `checkOperation()`：

```typescript
interface OperationCheck {
  allowed: boolean;
  needsApproval: boolean;
  reason?: string;
  request?: Omit<HITLRequest, 'id' | 'status' | 'createdAt'>;
}

checkOperation(agentId, operation): OperationCheck
```

初始硬编码规则：

| 规则 ID | 条件 | 行为 |
|---------|------|------|
| `budget-override` | budget.override 且非 admin | 需审批 |
| `chain-forbidden` | transfer 到 forbiddenAgent | 需审批 |
| `config-modify` | config.modify | 需审批 |
| `task-cancel-other` | 取消他人任务 | 需审批 |

Agent 自评接口（预留，暂不实现 Agent 侧的自评触发逻辑）。

### EventBus 扩展

新增事件 topic：

```typescript
EventTopic: 'hitl.requested' | 'hitl.resolved'

HITLRequestedEvent: { requestId, agentId, operation, createdAt }
HITLResolvedEvent:  { requestId, status, decidedBy }
```

### CLI 命令

```
mynth pending              # 列出待审批请求
mynth approve <id>         # 批准请求
mynth approve <id> -r      # 拒绝请求，可加备注
mynth approve <id> -n "理由"  # 带备注的拒绝
```

### TUI 扩展

- 状态栏右侧显示 `{yellow-fg}Pending: 3{/}` 计数
- `Tab` 键切换焦点到审批面板
- 审批面板显示请求列表，选中后按 `a` 批准 / `r` 拒绝 / `d` 查看详情

### Web UI 扩展

新增 API 端点：

```
GET  /pending-approvals → HITLRequest[]
POST /approve          → { id, action: 'approve'|'reject', note? }
```

SSE 事件新增：

```
event: hitl.requested
event: hitl.resolved
```

## 文件清单

| 操作 | 文件 |
|------|------|
| Create | `packages/core/src/meta/HITLManager.ts` |
| Create | `packages/core/test/meta/HITLManager.test.ts` |
| Modify | `packages/core/src/meta/Guard.ts` — 新增 `checkOperation()` |
| Modify | `packages/core/src/message-bus/EventBus.ts` — 新增事件 topic |
| Modify | `packages/core/src/engine/CoreEngine.ts` — wire HITLManager |
| Modify | `packages/core/src/index.ts` — 导出 HITLManager |
| Create | `packages/cli/src/commands/pending.ts` |
| Create | `packages/cli/src/commands/approve.ts` |
| Modify | `packages/cli/src/index.ts` — 注册命令 |
| Modify | `packages/cli/src/tui/index.ts` — 审批面板 |
| Modify | `packages/cli/src/web/server.ts` — 审批 API |

## 实施顺序

1. HITLManager + Guard 扩展（核心逻辑 + 测试）
2. EventBus 事件集成
3. CoreEngine wiring
4. CLI 命令
5. TUI 审批面板
6. Web UI API
