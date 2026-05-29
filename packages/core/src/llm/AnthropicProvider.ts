import type { LLMConfig, LLMProvider, LLMResponse } from './LLMProvider.ts';

export class AnthropicProvider implements LLMProvider {
  private apiUrl = 'https://api.anthropic.com/v1/messages';

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
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
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
      throw Object.assign(new Error(`Anthropic API error: ${err}`), { status: res.status });
    }

    const json = await res.json();
    return {
      content: json.content[0]?.text ?? '',
      usage: {
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      },
      finishReason:
        json.stop_reason === 'end_turn' || json.stop_reason === 'stop_sequence' ? 'stop' : 'length',
    };
  }

  async *completeStream(prompt: string, config: LLMConfig): AsyncGenerator<LLMResponse> {
    const model = config.model || this.defaultModel;
    const res = await this.fetchFn(this.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
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
        if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'content_block_delta') {
            yield {
              content: data.delta?.text ?? '',
              usage: { inputTokens: 0, outputTokens: 0 },
              finishReason: 'stop',
            };
          }
        }
      }
    }
  }
}
