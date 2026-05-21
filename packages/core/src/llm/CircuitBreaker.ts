import type { LLMConfig, LLMProvider, LLMResponse } from './LLMProvider.ts';

type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker implements LLMProvider {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;

  constructor(
    private inner: LLMProvider,
    private threshold = 5,
    private resetTimeout = 30000,
  ) {}

  async complete(prompt: string, config: LLMConfig): Promise<LLMResponse> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new Error('circuit open');
      }
    }

    try {
      const result = await this.inner.complete(prompt, config);
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failureCount = 0;
      }
      return result;
    } catch (err) {
      this.failureCount++;
      this.lastFailureTime = Date.now();
      if (this.failureCount >= this.threshold) {
        this.state = 'open';
      }
      throw err;
    }
  }

  async *completeStream(prompt: string, config: LLMConfig): AsyncGenerator<LLMResponse> {
    yield* this.inner.completeStream(prompt, config);
  }
}
