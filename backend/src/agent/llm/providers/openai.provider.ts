import OpenAI from 'openai';
import {
  LLMProvider,
  LLMMessage,
  LLMChatOptions,
  LLMResponse,
  LLMToolCall,
} from '../llm.interface';

export class OpenAIProvider implements LLMProvider {
  readonly name = 'openai';
  private client: OpenAI;
  private defaultModel: string;
  private embeddingModel: string;

  constructor(
    apiKey: string,
    defaultModel = 'gpt-4o',
    embeddingModel = 'text-embedding-3-small',
  ) {
    this.client = new OpenAI({ apiKey });
    this.defaultModel = defaultModel;
    this.embeddingModel = embeddingModel;
  }

  async chat(
    messages: LLMMessage[],
    options: LLMChatOptions = {},
  ): Promise<LLMResponse> {
    const model = options.model ?? this.defaultModel;

    const openaiMessages = messages.map((msg) => this.toOpenAIMessage(msg));

    const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: openaiMessages,
      temperature: options.temperature,
    };

    if (options.maxTokens) {
      (params as any).max_completion_tokens = options.maxTokens;
    }

    if (options.tools?.length) {
      params.tools = options.tools.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));

      if (options.toolChoice) {
        params.tool_choice =
          typeof options.toolChoice === 'string'
            ? options.toolChoice
            : {
                type: 'function' as const,
                function: { name: options.toolChoice.name },
              };
      }
    }

    try {
      const response = await this.client.chat.completions.create(params);
      return this.mapResponse(response);
    } catch (error) {
      throw new Error(
        `OpenAI chat error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      throw new Error(
        `OpenAI embedding error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.client.embeddings.create({
        model: this.embeddingModel,
        input: texts,
      });
      return response.data
        .sort((a, b) => a.index - b.index)
        .map((d) => d.embedding);
    } catch (error) {
      throw new Error(
        `OpenAI batch embedding error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private toOpenAIMessage(msg: LLMMessage): any {
    if (msg.role === 'tool') {
      return {
        role: 'tool',
        content: msg.content ?? '',
        tool_call_id: msg.tool_call_id,
      };
    }
    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      return {
        role: 'assistant',
        content: msg.content ?? null,
        tool_calls: msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: tc.arguments },
        })),
      };
    }
    return {
      role: msg.role,
      content: msg.content ?? '',
    };
  }

  private mapResponse(response: OpenAI.ChatCompletion): LLMResponse {
    const choice = response.choices[0];
    const message = choice.message;

    let toolCalls: LLMToolCall[] | undefined;
    if (message.tool_calls?.length) {
      toolCalls = message.tool_calls.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: tc.function.arguments,
      }));
    }

    let finishReason: LLMResponse['finishReason'];
    switch (choice.finish_reason) {
      case 'stop':
        finishReason = 'stop';
        break;
      case 'tool_calls':
        finishReason = 'tool_calls';
        break;
      case 'length':
        finishReason = 'length';
        break;
      default:
        finishReason = 'stop';
    }

    return {
      content: message.content,
      toolCalls,
      finishReason,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}
