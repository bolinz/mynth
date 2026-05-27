# Agent 富内容交互协议实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Agent 能以表格/流程图/线框图等丰富形式展示内容，用户能交互反馈。

**Architecture:** ViewRenderer 注册系统 + InteractionManager 管理交互生命周期，EventBus 广播 AgentResponse，TUI/Web 各自渲染。

**Tech Stack:** TypeScript, Vitest, DOMPurify, neo-blessed

---

### Task 1: 核心协议 + RendererRegistry + InteractionManager

**Files:**
- Create: `packages/core/src/meta/ViewRenderer.ts`
- Create: `packages/core/src/meta/InteractionManager.ts`
- Create: `packages/core/test/meta/ViewRenderer.test.ts`
- Create: `packages/core/test/meta/InteractionManager.test.ts`
- Modify: `packages/core/src/meta/index.ts`

- [ ] **Create ViewRenderer.ts:**

```typescript
import type { z } from 'zod';

// --- Types ---

export interface View {
  type: string;
  title?: string;
  data: Record<string, unknown>;
}

export interface Interaction {
  id: string;
  type: string;
  prompt: string;
  data: Record<string, unknown>;
  agentId: string;
  taskId: string;
  createdAt: number;
}

export interface InteractionResponse {
  interactionId: string;
  value: unknown;
}

// --- Renderer ---

export interface ViewRenderer {
  type: string;
  description: string;
  schema: z.ZodType<any>;
  sanitize?(data: unknown): unknown;
  renderTUI(view: View): string | { type: 'browser'; html: string };
  renderWeb(view: View): string;
}

export class RendererRegistry {
  private renderers = new Map<string, ViewRenderer>();

  register(renderer: ViewRenderer): void {
    this.renderers.set(renderer.type, renderer);
  }

  get(type: string): ViewRenderer | undefined {
    return this.renderers.get(type);
  }

  getAll(): ViewRenderer[] {
    return Array.from(this.renderers.values());
  }

  buildPromptDescription(): string {
    const lines = this.getAll().map(
      (r) => `- "${r.type}": ${r.description}`,
    );
    return `Available view types:\n${lines.join('\n')}`;
  }
}
```

- [ ] **Create InteractionManager.ts:**

```typescript
import type { Interaction, InteractionResponse } from './ViewRenderer.ts';

export class InteractionManager {
  private pending = new Map<string, Interaction>();
  private handlers: Array<(response: InteractionResponse) => void> = [];

  submit(interaction: Interaction): void {
    this.pending.set(interaction.id, interaction);
  }

  respond(id: string, value: unknown): InteractionResponse | null {
    const interaction = this.pending.get(id);
    if (!interaction) return null;
    this.pending.delete(id);
    const response: InteractionResponse = { interactionId: id, value };
    for (const handler of this.handlers) {
      handler(response);
    }
    return response;
  }

  getPending(agentId?: string): Interaction[] {
    const all = Array.from(this.pending.values());
    return agentId ? all.filter((i) => i.agentId === agentId) : all;
  }

  getPendingCount(): number {
    return this.pending.size;
  }

  onResponse(handler: (response: InteractionResponse) => void): void {
    this.handlers.push(handler);
  }
}
```

- [ ] **Export in meta/index.ts:**

```typescript
export { RendererRegistry } from './ViewRenderer.ts';
export type { View, ViewRenderer, Interaction, InteractionResponse } from './ViewRenderer.ts';
export { InteractionManager } from './InteractionManager.ts';
```

- [ ] **Create tests and commit.**

---

### Task 2: EventBus topic + CoreEngine wiring

- Modify `EventBus.ts`: add `agent.response` topic
- Modify `CoreEngine.ts`: wire RendererRegistry + InteractionManager

---

### Task 3: 内置渲染器

- Create `packages/core/src/renderers/` with: markdown, table, diff, flowchart, chart, cards, raw_html
- Create `packages/core/src/renderers/index.ts`
- Register all in CoreEngine startup

---

### Task 4: Agent 集成 (ReActLoop + ChainTransferManager)

- Modify `ReActLoop.ts`: return `AgentResponse` (text + views[] + interaction?)
- Modify `ChainTransferManager.ts`: broadcast `agent.response` via EventBus
- Wire InteractionManager.onResponse to resume agent

---

### Task 5: Prompt 注入

- Modify `PromptRegistry.ts`: call `RendererRegistry.buildPromptDescription()` in buildPrompt
- Inject available view types into system prompt

---

### Task 6: TUI 渲染

- Modify `tui/index.ts`: subscribe `agent.response`, render views in chain panel
- Simple views → ASCII, complex → "Press w for browser"
- Add `/views` REPL command

---

### Task 7: Web UI 渲染

- Modify `web/server.ts`: SSE for `agent.response`, `/api/views` endpoint, interaction POST
- Add iframe sandbox + DOMPurify for raw_html
- Add client-side JS: render views, handle data-action interactions
