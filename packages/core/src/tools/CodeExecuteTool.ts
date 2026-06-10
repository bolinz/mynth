import vm from 'node:vm';
import type { Tool, ToolContext, ToolResult } from '../tool/Tool.ts';

export class CodeExecuteTool implements Tool {
  readonly definition = {
    name: 'execute_code',
    description: 'Execute JavaScript code in a sandboxed environment',
    parameters: [
      {
        name: 'code',
        type: 'string' as const,
        description: 'JavaScript code to execute',
        required: true,
      },
    ],
    riskLevel: 'high' as const,
  };

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const code = String(args.code ?? '');
    if (!code) return { success: false, error: 'code is required', data: null };

    try {
      const sandbox: Record<string, unknown> = { console: { log: (...a: unknown[]) => a } };
      const context = vm.createContext(sandbox);
      const script = new vm.Script(code);
      const result = script.runInContext(context, { timeout: 5000 });
      return { success: true, data: String(result) };
    } catch (err) {
      return { success: false, error: String(err), data: null };
    }
  }
}
