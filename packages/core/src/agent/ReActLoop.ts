import type { LLMProvider } from '../llm/LLMProvider.ts';
import type { Interaction, View } from '../meta/ViewRenderer.ts';
import type { ToolRegistry } from '../tool/ToolRegistry.ts';

export interface AgentResponse {
  text: string;
  views: View[];
  interaction?: Interaction;
}

export class ReActLoop {
  private taskId = '';

  constructor(
    private llm: LLMProvider,
    private maxIterations = 10,
    private toolRegistry?: ToolRegistry,
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

      if (this.toolRegistry) {
        const toolCall = this.parseToolCall(response.content);
        if (toolCall) {
          const toolResult = await this.toolRegistry.execute(toolCall.tool, toolCall.args, {
            agentId: 'agent',
            taskId: this.taskId,
          });
          const observation = toolResult.success
            ? `Tool ${toolCall.tool} returned: ${JSON.stringify(toolResult.data).slice(0, 2000)}`
            : `Tool ${toolCall.tool} failed: ${toolResult.error}`;
          thought += '\n' + observation;
          continue;
        }
      }

      if (this.isComplete(response.content)) {
        return this.parseResponse(response.content);
      }
    }

    return {
      text: `Reached max iterations (${this.maxIterations}): ${thought}`,
      views: [],
    };
  }

  private parseToolCall(text: string): { tool: string; args: Record<string, unknown> } | null {
    const match = text.match(/\{\s*"tool"\s*:\s*"[^"]+"\s*,\s*"args"\s*:\s*\{/);
    if (!match) return null;
    try {
      const start = match.index!;
      let depth = 0;
      let end = start;
      for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        if (text[i] === '}') {
          depth--;
          if (depth === 0) {
            end = i + 1;
            break;
          }
        }
      }
      const json = JSON.parse(text.slice(start, end));
      if (json.tool && typeof json.args === 'object') return json;
    } catch {}
    return null;
  }

  setTaskId(id: string): void {
    this.taskId = id;
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
