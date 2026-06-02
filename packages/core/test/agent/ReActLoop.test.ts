import { describe, expect, it, vi } from 'vitest';
import { ReActLoop } from '../../src/agent/ReActLoop.ts';
import type { LLMProvider } from '../../src/llm/LLMProvider.ts';

describe('ReActLoop', () => {
  it('should call LLM and return result', async () => {
    const mockLLM: LLMProvider = {
      complete: vi.fn().mockResolvedValue({
        content: 'FINAL: 42',
        usage: { inputTokens: 5, outputTokens: 1 },
        finishReason: 'stop',
      }),
      completeStream: vi.fn() as any,
    };
    const loop = new ReActLoop(mockLLM);
    const agentResponse = await loop.execute('What is 6 * 7?', 'reasoning');
    expect(agentResponse.text).toContain('42');
  });

  it('should respect max iterations', async () => {
    const mockLLM: LLMProvider = {
      complete: vi.fn().mockResolvedValue({
        content: 'need more info',
        usage: { inputTokens: 5, outputTokens: 5 },
        finishReason: 'stop',
      }),
      completeStream: vi.fn() as any,
    };
    const loop = new ReActLoop(mockLLM, 3);
    const agentResponse = await loop.execute('complex question', 'reasoning');
    expect(agentResponse.text).toContain('max iterations');
  });

  it('should parse tool call from response', () => {
    const mockLLM: LLMProvider = {
      complete: vi.fn(),
      completeStream: vi.fn() as any,
    };
    const loop = new ReActLoop(mockLLM);
    const text = 'I need to search.\n{"tool": "web_search", "args": {"query": "hello"}}\n';
    const result = (loop as any).parseToolCall(text);
    expect(result).toEqual({ tool: 'web_search', args: { query: 'hello' } });
  });

  it('should return null for response without tool call', () => {
    const mockLLM: LLMProvider = {
      complete: vi.fn(),
      completeStream: vi.fn() as any,
    };
    const loop = new ReActLoop(mockLLM);
    expect((loop as any).parseToolCall('Just thinking')).toBeNull();
  });

  it('should execute tool call and feed back observation', async () => {
    const ToolRegistry = (await import('../../src/tool/ToolRegistry.ts')).ToolRegistry;
    const registry = new ToolRegistry();
    registry.register({
      definition: {
        name: 'calculator',
        description: 'Calculate',
        parameters: [],
        riskLevel: 'low',
      },
      async execute(args) {
        const a = Number(args.a ?? 0);
        const b = Number(args.b ?? 0);
        return { success: true, data: a + b };
      },
    });

    // First LLM call returns a tool call, second returns FINAL
    const mockLLM: LLMProvider = {
      complete: vi
        .fn()
        .mockResolvedValueOnce({
          content: 'I need to calculate.\n{"tool": "calculator", "args": {"a": 3, "b": 4}}',
          usage: { inputTokens: 10, outputTokens: 5 },
          finishReason: 'stop',
        })
        .mockResolvedValueOnce({
          content: 'The result is 7. FINAL: 7',
          usage: { inputTokens: 15, outputTokens: 3 },
          finishReason: 'stop',
        }),
      completeStream: vi.fn() as any,
    };

    const loop = new ReActLoop(mockLLM, 5, registry);
    const response = await loop.execute('Calculate 3 + 4', 'reasoning');

    // Should have called LLM twice (tool call + final answer)
    expect(mockLLM.complete).toHaveBeenCalledTimes(2);
    // Final answer should include the tool result
    expect(response.text).toContain('7');
  });
});
