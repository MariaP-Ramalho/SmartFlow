import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LLMProvider,
  LLMMessage,
  LLMChatOptions,
  LLMResponse,
} from './llm.interface';
import { OpenAIProvider } from './providers/openai.provider';
import { AnthropicProvider } from './providers/anthropic.provider';
import { AzureOpenAIProvider } from './providers/azure-openai.provider';

@Injectable()
export class LlmService implements OnModuleInit {
  private readonly logger = new Logger(LlmService.name);
  private providers = new Map<string, LLMProvider>();
  private primaryProvider: LLMProvider;
  private embeddingProvider: LLMProvider;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.initializeProviders();
  }

  private initializeProviders() {
    const chatModel = this.configService.get<string>('llm.chatModel', 'gpt-4o');
    const embeddingModel = this.configService.get<string>(
      'llm.embeddingModel',
      'text-embedding-3-small',
    );

    const openaiKey = this.configService.get<string>('llm.openai.apiKey');
    if (openaiKey) {
      const provider = new OpenAIProvider(openaiKey, chatModel, embeddingModel);
      this.providers.set('openai', provider);
      this.logger.log('OpenAI provider initialized');
    }

    const anthropicKey = this.configService.get<string>('llm.anthropic.apiKey');
    if (anthropicKey) {
      const provider = new AnthropicProvider(anthropicKey);
      this.providers.set('anthropic', provider);
      this.logger.log('Anthropic provider initialized');
    }

    const azureKey = this.configService.get<string>('llm.azure.apiKey');
    const azureEndpoint = this.configService.get<string>('llm.azure.endpoint');
    const azureDeployment = this.configService.get<string>(
      'llm.azure.deployment',
    );
    if (azureKey && azureEndpoint && azureDeployment) {
      const provider = new AzureOpenAIProvider(
        azureKey,
        azureEndpoint,
        azureDeployment,
        embeddingModel,
      );
      this.providers.set('azure-openai', provider);
      this.logger.log('Azure OpenAI provider initialized');
    }

    const defaultName = this.configService.get<string>(
      'llm.defaultProvider',
      'openai',
    );
    this.primaryProvider = this.providers.get(defaultName) as LLMProvider;
    if (!this.primaryProvider) {
      const first = this.providers.values().next().value;
      if (!first) {
        throw new Error(
          'No LLM providers configured. Set at least one API key (OPENAI_API_KEY, ANTHROPIC_API_KEY, or AZURE_OPENAI_API_KEY).',
        );
      }
      this.primaryProvider = first;
      this.logger.warn(
        `Configured default provider "${defaultName}" not available, falling back to "${this.primaryProvider.name}"`,
      );
    }

    this.embeddingProvider =
      (this.providers.get('openai') ?? this.providers.get('azure-openai')) as LLMProvider;
    if (!this.embeddingProvider) {
      this.logger.warn(
        'No embedding-capable provider available. embed() calls will fail.',
      );
    }

    this.logger.log(
      `Primary LLM provider: ${this.primaryProvider.name} | Embedding provider: ${this.embeddingProvider?.name ?? 'none'}`,
    );
  }

  async chat(
    messages: LLMMessage[],
    options?: LLMChatOptions,
  ): Promise<LLMResponse> {
    const fallbackOrder = this.buildFallbackOrder();

    const errors: string[] = [];

    for (let i = 0; i < fallbackOrder.length; i++) {
      const provider = fallbackOrder[i];
      try {
        return await provider.chat(messages, options);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        errors.push(`${provider.name}: ${errMsg}`);
        this.logger.error(`Provider "${provider.name}" failed: ${errMsg}`);
        if (i < fallbackOrder.length - 1) {
          this.logger.log(
            `Falling back to provider "${fallbackOrder[i + 1].name}"`,
          );
        }
      }
    }

    throw new Error(
      `All LLM providers failed:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
  }

  async embed(text: string): Promise<number[]> {
    if (!this.embeddingProvider) {
      throw new Error(
        'No embedding provider available. Configure OpenAI or Azure OpenAI.',
      );
    }
    return this.embeddingProvider.embed(text);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.embeddingProvider) {
      throw new Error(
        'No embedding provider available. Configure OpenAI or Azure OpenAI.',
      );
    }
    return this.embeddingProvider.embedBatch(texts);
  }

  getProvider(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  private buildFallbackOrder(): LLMProvider[] {
    const order: LLMProvider[] = [this.primaryProvider];
    for (const provider of this.providers.values()) {
      if (provider.name !== this.primaryProvider.name) {
        order.push(provider);
      }
    }
    return order;
  }
}
