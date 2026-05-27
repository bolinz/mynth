# Agent 富内容交互协议设计

> 通过可扩展的 View/Interaction 协议，让 Agent 能以表格、流程图、线框图等丰富形式展示内容并接收用户交互。

## Phase 1 范围

| 维度 | 范围 | 说明 |
|------|------|------|
| 生命周期 | 一次性 View | 发出去不再更新 |
| 布局 | 平铺列表 | views 从上到下顺序渲染 |
| 交互 | 单轮 | 一次 Interaction → 一次 InteractionResponse |
| 状态 | 无状态 | 刷新/重连后消失 |
| 组件 | 内置 + raw_html 逃生舱 | 标准组件库 + DOMPurify 严格消毒 |
| WASM | Phase 2 加入 | Phase 1 先用 JS |

## 后续 Phase

- Phase 2: View 持续更新 + 标签页布局 + 持久化 + WASM 安全层
- Phase 3: 多轮交互 + 多 Agent 合并 + 插件渲染器

## 设计目标

- 结构化 View 协议，不耦合具体渲染技术
- 可插拔渲染器注册系统，按类型扩展
- Web UI 全功能渲染，TUI 智能适配（简单 ASCII / 复杂开浏览器）
- Schema 校验 + Sanitizer 双层安全保障
- Prompt 自动注入机制，让 LLM 知道可用格式
- 与现有 EventBus + ReActLoop 架构兼容

## 核心数据模型

### AgentResponse

Agent 输出的新格式，替代纯字符串：

```typescript
interface AgentResponse {
  text: string
  views: View[]
  interaction?: Interaction
}
```

### View

富内容视图，type 开放、data 自定义：

```typescript
interface View {
  type: string
  title?: string
  data: Record<string, unknown>
}
```

### Interaction

Agent 发出的待用户处理请求：

```typescript
interface Interaction {
  id: string
  type: string
  prompt: string
  data: Record<string, unknown>
  agentId: string
  taskId: string
}
```

### InteractionResponse

用户操作后的回传数据：

```typescript
interface InteractionResponse {
  interactionId: string
  value: unknown
}
```

## 渲染器注册系统

```typescript
interface ViewRenderer {
  type: string
  description: string            // 注入 prompt 的描述文本
  schema: z.ZodType<any>          // data 的 Zod 校验
  sanitize?(data: unknown): unknown  // 可选的消毒函数
  renderTUI(view: View): string | { type: 'browser'; html: string }
  renderWeb(view: View): string
}
```

### 注册机制

```typescript
class RendererRegistry {
  register(renderer: ViewRenderer): void
  get(type: string): ViewRenderer | undefined
  getAll(): ViewRenderer[]

  // 生成 prompt 注入段
  buildPromptDescription(): string
}
```

### 内置渲染器

| type | schema | description |
|------|--------|-------------|
| `markdown` | `{ text: string }` | Markdown 文本 |
| `table` | `{ headers: string[], rows: string[][] }` | 表格 |
| `diff` | `{ file: string, hunks: Hunk[] }` | 代码 diff |
| `flowchart` | `{ nodes: Node[], edges: Edge[] }` | 流程图 |
| `chart` | `{ type: 'bar'\|'line'\|'pie', labels, datasets }` | 图表 |
| `wireframe` | `{ html: string }` | HTML 线框图（需 sanitize） |
| `compare` | `{ views: View[], labels: string[] }` | 多方案对比 |
| `cards` | `{ items: Card[] }` | 卡片列表 |

## 交互管理器

```typescript
class InteractionManager {
  pending: Map<string, Interaction>

  submit(interaction: Interaction): void
  respond(id: string, value: unknown): InteractionResponse | null
  getPending(agentId?: string): Interaction[]
  onResponse(handler: (response: InteractionResponse) => void): void
}
```

## Agent 集成

### ReActLoop 扩展

LLM 通过 PromptSchema 结构化输出返回 `AgentResponse` JSON。ReActLoop 检测到 `interaction` 非空时暂停执行，等待用户输入后再继续。

```typescript
// ReActLoop.execute 现在返回 AgentResponse
async execute(task: string, capability: string): Promise<AgentResponse>
```

### Prompt 注入

`PromptRegistry.buildPrompt()` 调用 `RendererRegistry.buildPromptDescription()` 将可用格式注入 system prompt。

## 渲染架构

```
Agent → AgentResponse
          ↓
EventBus: 'agent.response' topic
          ↓
    ┌─────┴─────┐
    │           │
  Web UI      TUI
    │           │
  Renderer    Renderer
  Registry    Registry
    │           │
  DOM 渲染    判断复杂度
              /        \
            简单       复杂(flowchart/wireframe)
            ASCII      启动本地 HTTP 服务
                        用户浏览器打开
```

### Web UI 渲染

- 所有 View 类型通过 `RendererRegistry.renderWeb()` 渲染
- DOM 注入到 `#views` 容器
- interative 元素绑定事件 → POST `/api/interaction` → InteractionManager

### TUI 渲染

- `RendererRegistry.renderTUI()` 返回：
  - `string`：直接显示在 TUI 面板
  - `{ type: 'browser', html: string }`：启动本地临时 HTTP 页面
- 复杂 View 在 TUI 面板显示提示："Press w to open in browser"

## HTML View 交互反馈机制

### data-action 声明式交互

LLM 生成的 HTML **不能包含自执行 JavaScript**。交互能力通过声明式的 `data-action` 属性实现，由框架注入的 helper 脚本统一处理。

LLM 生成的 HTML 示例：

```html
<div class="options">
  <h3>选择部署方案</h3>
  <button data-action="select:a">方案 A：微服务</button>
  <button data-action="select:b">方案 B：单体</button>
</div>
```

```html
<form data-action="submit">
  <label>项目名称：<input name="name" /></label>
  <label>节点数：<input name="nodes" type="number" /></label>
  <button type="submit">确认</button>
</form>
```

受支持的 `data-action` 值：

| data-action | 行为 | 回传 value |
|-------------|------|-----------|
| `select:<id>` | 单选一个选项 | `"<id>"` 字符串 |
| `submit` | 提交表单 | `{ [name]: value }` 对象 |
| `toggle:<id>` | 切换选中状态 | `["<id1>", "<id2>"]` 数组 |
| `confirm` | 确认操作 | `true` |
| `cancel` | 取消操作 | `false` |

### 渲染与安全流程

```
原始 HTML
  ↓
DOMPurify.sanitize()
  → 移除所有 <script> 标签
  → 移除所有 on* 事件属性 (onclick, onsubmit...)
  → 移除 javascript: URL
  → 移除 <object>, <embed>, <applet> 等危险标签
  → 白名单允许: div/span/button/form/input/table/tr/td/a/img/svg/p/h1-h6/ul/ol/li
  ↓
框架注入 helper.js
  → 遍历 DOM，查找 [data-action] 元素
  → 为 button 绑定 click 事件
  → 为 form 绑定 submit 事件
  → 点击时通过 postMessage({ action, value }) 通知父页面
  ↓
注入到 iframe:
  <iframe sandbox="allow-same-origin" srcdoc="..."></iframe>
  → sandbox 禁止脚本执行（helper 由父页面注入 postMessage 通信）
  → allow-same-origin 允许 postMessage 跨域通信
  ↓
父页面收到 postMessage
  → 匹配对应的 Interaction
  → InteractionManager.respond(interactionId, value)
  → MessageBus 路由回 Agent
  → Agent 恢复执行
```

### data-action 与 Interaction 的关联

当 Agent 输出一个 `interaction` + `wireframe` View 时：

```typescript
{
  text: "请选择部署方案",
  views: [{
    type: "wireframe",
    data: { html: "<button data-action='select:a'>方案A</button>..." }
  }],
  interaction: {
    id: "int_xxx",
    type: "select",
    prompt: "选择部署方案",
    data: { options: ["a", "b"] },
    agentId: "reasoner",
    taskId: "task_xxx"
  }
}
```

渲染器将 `interaction.id` 嵌入 iframe 页面中，helper 在 postMessage 时带上 `interactionId`，确保反馈路由到正确的目标。

### 安全机制总结

| 层 | 防护措施 |
|----|---------|
| Zod Schema | 验证 wireframe.data.html 是字符串 |
| DOMPurify | 移除恶意标签和属性 |
| iframe sandbox | 禁止任意脚本执行 |
| data-action 白名单 | 只有一个入口点（postMessage） |
| interactionId 绑定 | 反馈只能路由到匹配的 Interaction |

## 文件清单（Phase 1）

| 操作 | 文件 |
|------|------|
| Create | `packages/core/src/meta/ViewRenderer.ts` (RendererRegistry + View/Interaction 类型) |
| Create | `packages/core/src/meta/InteractionManager.ts` |
| Modify | `packages/core/src/message-bus/EventBus.ts` (新增 `agent.response` topic) |
| Create | `packages/core/src/renderers/` (内置渲染器: markdown/table/diff/flowchart/chart/cards) |
| Create | `packages/core/test/meta/ViewRenderer.test.ts` |
| Create | `packages/core/test/meta/InteractionManager.test.ts` |
| Modify | `packages/core/src/agent/ReActLoop.ts` (返回 AgentResponse) |
| Modify | `packages/core/src/prompt/PromptRegistry.ts` (注入 views 描述) |
| Modify | `packages/core/src/chain/ChainTransferManager.ts` (处理 AgentResponse) |
| Modify | `packages/core/src/engine/CoreEngine.ts` (wire RendererRegistry + InteractionManager) |
| Modify | `packages/cli/src/tui/index.ts` (View 渲染) |
| Modify | `packages/cli/src/web/server.ts` (View 渲染 + interaction API) |

## 实施顺序（Phase 1）

1. 核心协议类型 + RendererRegistry + InteractionManager（+ 测试）
2. EventBus `agent.response` topic
3. 内置渲染器（markdown/table/diff/flowchart/chart/cards + raw_html 逃生舱）
4. Agent 集成（ReActLoop 返回 AgentResponse）
5. Prompt 注入（RendererRegistry.buildPromptDescription）
6. TUI 渲染
7. Web UI 渲染（含 iframe sandbox + DOMPurify）
