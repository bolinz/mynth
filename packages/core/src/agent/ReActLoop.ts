import type { LLMProvider } from '../llm/LLMProvider.ts';
import type { Interaction, View } from '../meta/ViewRenderer.ts';

export interface AgentResponse {
  text: string;
  views: View[];
  interaction?: Interaction;
}

export class ReActLoop {
  constructor(
    private llm: LLMProvider,
    private maxIterations = 10,
  ) {}

  async execute(task: string, _capability: string): Promise<AgentResponse> {
    let thought = '';

    for (let i = 0; i < this.maxIterations; i++) {
      const prompt = this.buildPrompt(task, thought, i);
      const response = await this.llm.complete(prompt, {
        model: 'default',
        temperature: 0.7,
        maxTokens: 1024,
      });

      thought += '\n' + response.content;

      if (this.isComplete(response.content)) {
        return this.parseResponse(response.content);
      }
    }

    return {
      text: `Reached max iterations (${this.maxIterations}): ${thought}`,
      views: [],
    };
  }

  private parseResponse(content: string): AgentResponse {
    try {
      const json = this.extractJSON(content);
      if (json) {
        const parsed = JSON.parse(json);
        return {
          text: parsed.text ?? content,
          views: parsed.views ?? [],
          interaction: parsed.interaction,
        };
      }
    } catch {
      // not valid JSON, return as text
    }
    return { text: content, views: [] };
  }

  private extractJSON(text: string): string | null {
    const trimmed = text.trim();
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {}
    const match = trimmed.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        JSON.parse(match[1].trim());
        return match[1].trim();
      } catch {}
    }
    return null;
  }

  private buildPrompt(task: string, previousThought: string, iteration: number): string {
    return [
      'You are an AI agent executing a task. Think step by step.',
      '',
      `Task: ${task}`,
      '',
      previousThought ? `Previous work:\n${previousThought}\n` : '',
      iteration > 0
        ? 'Continue from where you left off.'
        : 'Start by analyzing what needs to be done.',
      '',
      'When done, respond with JSON:',
      '{"text": "summary", "views": [{"type": "table", "data": {...}}]}',
    ].join('\n');
  }

  private isComplete(content: string): boolean {
    return content.includes('FINAL:') || content.includes('ANSWER:') || content.includes('"text"');
  }
}
