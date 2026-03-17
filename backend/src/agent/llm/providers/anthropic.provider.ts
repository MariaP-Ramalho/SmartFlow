import Anthropic from '@anthropic-ai/sdk';
import {
  LLMProvider,
  LLMMessage,
  LLMChatOptions,
  LLMResponse,
  LLMToolCall,
} from '../llm.interface';

export class AnthropicProvider implements LLMProvider {
  readonly name = 'anthropic';
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey: string, defaultModel = 'claude-sonnet-4-20250514') {
    this.client = new Anthropic({ apiKey });
    this.defaultModel = defaultModel;
  }

  async chat(
    messages: LLMMessage[],
    options: LLMChatOptions = {},
  ): Promise<LLMResponse> {
    const model = options.model ?? this.defaultModel;

    const systemMessage = messages.find((m) => m.role === 'system');
    const nonSystemMessages = messages.filter((m) => m.role !== 'system');

    const anthropicMessages = nonSystemMessages.map((msg) =>
      this.toAnthropicMessage(msg),
    );

    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model,
      max_tokens: options.maxTokens ?? 4096,
      messages: anthropicMessages,
      ...(systemMessage?.content && { system: systemMessage.content }),
      ...(options.temperature !== undefined && {
        temperature: options.temperature,
      }),
    };

    if (options.tools?.length) {
      params.tools = options.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters as Anthropic.Tool['input_schema'],
      }));

      if (options.toolChoice) {
        if (typeof options.toolChoice === 'string') {
          const mapping: Record<string, Anthropic.ToolChoice> = {
            auto: { type: 'auto' },
            none: { type: 'auto' },
            required: { type: 'any' },
          };
          params.tool_choice = mapping[options.toolChoice] ?? { type: 'auto' };
        } else {
          params.tool_choice = {
            type: 'tool',
            name: options.toolChoice.name,
          };
        }
      }
    }

    try {
      const response = await this.client.messages.create(params);
      return this.mapResponse(response);
    } catch (error) {
      throw new Error(
        `Anthropic chat error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async embed(): Promise<number[]> {
    throw new Error(
      'Anthropic does not support embeddings. Use OpenAI or Azure OpenAI for embeddings.',
    );
  }

  async embedBatch(): Promise<number[][]> {
    throw new Error(
      'Anthropic does not support embeddings. Use OpenAI or Azure OpenAI for embeddings.',
    );
  }

  private toAnthropicMessage(
    msg: LLMMessage,
  ): Anthropic.MessageParam {
    if (msg.role === 'tool') {
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.tool_call_id!,
            content: msg.content ?? '',
          },
        ],
      };
    }

    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (msg.content) blocks.push({ type: 'text', text: msg.content });
      for (const tc of msg.tool_calls) {
        blocks.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.name,
          input: JSON.parse(tc.arguments || '{}'),
        });
      }
      return { role: 'assistant', content: blocks };
    }

    if (msg.role === 'assistant') {
      return { role: 'assistant', content: msg.content ?? '' };
    }

    return { role: 'user', content: msg.content ?? '' };
  }

  private mapResponse(response: Anthropic.Message): LLMResponse {
    let textContent = '';
    const toolCalls: LLMToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),
        });
      }
    }

    let finishReason: LLMResponse['finishReason'];
    switch (response.stop_reason) {
      case 'end_turn':
        finishReason = toolCalls.length > 0 ? 'tool_calls' : 'stop';
        break;
      case 'tool_use':
        finishReason = 'tool_calls';
        break;
      case 'max_tokens':
        finishReason = 'length';
        break;
      default:
        finishReason = 'stop';
    }

    return {
      content: textContent || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens:
          response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}
