import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AgentConfig, AgentConfigDocument } from './schemas/agent-config.schema';
import { buildAgentSystemPrompt } from './system-prompt';

const CONFIG_ID = 'default';

@Injectable()
export class AgentConfigService implements OnModuleInit {
  private readonly logger = new Logger(AgentConfigService.name);
  private cachedConfig: AgentConfigDocument | null = null;

  constructor(
    @InjectModel(AgentConfig.name) private readonly model: Model<AgentConfigDocument>,
  ) {}

  async onModuleInit() {
    const existing = await this.model.findOne({ configId: CONFIG_ID });
    if (!existing) {
      const defaultPrompt = buildAgentSystemPrompt({
        systemName: '{{systemName}}',
        customerName: '{{customerName}}',
        customerPhone: '{{customerPhone}}',
        entityName: '{{entityName}}',
        previousMessagesCount: 0,
        attemptCount: 0,
      });

      await this.model.create({
        configId: CONFIG_ID,
        systemPrompt: defaultPrompt,
      });
      this.logger.log('Default agent config created in database');
    } else {
      this.logger.log('Agent config loaded from database (system prompt preserved)');
    }

    this.cachedConfig = await this.model.findOne({ configId: CONFIG_ID });
  }

  async getConfig(): Promise<AgentConfigDocument> {
    if (this.cachedConfig) return this.cachedConfig;
    this.cachedConfig = await this.model.findOne({ configId: CONFIG_ID });
    return this.cachedConfig!;
  }

  async updateConfig(updates: Partial<{
    systemPrompt: string;
    bufferDelayMs: number;
    chatModel: string;
    maxAttempts: number;
    maxToolIterations: number;
    agentDisplayName: string;
    customInstructions: string;
    inactivityTimeoutMs: number;
    inactivityMaxWarnings: number;
    inactivityMessages: string[];
  }>): Promise<AgentConfigDocument> {
    const config = await this.model.findOneAndUpdate(
      { configId: CONFIG_ID },
      { $set: updates },
      { new: true },
    );

    this.cachedConfig = config;
    return config!;
  }

  async resetToDefault(): Promise<AgentConfigDocument> {
    const defaultPrompt = buildAgentSystemPrompt({
      systemName: '{{systemName}}',
      customerName: '{{customerName}}',
      customerPhone: '{{customerPhone}}',
      entityName: '{{entityName}}',
      previousMessagesCount: 0,
      attemptCount: 0,
    });

    return this.updateConfig({ systemPrompt: defaultPrompt, customInstructions: '' });
  }

  buildPromptForSession(context: {
    systemName: string;
    customerName: string;
    customerPhone: string;
    entityName: string;
    previousMessagesCount: number;
    attemptCount: number;
  }): string {
    let prompt = this.cachedConfig?.systemPrompt || buildAgentSystemPrompt(context);

    prompt = prompt
      .replace(/\{\{systemName\}\}/g, context.systemName)
      .replace(/\{\{customerName\}\}/g, context.customerName)
      .replace(/\{\{customerPhone\}\}/g, context.customerPhone)
      .replace(/\{\{entityName\}\}/g, context.entityName)
      .replace(/\{\{previousMessagesCount\}\}/g, String(context.previousMessagesCount))
      .replace(/\{\{attemptCount\}\}/g, String(context.attemptCount));

    if (this.cachedConfig?.customInstructions?.trim()) {
      prompt += `\n\nINSTRUÇÕES ADICIONAIS DO ADMINISTRADOR:\n${this.cachedConfig.customInstructions}`;
    }

    return prompt;
  }
}
