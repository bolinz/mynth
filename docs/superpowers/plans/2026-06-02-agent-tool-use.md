# Agent Tool Use Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Enable agents to call external tools (web search, file read/write, API calls, code execution) through ReActLoop, with HITL approval for high-risk operations.

**Architecture:** ToolRegistry manages tools with a unified Tool interface. ReActLoop is enhanced to parse and execute tool calls. High-risk tools require HITLManager approval before execution.

**Tech Stack:** TypeScript, Vitest, `node:vm` for code sandbox

---

### Task 1: SDK Tool Types

**Files:**
- Create: `packages/sdk/src/types/tool.ts`

- [ ] **Step 1: Create tool.ts with shared types**

```ts
export type RiskLevel = 'low' | 'medium' | 'high';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  riskLevel: RiskLevel;
}
```

- [ ] **Step 2: Export from SDK index**

Check `packages/sdk/src/index.ts` and add `export * from './types/tool.ts'`.

- [ ] **Step 3: Run existing tests to verify no breakage**

Run: `pnpm test` — all existing tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/
git commit -m "feat(sdk): add ToolDefinition and ToolParameter types"
```

---

### Task 2: Tool Interface + ToolRegistry

**Files:**
- Create: `packages/core/src/tool/Tool.ts`
- Create: `packages/core/src/tool/ToolRegistry.ts`
- Create: `packages/core/test/tool/ToolRegistry.test.ts`

- [ ] **Step 1: Create Tool.ts**

```ts
import type { ToolDefinition } from '@mynth/sdk';

export interface ToolContext {
  agentId: string;
  taskId: string;
  allowedPaths?: string[];
  allowedHosts?: string[];
}

export interface ToolResult {
  success: boolean;
  data: unknown;
  error?: string;
  mimeType?: string;
}

export interface Tool {
  readonly definition: ToolDefinition;
  execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult>;
}
```

- [ ] **Step 2: Create ToolRegistry.ts**

```ts
import type { ToolDefinition } from '@mynth/sdk';
import type { Tool, ToolContext, ToolResult } from './Tool.ts';
import type { HITLManager } from '../meta/HITLManager.ts';

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  constructor(private hitlManager?: HITLManager) {}

  register(tool: Tool): void {
    this.tools.set(tool.definition.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => t.definition);
  }

  listByRisk(level: string): ToolDefinition[] {
    return this.list().filter((d) => d.riskLevel === level);
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool not found: ${name}` };
    }

    if (tool.definition.riskLevel === 'high' && this.hitlManager) {
      const req = await this.hitlManager.submit({
        agentId: ctx.agentId,
        taskId: ctx.taskId,
        operation: {
          type: `tool.${name}`,
          target: JSON.stringify(args),
          summary: `Agent ${ctx.agentId} wants to use ${name}`,
        },
        triggeredBy: 'guard_rule',
      });

      if (req.status === 'pending') {
        return { success: false, error: `HITL approval required for ${name}. Request ID: ${req.id}. Use 'mynth approve ${req.id}' to proceed.` };
      }
    }

    try {
      return await tool.execute(args, ctx);
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
```

- [ ] **Step 3: Write ToolRegistry test**

```ts
import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../../src/tool/ToolRegistry.ts';
import type { Tool, ToolContext, ToolResult } from '../../src/tool/Tool.ts';

describe('ToolRegistry', () => {
  it('should register and retrieve a tool', () => {
    const registry = new ToolRegistry();
    const tool: Tool = {
      definition: { name: 'echo', description: 'Echo input', parameters: [], riskLevel: 'low' },
      async execute(args, ctx) {
        return { success: true, data: args };
      },
    };
    registry.register(tool);
    expect(registry.get('echo')).toBe(tool);
    expect(registry.list()).toHaveLength(1);
  });

  it('should return error for unknown tool', async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute('unknown', {}, { agentId: 'a', taskId: 't1' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('should execute a low-risk tool', async () => {
    const registry = new ToolRegistry();
    registry.register({
      definition: { name: 'greet', description: 'Greet', parameters: [], riskLevel: 'low' },
      async execute(args) {
        return { success: true, data: 'hello' };
      },
    });
    const result = await registry.execute('greet', {}, { agentId: 'a', taskId: 't1' });
    expect(result.success).toBe(true);
    expect(result.data).toBe('hello');
  });

  it('should list tools by risk level', () => {
    const registry = new ToolRegistry();
    registry.register({
      definition: { name: 'a', description: '', parameters: [], riskLevel: 'low' },
      async execute() { return { success: true, data: null }; },
    });
    registry.register({
      definition: { name: 'b', description: '', parameters: [], riskLevel: 'high' },
      async execute() { return { success: true, data: null }; },
    });
    expect(registry.listByRisk('low')).toHaveLength(1);
    expect(registry.listByRisk('high')).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/tool/ToolRegistry.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tool/ packages/core/test/tool/
git commit -m "feat(core): add Tool interface and ToolRegistry"
```

---

### Task 3: Built-in Tools

**Files:**
- Create: `packages/core/src/tools/WebSearchTool.ts`
- Create: `packages/core/src/tools/FileReadTool.ts`
- Create: `packages/core/src/tools/FileWriteTool.ts`
- Create: `packages/core/src/tools/ApiCallTool.ts`
- Create: `packages/core/src/tools/CodeExecuteTool.ts`
- Create: `packages/core/test/tools/Tools.test.ts`

- [ ] **Step 1: Create WebSearchTool.ts**

```ts
import type { Tool, ToolContext, ToolResult } from '../tool/Tool.ts';

export class WebSearchTool implements Tool {
  readonly definition = {
    name: 'web_search',
    description: 'Search the web and fetch page content',
    parameters: [
      { name: 'query', type: 'string' as const, description: 'Search query', required: true },
    ],
    riskLevel: 'low' as const,
  };

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const query = String(args.query ?? '');
    if (!query) return { success: false, error: 'query is required' };
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const html = await res.text();
      const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 3000);
      return { success: true, data: text, mimeType: 'text/plain' };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
```

- [ ] **Step 2: Create FileReadTool.ts**

```ts
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import type { Tool, ToolContext, ToolResult } from '../tool/Tool.ts';

export class FileReadTool implements Tool {
  readonly definition = {
    name: 'file_read',
    description: 'Read a file from the filesystem',
    parameters: [
      { name: 'path', type: 'string' as const, description: 'File path to read', required: true },
    ],
    riskLevel: 'low' as const,
  };

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = String(args.path ?? '');
    if (!filePath) return { success: false, error: 'path is required' };

    const resolved = resolve(filePath);
    if (ctx.allowedPaths && !ctx.allowedPaths.some((p) => resolved.startsWith(resolve(p)))) {
      return { success: false, error: `Access denied: ${filePath} is not in allowed paths` };
    }

    try {
      const content = await readFile(resolved, 'utf-8');
      return { success: true, data: content, mimeType: 'text/plain' };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
```

- [ ] **Step 3: Create FileWriteTool.ts**

```ts
import { writeFile } from 'fs/promises';
import { resolve } from 'path';
import type { Tool, ToolContext, ToolResult } from '../tool/Tool.ts';

export class FileWriteTool implements Tool {
  readonly definition = {
    name: 'file_write',
    description: 'Write content to a file',
    parameters: [
      { name: 'path', type: 'string' as const, description: 'File path', required: true },
      { name: 'content', type: 'string' as const, description: 'Content to write', required: true },
    ],
    riskLevel: 'high' as const,
  };

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const filePath = String(args.path ?? '');
    const content = String(args.content ?? '');
    if (!filePath) return { success: false, error: 'path is required' };

    const resolved = resolve(filePath);
    if (ctx.allowedPaths && !ctx.allowedPaths.some((p) => resolved.startsWith(resolve(p)))) {
      return { success: false, error: `Access denied: ${filePath} is not in allowed paths` };
    }

    try {
      await writeFile(resolved, content, 'utf-8');
      return { success: true, data: `Written ${content.length} bytes to ${filePath}` };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
```

- [ ] **Step 4: Create ApiCallTool.ts**

```ts
import type { Tool, ToolContext, ToolResult } from '../tool/Tool.ts';

export class ApiCallTool implements Tool {
  readonly definition = {
    name: 'api_call',
    description: 'Make an HTTP GET request to an API endpoint',
    parameters: [
      { name: 'url', type: 'string' as const, description: 'URL to call', required: true },
    ],
    riskLevel: 'medium' as const,
  };

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const url = String(args.url ?? '');
    if (!url) return { success: false, error: 'url is required' };

    try {
      const parsed = new URL(url);
      if (ctx.allowedHosts && !ctx.allowedHosts.includes(parsed.hostname)) {
        return { success: false, error: `Access denied: ${parsed.hostname} is not in allowed hosts` };
      }

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const text = await res.text();
      return { success: true, data: text.slice(0, 5000), mimeType: res.headers.get('content-type') ?? 'text/plain' };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
```

- [ ] **Step 5: Create CodeExecuteTool.ts**

```ts
import vm from 'node:vm';
import type { Tool, ToolContext, ToolResult } from '../tool/Tool.ts';

export class CodeExecuteTool implements Tool {
  readonly definition = {
    name: 'execute_code',
    description: 'Execute JavaScript code in a sandboxed environment',
    parameters: [
      { name: 'code', type: 'string' as const, description: 'JavaScript code to execute', required: true },
    ],
    riskLevel: 'high' as const,
  };

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const code = String(args.code ?? '');
    if (!code) return { success: false, error: 'code is required' };

    try {
      const sandbox: Record<string, unknown> = { console: { log: (...a: unknown[]) => a } };
      const context = vm.createContext(sandbox);
      const script = new vm.Script(code, { timeout: 5000 });
      const result = script.runInContext(context);
      return { success: true, data: String(result) };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
```

- [ ] **Step 6: Write tool tests**

```ts
import { describe, expect, it } from 'vitest';
import { WebSearchTool } from '../../src/tools/WebSearchTool.ts';
import { FileReadTool } from '../../src/tools/FileReadTool.ts';
import { ApiCallTool } from '../../src/tools/ApiCallTool.ts';
import { CodeExecuteTool } from '../../src/tools/CodeExecuteTool.ts';

const testCtx = { agentId: 'test', taskId: 't1' };

describe('WebSearchTool', () => {
  it('should return error for empty query', async () => {
    const tool = new WebSearchTool();
    const result = await tool.execute({ query: '' }, testCtx);
    expect(result.success).toBe(false);
  });
});

describe('FileReadTool', () => {
  it('should deny access outside allowed paths', async () => {
    const tool = new FileReadTool();
    const result = await tool.execute({ path: '/etc/passwd' }, { ...testCtx, allowedPaths: ['/tmp'] });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Access denied');
  });

  it('should return error for missing path', async () => {
    const tool = new FileReadTool();
    const result = await tool.execute({}, testCtx);
    expect(result.success).toBe(false);
  });
});

describe('ApiCallTool', () => {
  it('should deny access outside allowed hosts', async () => {
    const tool = new ApiCallTool();
    const result = await tool.execute({ url: 'https://evil.com/data' }, { ...testCtx, allowedHosts: ['example.com'] });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Access denied');
  });

  it('should return error for missing url', async () => {
    const tool = new ApiCallTool();
    const result = await tool.execute({}, testCtx);
    expect(result.success).toBe(false);
  });
});

describe('CodeExecuteTool', () => {
  it('should execute simple code', async () => {
    const tool = new CodeExecuteTool();
    const result = await tool.execute({ code: '1 + 1' }, testCtx);
    expect(result.success).toBe(true);
    expect(result.data).toBe(2);
  });

  it('should return error for invalid code', async () => {
    const tool = new CodeExecuteTool();
    const result = await tool.execute({ code: 'throw new Error("fail")' }, testCtx);
    expect(result.success).toBe(false);
  });

  it('should return error for missing code', async () => {
    const tool = new CodeExecuteTool();
    const result = await tool.execute({}, testCtx);
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 7: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/tools/`

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/tools/ packages/core/test/tools/
git commit -m "feat(core): add built-in tools (web search, file, api, code exec)"
```

---

### Task 4: ReActLoop Tool Integration

**Files:**
- Modify: `packages/core/src/agent/ReActLoop.ts`
- Test: `packages/core/test/agent/ReActLoop.test.ts`

- [ ] **Step 1: Read current ReActLoop.ts**

Read `packages/core/src/agent/ReActLoop.ts` to understand current structure.

- [ ] **Step 2: Enhance ReActLoop with tool call parsing**

Add method to parse tool calls from agent response text (look for `{"tool": "...", "args": {...}}` JSON), and modify the execution loop to call tools via ToolRegistry.

```ts
// Add to ReActLoop class:

private parseToolCall(text: string): { tool: string; args: Record<string, unknown> } | null {
  // Try to find JSON tool call in the response
  const match = text.match(/\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*\{/);
  if (!match) return null;
  try {
    const start = match.index;
    let depth = 0;
    let end = start;
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++;
      if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    const json = JSON.parse(text.slice(start, end));
    if (json.tool && typeof json.args === 'object') return json;
  } catch {}
  return null;
}
```

Modify the execute method to, after getting LLM response, check for tool call and execute it:

```ts
// In the execute loop, after agentResponse.text:
if (this.toolRegistry) {
  const toolCall = this.parseToolCall(agentResponse.text);
  if (toolCall) {
    const toolResult = await this.toolRegistry.execute(
      toolCall.tool, toolCall.args,
      { agentId: this.agentId, taskId: this.taskId ?? '' },
    );
    // Check if tool execution was deferred (HITL pending)
    if (!toolResult.success && toolResult.error?.includes('HITL')) {
      return { text: toolResult.error, views: [], hasInteraction: false };
    }
    // Feed result as observation for next loop iteration
    const observation = toolResult.success
      ? `Tool ${toolCall.tool} returned: ${JSON.stringify(toolResult.data).slice(0, 2000)}`
      : `Tool ${toolCall.tool} failed: ${toolResult.error}`;
    // Continue the loop with this observation
  }
}
```

- [ ] **Step 3: Add tests for tool call parsing**

```ts
it('should parse tool call from response', () => {
  const loop = new ReActLoop(mockProvider);
  const text = 'I need to search.\n{"tool": "web_search", "args": {"query": "hello"}}\n';
  const result = (loop as any).parseToolCall(text);
  expect(result).toEqual({ tool: 'web_search', args: { query: 'hello' } });
});

it('should return null for response without tool call', () => {
  const loop = new ReActLoop(mockProvider);
  expect((loop as any).parseToolCall('Just thinking')).toBeNull();
});
```

- [ ] **Step 4: Run tests**

Run: `pnpm test --reporter=verbose packages/core/test/agent/ReActLoop.test.ts`

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/agent/ReActLoop.ts packages/core/test/agent/ReActLoop.test.ts
git commit -m "feat(core): integrate tool calling into ReActLoop"
```

---

### Task 5: Wire ToolRegistry into CoreEngine

**Files:**
- Modify: `packages/core/src/engine/CoreEngine.ts`
- Test: Run full test suite

- [ ] **Step 1: Read current CoreEngine.ts**

Read `packages/core/src/engine/CoreEngine.ts` to find where to add ToolRegistry.

- [ ] **Step 2: Add ToolRegistry field and initialization**

```ts
// Add import:
import { ToolRegistry } from '../tool/ToolRegistry.ts';
// Add built-in tool imports:
import { WebSearchTool } from '../tools/WebSearchTool.ts';
import { FileReadTool } from '../tools/FileReadTool.ts';
import { FileWriteTool } from '../tools/FileWriteTool.ts';
import { ApiCallTool } from '../tools/ApiCallTool.ts';
import { CodeExecuteTool } from '../tools/CodeExecuteTool.ts';

// Add field:
toolRegistry!: ToolRegistry;

// In start(), after hitlManager init:
this.toolRegistry = new ToolRegistry(this.hitlManager);
this.toolRegistry.register(new WebSearchTool());
this.toolRegistry.register(new FileReadTool());
this.toolRegistry.register(new FileWriteTool());
this.toolRegistry.register(new ApiCallTool());
this.toolRegistry.register(new CodeExecuteTool());

// Pass toolRegistry to ChainTransferManager and ReActLoop
```

- [ ] **Step 3: Run tests**

Run: `pnpm test` — all tests pass

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/engine/CoreEngine.ts git commit -m "feat(core): wire ToolRegistry into CoreEngine"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`

- [ ] **Step 2: Run lint**

Run: `pnpm run lint`

- [ ] **Step 3: Commit any remaining fixes**

```bash
git add -A && git commit -m "chore: final cleanup after tool use implementation"
```
