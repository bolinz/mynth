import type { PromptSchema } from './PromptSchema.ts';
import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPTS } from './system-prompts.ts';

export class PromptRegistry {
  private schemas = new Map<string, PromptSchema<unknown>>();

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

  registerSchema(capability: string, schema: PromptSchema<unknown>): void {
    this.schemas.set(capability, schema);
  }

  getSchema(capability: string): PromptSchema<unknown> | undefined {
    return this.schemas.get(capability);
  }

  buildStructuredPrompt(capability: string, task: string, context: string): string {
    const base = this.buildPrompt(capability, task, context);
    const schema = this.schemas.get(capability);
    if (!schema) return base;
    return `${base}\n\n${schema.extractInstructions}`;
  }
}
