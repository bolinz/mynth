import { describe, expect, it } from 'vitest';
import type { ToolContext } from '../../src/tool/Tool.ts';
import { ApiCallTool } from '../../src/tools/ApiCallTool.ts';
import { CodeExecuteTool } from '../../src/tools/CodeExecuteTool.ts';
import { FileReadTool } from '../../src/tools/FileReadTool.ts';
import { FileWriteTool } from '../../src/tools/FileWriteTool.ts';
import { WebSearchTool } from '../../src/tools/WebSearchTool.ts';

const testCtx: ToolContext = { agentId: 'test', taskId: 't1' };

describe('WebSearchTool', () => {
  it('should return error for empty query', async () => {
    const tool = new WebSearchTool();
    const result = await tool.execute({ query: '' }, testCtx);
    expect(result.success).toBe(false);
  });
});

describe('FileReadTool', () => {
  it('should deny access outside allowed paths', async () => {
    const tool = new FileReadTool();
    const result = await tool.execute(
      { path: '/etc/passwd' },
      { ...testCtx, allowedPaths: ['/tmp'] },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Access denied');
  });

  it('should return error for missing path', async () => {
    const tool = new FileReadTool();
    const result = await tool.execute({}, testCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('path is required');
  });
});

describe('ApiCallTool', () => {
  it('should deny access outside allowed hosts', async () => {
    const tool = new ApiCallTool();
    const result = await tool.execute(
      { url: 'https://evil.com/data' },
      { ...testCtx, allowedHosts: ['example.com'] },
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('Access denied');
  });

  it('should return error for missing url', async () => {
    const tool = new ApiCallTool();
    const result = await tool.execute({}, testCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('url is required');
  });
});

describe('FileWriteTool', () => {
  it('should return error for missing path', async () => {
    const tool = new FileWriteTool();
    const result = await tool.execute({}, testCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('path is required');
  });
});

describe('CodeExecuteTool', () => {
  it('should execute simple code', async () => {
    const tool = new CodeExecuteTool();
    const result = await tool.execute({ code: '1 + 1' }, testCtx);
    expect(result.success).toBe(true);
    expect(result.data).toBe('2');
  });

  it('should return error for invalid code', async () => {
    const tool = new CodeExecuteTool();
    const result = await tool.execute({ code: 'throw new Error("fail")' }, testCtx);
    expect(result.success).toBe(false);
  });

  it('should return error for missing code', async () => {
    const tool = new CodeExecuteTool();
    const result = await tool.execute({}, testCtx);
    expect(result.success).toBe(false);
    expect(result.error).toContain('code is required');
  });
});
