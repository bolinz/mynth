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
