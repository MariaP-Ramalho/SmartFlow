import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { WhatsAppConfigService } from './whatsapp-config.service';

@Injectable()
export class UazapiService implements OnModuleInit {
  private readonly logger = new Logger(UazapiService.name);

  constructor(private readonly waConfig: WhatsAppConfigService) {}

  async onModuleInit() {
    const baseUrl = this.waConfig.getUazapiBaseUrl();
    const token = this.waConfig.getUazapiToken();
    if (baseUrl && token) {
      this.logger.log(`Uazapi configured: ${baseUrl}`);
    } else {
      this.logger.warn('Uazapi not configured — WhatsApp integration disabled');
    }
  }

  private getAxiosConfig() {
    const baseUrl = this.waConfig.getUazapiBaseUrl()?.replace(/\/+$/, '');
    const token = this.waConfig.getUazapiToken();
    if (!baseUrl || !token) return null;
    return {
      baseUrl,
      headers: { 'Content-Type': 'application/json', token } as Record<string, string>,
      timeout: 30000,
    };
  }

  get isConnected(): boolean {
    return this.getAxiosConfig() !== null;
  }

  async reload(): Promise<{ connected: boolean; baseUrl: string }> {
    const cfg = this.getAxiosConfig();
    if (!cfg) return { connected: false, baseUrl: '' };
    this.logger.log(`Uazapi config reloaded: ${cfg.baseUrl}`);
    return { connected: true, baseUrl: cfg.baseUrl };
  }

  async sendText(number: string, message: string): Promise<boolean> {
    const cfg = this.getAxiosConfig();
    if (!cfg) {
      this.logger.warn('Uazapi not configured, cannot send message');
      return false;
    }

    const cleanNumber = number.replace(/\D/g, '');
    const fullNumber = cleanNumber.startsWith('55') ? cleanNumber : `55${cleanNumber}`;

    try {
      const resp = await axios.post(
        `${cfg.baseUrl}/send/text`,
        { number: fullNumber, text: message },
        { headers: cfg.headers, timeout: cfg.timeout },
      );
      this.logger.log(`Message sent to ${fullNumber} (${message.length} chars) status=${resp.status}`);
      return true;
    } catch (err: any) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      this.logger.error(
        `Failed to send to ${fullNumber}: status=${status} data=${JSON.stringify(data)} msg=${err?.message}`,
      );
      return false;
    }
  }

  async markAsRead(remoteJid: string, messageId: string): Promise<void> {
    const cfg = this.getAxiosConfig();
    if (!cfg) return;
    try {
      await axios.post(`${cfg.baseUrl}/mark/read`, { remoteJid, messageId }, { headers: cfg.headers, timeout: 10000 });
    } catch {
      // non-critical
    }
  }

  async sendTyping(number: string, durationMs = 3000): Promise<void> {
    const cfg = this.getAxiosConfig();
    if (!cfg) return;
    const cleanNumber = number.replace(/\D/g, '');
    const fullNumber = cleanNumber.startsWith('55') ? cleanNumber : `55${cleanNumber}`;
    try {
      await axios.post(`${cfg.baseUrl}/send/presence`, { number: fullNumber, presence: 'composing', delay: durationMs }, { headers: cfg.headers, timeout: 10000 });
    } catch {
      // non-critical
    }
  }

  async downloadMedia(messageId: string): Promise<{ base64: string; mimetype: string } | null> {
    const cfg = this.getAxiosConfig();
    if (!cfg) return null;
    try {
      const resp = await axios.post(
        `${cfg.baseUrl}/chat/downloadMedia`,
        { messageId },
        { headers: cfg.headers, timeout: 30000 },
      );
      const data = resp.data;
      const base64 = data?.base64 || data?.data || data?.media || null;
      const mimetype = data?.mimetype || data?.mimeType || 'image/jpeg';
      if (!base64) {
        this.logger.warn(`downloadMedia for ${messageId}: no base64 in response keys=${Object.keys(data || {})}`);
        return null;
      }
      this.logger.log(`Media downloaded for ${messageId}: ${mimetype} (${Math.round(base64.length / 1024)}KB base64)`);
      return { base64, mimetype };
    } catch (err: any) {
      this.logger.error(`Failed to download media ${messageId}: status=${err?.response?.status} msg=${err?.message}`);
      return null;
    }
  }

  async testConnection(): Promise<{ ok: boolean; status?: number; error?: string }> {
    const cfg = this.getAxiosConfig();
    if (!cfg) return { ok: false, error: 'Uazapi not configured' };
    try {
      const resp = await axios.get(`${cfg.baseUrl}/status`, { headers: cfg.headers, timeout: 10000 });
      return { ok: true, status: resp.status };
    } catch (err: any) {
      return {
        ok: false,
        status: err?.response?.status,
        error: err?.message || 'Unknown error',
      };
    }
  }
}
