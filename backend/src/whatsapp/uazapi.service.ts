import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { WhatsAppConfigService } from './whatsapp-config.service';

@Injectable()
export class UazapiService implements OnModuleInit {
  private readonly logger = new Logger(UazapiService.name);
  private http: AxiosInstance | null = null;
  private currentBaseUrl = '';
  private currentToken = '';

  constructor(private readonly waConfig: WhatsAppConfigService) {}

  async onModuleInit() {
    await this.reload();
  }

  async reload(): Promise<{ connected: boolean; baseUrl: string }> {
    const baseUrl = this.waConfig.getUazapiBaseUrl();
    const token = this.waConfig.getUazapiToken();

    if (!baseUrl || !token) {
      this.logger.warn('Uazapi not configured — WhatsApp integration disabled');
      this.http = null;
      this.currentBaseUrl = '';
      this.currentToken = '';
      return { connected: false, baseUrl: '' };
    }

    const cleanBase = baseUrl.replace(/\/+$/, '');

    if (cleanBase === this.currentBaseUrl && token === this.currentToken && this.http) {
      return { connected: true, baseUrl: cleanBase };
    }

    this.http = axios.create({
      baseURL: cleanBase,
      headers: {
        'Content-Type': 'application/json',
        token,
      },
      timeout: 30000,
    });

    this.currentBaseUrl = cleanBase;
    this.currentToken = token;
    this.logger.log(`Uazapi (re)connected: ${cleanBase}`);
    return { connected: true, baseUrl: cleanBase };
  }

  get isConnected(): boolean {
    return this.http !== null;
  }

  async sendText(number: string, message: string): Promise<boolean> {
    if (!this.http) {
      this.logger.warn('Uazapi not configured, cannot send message');
      return false;
    }

    const cleanNumber = number.replace(/\D/g, '');
    const fullNumber = cleanNumber.startsWith('55') ? cleanNumber : `55${cleanNumber}`;

    try {
      const resp = await this.http.post('/send/text', {
        number: fullNumber,
        text: message,
      });
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
    if (!this.http) return;
    try {
      await this.http.post('/mark/read', { remoteJid, messageId });
    } catch {
      // non-critical
    }
  }

  async sendTyping(number: string, durationMs = 3000): Promise<void> {
    if (!this.http) return;
    const cleanNumber = number.replace(/\D/g, '');
    const fullNumber = cleanNumber.startsWith('55') ? cleanNumber : `55${cleanNumber}`;
    try {
      await this.http.post('/send/presence', {
        number: fullNumber,
        presence: 'composing',
        delay: durationMs,
      });
    } catch {
      // non-critical
    }
  }

  async testConnection(): Promise<{ ok: boolean; status?: number; error?: string }> {
    if (!this.http) return { ok: false, error: 'Uazapi not configured' };
    try {
      const resp = await this.http.get('/status');
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
