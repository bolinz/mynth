export interface LLMConfig {
  model: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
}

export interface LLMResponse {
  content: string;
  usage: { inputTokens: number; outputTokens: number };
  finishReason: 'stop' | 'length' | 'error';
}

export interface LLMProvider {
  complete(prompt: string, config: LLMConfig): Promise<LLMResponse>;
  completeStream(prompt: string, config: LLMConfig): AsyncGenerator<LLMResponse>;
}
