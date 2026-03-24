import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { WhatsAppConfig, WhatsAppConfigDocument } from './schemas/whatsapp-config.schema';

const CONFIG_ID = 'default';

@Injectable()
export class WhatsAppConfigService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppConfigService.name);
  private cached: WhatsAppConfigDocument | null = null;

  constructor(
    @InjectModel(WhatsAppConfig.name) private readonly model: Model<WhatsAppConfigDocument>,
    private readonly envConfig: ConfigService,
  ) {}

  async onModuleInit() {
    const existing = await this.model.findOne({ configId: CONFIG_ID });
    if (!existing) {
      await this.model.create({
        configId: CONFIG_ID,
        uazapiBaseUrl: this.envConfig.get<string>('UAZAPI_BASE_URL', ''),
        uazapiInstanceToken: this.envConfig.get<string>('UAZAPI_INSTANCE_TOKEN', ''),
        managerWhatsApp: this.envConfig.get<string>('MANAGER_WHATSAPP', ''),
        mirrorWhatsAppExtra: this.envConfig.get<string>('MIRROR_WHATSAPP_EXTRA', ''),
        agentDisplayName: this.envConfig.get<string>('AGENT_DISPLAY_NAME', 'Renato Solves'),
        webhookUrl: '',
        enabled: true,
      });
      this.logger.log('WhatsApp config seeded from environment variables');
    }
    this.cached = await this.model.findOne({ configId: CONFIG_ID });
  }

  async getConfig(): Promise<WhatsAppConfigDocument> {
    if (this.cached) return this.cached;
    this.cached = await this.model.findOne({ configId: CONFIG_ID });
    return this.cached!;
  }

  async updateConfig(updates: Partial<{
    uazapiBaseUrl: string;
    uazapiInstanceToken: string;
    managerWhatsApp: string;
    mirrorWhatsAppExtra: string;
    agentDisplayName: string;
    webhookUrl: string;
    enabled: boolean;
  }>): Promise<WhatsAppConfigDocument> {
    const config = await this.model.findOneAndUpdate(
      { configId: CONFIG_ID },
      { $set: updates },
      { new: true },
    );
    this.cached = config;
    return config!;
  }

  getManagerPhone(): string {
    return this.cached?.managerWhatsApp || this.envConfig.get<string>('MANAGER_WHATSAPP', '');
  }

  /**
   * Destinatários do espelhamento (mensagens cliente + respostas do agente).
   * Inclui sempre o gestor principal (MANAGER_WHATSAPP) e os números em mirrorWhatsAppExtra / MIRROR_WHATSAPP_EXTRA.
   */
  getMirrorRecipientPhones(): string[] {
    const primary = this.getManagerPhone();
    const extraCsv =
      (this.cached?.mirrorWhatsAppExtra ?? '').trim() ||
      this.envConfig.get<string>('MIRROR_WHATSAPP_EXTRA', '');
    return this.mergeNormalizedPhones(primary, extraCsv);
  }

  private mergeNormalizedPhones(primary: string, extraCsv: string): string[] {
    const out = new Set<string>();
    const add = (raw: string) => {
      const d = raw.replace(/\D/g, '');
      if (d.length < 10) return;
      const full = d.startsWith('55') ? d : `55${d}`;
      out.add(full);
    };
    if (primary?.trim()) add(primary);
    for (const part of extraCsv.split(/[,;\n]+/)) {
      const t = part.trim();
      if (t) add(t);
    }
    return [...out];
  }

  getAgentDisplayName(): string {
    return this.cached?.agentDisplayName || this.envConfig.get<string>('AGENT_DISPLAY_NAME', 'Renato Solves');
  }

  getUazapiBaseUrl(): string {
    return this.cached?.uazapiBaseUrl || this.envConfig.get<string>('UAZAPI_BASE_URL', '');
  }

  getUazapiToken(): string {
    return this.cached?.uazapiInstanceToken || this.envConfig.get<string>('UAZAPI_INSTANCE_TOKEN', '');
  }

  isEnabled(): boolean {
    return this.cached?.enabled ?? true;
  }
}
