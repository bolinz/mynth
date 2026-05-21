import type { LLMConfig, LLMProvider, LLMResponse } from '../llm/LLMProvider.ts';

export class ReActLoop {
  constructor(
    private llm: LLMProvider,
    private maxIterations = 10,
  ) {}

  async execute(task: string, _capability: string): Promise<string> {
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
        return response.content;
      }
    }

    return `Reached max iterations (${this.maxIterations}): ${thought}`;
  }

  private buildPrompt(task: string, previousThought: string, iteration: number): string {
    return [
      'You are an AI agent executing a task. Think step by step.',
      '',
      `Task: ${task}`,
      '',
      previousThought ? `Previous work:\n${previousThought}\n` : '',
      iteration > 0
        ? 'Continue from where you left off. Focus on making concrete progress.'
        : 'Start by analyzing what needs to be done.',
      '',
      'Provide your reasoning and any output. If the task is complete, start your response with "FINAL:"',
    ].join('\n');
  }

  private isComplete(content: string): boolean {
    return content.includes('FINAL:') || content.includes('ANSWER:');
  }
}
