import { resolve } from 'path';
import { writeFile } from 'fs/promises';
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
    if (!filePath) return { success: false, error: 'path is required', data: null };

    const resolved = resolve(filePath);
    if (ctx.allowedPaths && !ctx.allowedPaths.some((p) => resolved.startsWith(resolve(p)))) {
      return {
        success: false,
        error: `Access denied: ${filePath} is not in allowed paths`,
        data: null,
      };
    }

    try {
      await writeFile(resolved, content, 'utf-8');
      return { success: true, data: `Written ${content.length} bytes to ${filePath}` };
    } catch (err) {
      return { success: false, error: String(err), data: null };
    }
  }
}
