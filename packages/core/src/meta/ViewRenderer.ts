import type { z } from 'zod';

export interface View {
  type: string;
  title?: string;
  data: Record<string, unknown>;
}

export interface Interaction {
  id: string;
  type: string;
  prompt: string;
  data: Record<string, unknown>;
  agentId: string;
  taskId: string;
  createdAt: number;
}

export interface InteractionResponse {
  interactionId: string;
  value: unknown;
}

export interface ViewRenderer {
  type: string;
  description: string;
  schema: z.ZodType<any>;
  sanitize?(data: unknown): unknown;
  renderTUI(view: View): string | { type: 'browser'; html: string };
  renderWeb(view: View): string;
}

export class RendererRegistry {
  private renderers = new Map<string, ViewRenderer>();

  register(renderer: ViewRenderer): void {
    this.renderers.set(renderer.type, renderer);
  }

  get(type: string): ViewRenderer | undefined {
    return this.renderers.get(type);
  }

  getAll(): ViewRenderer[] {
    return Array.from(this.renderers.values());
  }

  buildPromptDescription(): string {
    const lines = this.getAll().map(
      (r) => `- "${r.type}": ${r.description}`,
    );
    return `Available view types:\n${lines.join('\n')}`;
  }
}
