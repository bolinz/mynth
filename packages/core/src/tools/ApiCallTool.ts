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
        return {
          success: false,
          error: `Access denied: ${parsed.hostname} is not in allowed hosts`,
        };
      }

      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const text = await res.text();
      return {
        success: true,
        data: text.slice(0, 5000),
        mimeType: res.headers.get('content-type') ?? 'text/plain',
      };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
