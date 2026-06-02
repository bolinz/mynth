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
});
