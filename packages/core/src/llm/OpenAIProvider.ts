import type { LLMConfig, LLMProvider, LLMResponse } from './LLMProvider.ts';

export class OpenAIProvider implements LLMProvider {
  private apiUrl = 'https://api.openai.com/v1/chat/completions';

  constructor(
    private apiKey: string,
    private defaultModel: string,
    private fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  async complete(prompt: string, config: LLMConfig): Promise<LLMResponse> {
    const model = config.model || this.defaultModel;
    const res = await this.fetchFn(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: config.maxTokens ?? 1024,
        temperature: config.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw Object.assign(new Error(`OpenAI API error: ${err}`), { status: res.status });
    }

    const json = await res.json();
    return {
      content: json.choices[0]?.message?.content ?? '',
      usage: {
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      },
      finishReason: json.choices[0]?.finish_reason === 'stop' || json.choices[0]?.finish_reason === 'tool_calls' ? 'stop' : 'length',
    };
  }

  async *completeStream(prompt: string, config: LLMConfig): AsyncGenerator<LLMResponse> {
    const model = config.model || this.defaultModel;
    const res = await this.fetchFn(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: config.maxTokens ?? 1024,
        temperature: config.temperature ?? 0.7,
        messages: [{ role: 'user', content: prompt }],
        stream: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }
    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          const data = JSON.parse(line.slice(6));
          const delta = data.choices?.[0]?.delta?.content;
          if (delta) {
            yield {
              content: delta,
              usage: { inputTokens: 0, outputTokens: 0 },
              finishReason: 'stop',
            };
          }
        }
      }
    }
  }
}
