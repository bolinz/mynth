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

  async execute(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
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
        return {
          success: false,
          error: `HITL approval required for ${name}. Request ID: ${req.id}. Use 'mynth approve ${req.id}' to proceed.`,
        };
      }
    }

    try {
      return await tool.execute(args, ctx);
    } catch (err) {
      return { success: false, error: String(err) };
    }
  }
}
