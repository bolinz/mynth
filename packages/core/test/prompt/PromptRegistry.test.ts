import { describe, expect, it } from 'vitest';
import { PromptRegistry } from '../../src/prompt/PromptRegistry.ts';

describe('PromptRegistry', () => {
  it('should return a system prompt for each capability', () => {
    const reg = new PromptRegistry();
    const prompt = reg.getSystemPrompt('codegen');
    expect(prompt).toContain('code');
  });

  it('should default to reasoning prompt for unknown capabilities', () => {
    const reg = new PromptRegistry();
    const prompt = reg.getSystemPrompt('unknown_capability');
    expect(prompt).toBeDefined();
  });

  it('should build a full prompt with task context', () => {
    const reg = new PromptRegistry();
    const prompt = reg.buildPrompt(
      'codegen',
      'write a hello world function',
      'previous work: analysis done',
    );
    expect(prompt).toContain('write a hello world function');
    expect(prompt).toContain('previous work');
  });
});
