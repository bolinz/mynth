import { describe, expect, it } from 'vitest';
import { ToolRegistry } from '../../src/tool/ToolRegistry.ts';
import type { Tool, ToolContext, ToolResult } from '../../src/tool/Tool.ts';

describe('ToolRegistry', () => {
  it('should register and retrieve a tool', () => {
    const registry = new ToolRegistry();
    const tool: Tool = {
      definition: { name: 'echo', description: 'Echo input', parameters: [], riskLevel: 'low' },
      async execute() {
        return { success: true, data: null };
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
      async execute() {
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
