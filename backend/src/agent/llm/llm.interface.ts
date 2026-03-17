export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: LLMToolCall[];
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface LLMResponse {
  content: string | null;
  toolCalls?: LLMToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: LLMToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
}

export interface LLMProvider {
  readonly name: string;
  chat(messages: LLMMessage[], options?: LLMChatOptions): Promise<LLMResponse>;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
