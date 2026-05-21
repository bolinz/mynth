import type { LLMConfig, LLMProvider, LLMResponse } from './LLMProvider.ts';

export class RetryProvider implements LLMProvider {
  constructor(
    private inner: LLMProvider,
    private maxRetries = 3,
  ) {}

  async complete(prompt: string, config: LLMConfig): Promise<LLMResponse> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await this.inner.complete(prompt, config);
      } catch (err) {
        lastError = err as Error;
        if (!this.isRetryable(err)) throw err;
        if (attempt < this.maxRetries - 1) {
          await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 10000)));
        }
      }
    }
    throw lastError;
  }

  async *completeStream(prompt: string, config: LLMConfig): AsyncGenerator<LLMResponse> {
    yield* this.inner.completeStream(prompt, config);
  }

  private isRetryable(err: unknown): boolean {
    const status = (err as any)?.status || (err as any)?.code;
    return [429, 502, 503].includes(status);
  }
}
