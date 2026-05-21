import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../../src/llm/AnthropicProvider.ts';

describe('AnthropicProvider', () => {
  it('should call the API and return response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [{ text: 'Hello!' }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'end_turn',
      }),
    });
    const provider = new AnthropicProvider('sk-test', 'claude-sonnet-4', mockFetch as any);
    const res = await provider.complete('Hi', { model: 'claude-sonnet-4' });
    expect(res.content).toBe('Hello!');
    expect(res.usage.inputTokens).toBe(10);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-api-key': 'sk-test' }),
      }),
    );
  });
});
