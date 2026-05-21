import type { LLMConfig, LLMProvider, LLMResponse } from '../../src/llm/LLMProvider.ts';

export class MockProvider implements LLMProvider {
  async complete(_prompt: string, _config: LLMConfig): Promise<LLMResponse> {
    return {
      content: 'Mock response',
      usage: { inputTokens: 10, outputTokens: 5 },
      finishReason: 'stop',
    };
  }

  async *completeStream(_prompt: string, _config: LLMConfig): AsyncGenerator<LLMResponse> {
    yield { content: 'chunk', usage: { inputTokens: 0, outputTokens: 5 }, finishReason: 'stop' };
  }
}

export class FailingProvider implements LLMProvider {
  constructor(
    private failCount: number,
    private status = 500,
  ) {
    this.attempts = 0;
  }
  attempts: number;

  async complete(_prompt: string, _config: LLMConfig): Promise<LLMResponse> {
    this.attempts++;
    if (this.attempts <= this.failCount) {
      throw Object.assign(new Error('fail'), { status: this.status });
    }
    return { content: 'ok', usage: { inputTokens: 1, outputTokens: 1 }, finishReason: 'stop' };
  }

  async *completeStream(): AsyncGenerator<LLMResponse> {}
}
