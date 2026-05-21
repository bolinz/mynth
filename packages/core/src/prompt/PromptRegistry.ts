import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPTS } from './system-prompts.ts';

export class PromptRegistry {
  getSystemPrompt(capability: string): string {
    return SYSTEM_PROMPTS[capability] ?? DEFAULT_SYSTEM_PROMPT;
  }

  buildPrompt(capability: string, task: string, context: string): string {
    const system = this.getSystemPrompt(capability);
    return [
      system,
      '',
      '--- Task ---',
      task,
      '',
      context ? `--- Context ---\n${context}\n` : '',
      '--- Response ---',
    ].join('\n');
  }
}
