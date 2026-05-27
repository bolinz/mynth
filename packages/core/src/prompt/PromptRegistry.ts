import type { RendererRegistry } from '../meta/ViewRenderer.ts';
import type { PromptSchema } from './PromptSchema.ts';
import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPTS } from './system-prompts.ts';

export class PromptRegistry {
  private schemas = new Map<string, PromptSchema<unknown>>();

  constructor(private rendererRegistry?: RendererRegistry) {}

  getSystemPrompt(capability: string): string {
    return SYSTEM_PROMPTS[capability] ?? DEFAULT_SYSTEM_PROMPT;
  }

  buildPrompt(capability: string, task: string, context: string): string {
    const system = this.getSystemPrompt(capability);
    const lines = [
      system,
      '',
      '--- Task ---',
      task,
      '',
      context ? `--- Context ---\n${context}\n` : '',
      '--- Response ---',
    ];

    if (this.rendererRegistry) {
      const desc = this.rendererRegistry.buildPromptDescription();
      if (desc) {
        lines.push('');
        lines.push('You may include rich content as JSON views:');
        lines.push(desc);
        lines.push('Return JSON: {"text":"...","views":[{"type":"...","data":{...}}]}');
      }
    }

    return lines.join('\n');
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
