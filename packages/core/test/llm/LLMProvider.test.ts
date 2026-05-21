import { describe, expect, it } from 'vitest';
import type { LLMConfig } from '../../src/llm/LLMProvider.ts';

describe('LLMConfig', () => {
  it('should define expected fields', () => {
    const config: LLMConfig = { model: 'test', temperature: 0.7, maxTokens: 1000 };
    expect(config.model).toBe('test');
  });
});
