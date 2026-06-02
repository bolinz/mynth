import { resolve } from 'path';
import { readFile } from 'fs/promises';
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
