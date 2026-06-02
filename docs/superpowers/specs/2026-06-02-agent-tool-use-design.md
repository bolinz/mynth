# Agent Tool Use Design

> Design for integrating external tool calling into mynth's ReActLoop

**Goal:** Allow AI agents to use external tools (web search, file system, API calls, code execution) during task execution, with HITL approval for high-risk operations.

**Architecture:** ToolRegistry + Tool interface + ReActLoop integration + HITLManager risk approval

**Status:** Design approved, ready for implementation planning

---

## 1. Tool Interface

Defined in `packages/sdk/src/types/tool.ts`:

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

Defined in `packages/core/src/tool/Tool.ts`:

```ts
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

## 2. ToolRegistry

`packages/core/src/tool/ToolRegistry.ts`

- `register(tool: Tool): void`
- `get(name: string): Tool | undefined`
- `list(): ToolDefinition[]`
- `execute(name: string, args, ctx): Promise<ToolResult>` — resolves tool, checks risk, executes

Risk check in `execute()`:
- Low risk: execute immediately
- Medium risk: execute with warning
- High risk: create HITL pending request, pause execution until approved/rejected

## 3. Built-in Tools

All in `packages/core/src/tools/`:

| File | Tool | Risk | Description |
|------|------|------|-------------|
| `WebSearchTool.ts` | `web_search` | low | Searches web and fetches content |
| `FileReadTool.ts` | `file_read` | low | Reads files within allowedPaths |
| `FileWriteTool.ts` | `file_write` | high | Writes files, requires HITL |
| `ApiCallTool.ts` | `api_call` | medium | HTTP GET requests to allowedHosts |
| `CodeExecuteTool.ts` | `execute_code` | high | Sandboxed code execution, requires HITL |

## 4. ReActLoop Integration

`packages/core/src/agent/ReActLoop.ts` — enhanced to parse tool calls:

```
Agent LLM Response → parse for tool call
  ├── No tool call → continue as normal
  └── Tool call found:
        ├── HITL check (high risk)
        │     ├── pending → pause, wait for approval
        │     └── rejected → inform agent, continue
        ├── Execute tool via ToolRegistry
        └── Feed ToolResult as Observation → continue loop
```

Tool call format in agent response:
```json
{
  "tool": "web_search",
  "args": { "query": "..." }
}
```

The existing ReActLoop's "Act" step is enhanced to detect and execute tool calls before falling through to the default action.

## 5. HITL Integration

- High-risk tools trigger `HITLManager.submit()` with operation type `tool.${toolName}`
- Agent pauses (via ReActLoop returning a pending status)
- External approval via existing CLI (`mynth approve`) or Web UI (`POST /approve`)
- On approval: execute tool and continue
- On rejection: inform the agent and let it decide alternative approach

## 6. File Structure

```
packages/sdk/src/types/tool.ts       — ToolDefinition, ToolParameter types
packages/core/src/tool/Tool.ts        — Tool, ToolContext, ToolResult interfaces
packages/core/src/tool/ToolRegistry.ts — ToolRegistry class
packages/core/src/tools/              — Built-in tool implementations
packages/core/src/tools/WebSearchTool.ts
packages/core/src/tools/FileReadTool.ts
packages/core/src/tools/FileWriteTool.ts
packages/core/src/tools/ApiCallTool.ts
packages/core/src/tools/CodeExecuteTool.ts
packages/core/src/agent/ReActLoop.ts  — Enhanced with tool call handling
```

Test files mirror the source structure under `packages/core/test/`.

## 7. Constraints

- No external npm deps for tools (web search uses fetch, code exec uses vm/module)
- Tool execution time limited to 30s max
- File operations restricted to `allowedPaths` only
- Network requests restricted to `allowedHosts` only
- Code execution in isolated context (no access to process/fs)
