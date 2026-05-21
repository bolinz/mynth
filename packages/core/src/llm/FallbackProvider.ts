import type { LLMConfig, LLMProvider, LLMResponse } from './LLMProvider.ts';

export class FallbackProvider implements LLMProvider {
  constructor(private providers: LLMProvider[]) {}

  async complete(prompt: string, config: LLMConfig): Promise<LLMResponse> {
    const errors: Error[] = [];
    for (const provider of this.providers) {
      try {
        return await provider.complete(prompt, config);
      } catch (err) {
        errors.push(err as Error);
      }
    }
    throw new Error(`All providers failed: ${errors.map((e) => e.message).join('; ')}`);
  }

  async *completeStream(prompt: string, config: LLMConfig): AsyncGenerator<LLMResponse> {
    for (const provider of this.providers) {
      try {
        yield* provider.completeStream(prompt, config);
        return;
      } catch {
        /* try next */
      }
    }
  }
}
