import type { LLMConfig, LLMProvider } from './LLMProvider.ts';

export class LLMPool {
  private providers = new Map<string, LLMProvider>();

  register(name: string, provider: LLMProvider): void {
    this.providers.set(name, provider);
  }

  resolve(config: LLMConfig): LLMProvider {
    const exact = this.providers.get(config.model);
    if (exact) return exact;

    for (const [name, provider] of this.providers) {
      if (config.model.startsWith(name)) return provider;
    }

    throw new Error(`No provider found for model: ${config.model}`);
  }
}
