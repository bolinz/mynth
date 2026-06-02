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

  async execute(args: Record<string, unknown>, _ctx: ToolContext): Promise<ToolResult> {
    const query = String(args.query ?? '');
    if (!query) return { success: false, error: 'query is required' };
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const html = await res.text();
      const text = html
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 3000);
      return { success: true, data: text, mimeType: 'text/plain' };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
