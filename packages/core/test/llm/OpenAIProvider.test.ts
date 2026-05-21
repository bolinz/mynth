import { describe, expect, it, vi } from 'vitest';
import { OpenAIProvider } from '../../src/llm/OpenAIProvider.ts';

describe('OpenAIProvider', () => {
  it('should call the API and return response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    });
    const provider = new OpenAIProvider('sk-test', 'gpt-4o', mockFetch as any);
    const res = await provider.complete('Hi', { model: 'gpt-4o' });
    expect(res.content).toBe('Hello!');
    expect(res.usage.inputTokens).toBe(10);
  });
});
