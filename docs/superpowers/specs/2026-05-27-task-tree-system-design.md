# 任务树系统设计

> Agent 任务的组织方式从平铺列表升级为树形结构，支持主线/子任务/紧急插入/偏离检测。

## 任务类型

| 类型 | 标识 | 特性 |
|------|------|------|
| Mission | `mission` | 全局唯一主线，树的根。创建新 Mission 时旧 Mission 自动归档 |
| Quest | `quest` | 次级任务，parent 指向 Mission 或上级 Quest |
| Task | `task` | 最小可执行单元，叶子节点 |
| Urgent | `urgent` | 紧急插入。独立森林根，完成后选择合并或丢弃 |
| SideQuest | `sidequest` | 偏离标记，等待用户确认归属 |
| *(开放 type，未来可扩展)* | | |

开放字符串 + 行为注册表（TaskTypeRegistry），未来新类型只需注册不修改核心模型。

## 生命周期

```
mission:    active → completed / failed / archived (新主线创建时自动归档)
quest/task: queued → running → (fork 子任务) → completed / failed / blocked
pushSubTask:   running → paused (父暂停)
popSubTask:    paused → running (父恢复)
urgent: 完成 → 用户选择 merge/discard
sidequest: pending_review → 确认 → 转为 task 挂到主线 / 拒绝 → 转为 urgent
```

## 进度条

零 token 成本方案：

| 节点 | 进度计算 |
|------|---------|
| Task (叶子) | `-1` 不显示 |
| Quest | `count(completed) / count(all) × 100` |
| Mission | 递归汇总子节点 |

Hop 完成后自动更新，EventBus 广播 `task.progress_changed`。

## 偏离检测

```
新任务 → 存在活跃 Mission？
  否 → 自动成为新的 Mission
  是 → Orchestrator.inferCapabilities() Jaccard 相似度
       ≥ 0.3 → 正常加入
       < 0.3 → 标记 sidequest，pending_review
```

## UI 呈现

### TUI

```
┌─ Task Tree ────────────────────────────────────────────┐
│  ◈ 构建 Web 应用 ▓▓▓▓▓░░ 3/8  [主线]  [●]              │
│  ├── ◆ 实现后端 ▓▓▓▓▓▓▓▓░░ 2/5  [活跃]                   │
│  │     ├── • 数据库连接    3 hops  [● running]  ←        │
│  │     └── • API 路由      [⏳ dep: 数据库连接]         │
│  └── ◆ 实现前端 ▓▓▓░░ 1/3                                │
│                                                           │
│  ─ ─ 紧急 ─ ─                                             │
│  ⚡ 修复 Bug    ▓▓▓▓▓▓ 2/4  [●]                          │
│                                                           │
│  ⚠ 优化查询    [偏离·待确认]  a:确认 d:忽略              │
│                                                           │
│  ↑↓ 选任务  Enter 详情  a/d 处理偏离                     │
└───────────────────────────────────────────────────────────┘
```

### Web

可折叠树 + 进度条 + 拖拽依赖 + 弹窗详情 + 面包屑路径。

## 文件清单

| 操作 | 文件 |
|------|------|
| Create | `packages/core/src/scheduler/TaskTreeManager.ts` |
| Create | `packages/core/src/scheduler/TaskTypeRegistry.ts` |
| Modify | `packages/sdk/src/types/task.ts` |
| Modify | `packages/core/src/message-bus/EventBus.ts` |
| Modify | `packages/core/src/scheduler/Scheduler.ts` |
| Modify | `packages/core/src/engine/CoreEngine.ts` |
| Modify | `packages/cli/src/tui/index.ts` |
| Modify | `packages/cli/src/web/server.ts` |
| Create | `packages/cli/src/web/tree.html` |
| Create | `packages/core/test/scheduler/TaskTreeManager.test.ts` |
