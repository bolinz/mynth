import { describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../../src/tool/Tool.ts';
import { ToolRegistry } from '../../src/tool/ToolRegistry.ts';
import { ApiCallTool } from '../../src/tools/ApiCallTool.ts';
import { CodeExecuteTool } from '../../src/tools/CodeExecuteTool.ts';
import { FileReadTool } from '../../src/tools/FileReadTool.ts';
import { FileWriteTool } from '../../src/tools/FileWriteTool.ts';
import { WebSearchTool } from '../../src/tools/WebSearchTool.ts';

const ctx: ToolContext = {
  agentId: 'test-agent',
  taskId: 'test-task',
  allowedPaths: ['/tmp'],
  allowedHosts: ['api.example.com'],
};

describe('tools: system integration', () => {
  it('should register all built-in tools', () => {
    const registry = new ToolRegistry();
    registry.register(new WebSearchTool());
    registry.register(new FileReadTool());
    registry.register(new FileWriteTool());
    registry.register(new ApiCallTool());
    registry.register(new CodeExecuteTool());

    const tools = registry.list();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'api_call',
      'execute_code',
      'file_read',
      'file_write',
      'web_search',
    ]);
  });

  it('should reject file read outside allowed paths', async () => {
    const registry = new ToolRegistry();
    registry.register(new FileReadTool());

    const result = await registry.execute('file_read', { path: '/etc/passwd' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Access denied');
  });

  it('should reject API calls to disallowed hosts', async () => {
    const registry = new ToolRegistry();
    registry.register(new ApiCallTool());

    const result = await registry.execute('api_call', { url: 'https://evil.com/data' }, ctx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Access denied');
  });

  it('should execute code in sandbox', async () => {
    const registry = new ToolRegistry();
    registry.register(new CodeExecuteTool());

    const result = await registry.execute('execute_code', { code: '1 + 2 + 3' }, ctx);
    expect(result.success).toBe(true);
    expect(result.data).toBe('6');
  });

  it('should require HITL for high-risk tools', async () => {
    const { HITLManager } = await import('../../src/meta/HITLManager.ts');
    const hitl = new HITLManager();
    const registry = new ToolRegistry(hitl);
    registry.register(new FileWriteTool());
    registry.register(new CodeExecuteTool());

    // File write should create a pending HITL request
    const result = await registry.execute(
      'file_write',
      { path: '/tmp/test.txt', content: 'data' },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('HITL approval required');
    expect(hitl.getPendingCount()).toBe(1);

    // Code execute should also require HITL
    const result2 = await registry.execute('execute_code', { code: '1 + 1' }, ctx);
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('HITL approval required');
    expect(hitl.getPendingCount()).toBe(2);
  });
});
