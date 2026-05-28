# 任务树系统实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement plan task-by-task.

**Goal:** 将 mynth 的任务系统从平铺列表升级为树形结构，支持主线/子任务/紧急插入/偏离检测。

**Architecture:** TaskTreeManager 管理树结构，Scheduler 集成，TUI/Web 渲染树形面板。

---

### Task 1: 核心类型 + 注册表 + EventBus

- Create `packages/core/src/scheduler/TaskTypeRegistry.ts`：TaskTypeBehavior 接口 + 注册 + 内置 5 种类型
- Modify `packages/sdk/src/types/task.ts`：Task 扩展字段（parentId, childIds, dependsOn, progress, type, contextSnapshot, tags, metadata, rootMissionId, isInterrupt）+ TaskStatus 新增 pending_review/paused/blocked
- Modify `packages/core/src/message-bus/EventBus.ts`：新增 task.forked, task.interrupted, task.resumed, task.deviation_detected, task.progress_changed 事件
- Create `packages/core/test/scheduler/TaskTypeRegistry.test.ts`

### Task 2: TaskTreeManager

- Create `packages/core/src/scheduler/TaskTreeManager.ts`
- 方法：submitTask, pushSubTask, popSubTask, forkTasks, setDependency, checkDependencies, interrupt, resume, getTree, getContextStack, updateProgress, detectDeviation
- 进度：叶子 -1，中间节点递归子 completed/总数
- Create `packages/core/test/scheduler/TaskTreeManager.test.ts`

### Task 3: Scheduler 集成 + CoreEngine

- Modify `packages/core/src/scheduler/Scheduler.ts`：集成 tree 模块，新增 tree/getTree/getContextStack/getProgress
- Modify `packages/core/src/engine/CoreEngine.ts`：wiring + ChainTransferManager hop 完成后调用 updateProgress
- Modify `packages/core/src/chain/ChainTransferManager.ts`：hop 结束时更新进度

### Task 4: TUI 树面板

- Modify `packages/cli/src/tui/index.ts`：新增树面板 + Tab 切换 + 键盘操作

### Task 5: Web UI 树形看板

- Modify `packages/cli/src/web/server.ts`：/api/tree + /api/tree/move + SSE
- Create `packages/cli/src/web/tree.html`：可折叠树 + 进度条 + 偏离提示
