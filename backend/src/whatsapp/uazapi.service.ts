import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class UazapiService implements OnModuleInit {
  private readonly logger = new Logger(UazapiService.name);
  private http: AxiosInstance | null = null;
  private baseUrl: string;
  private instanceToken: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.baseUrl = this.config.get<string>('UAZAPI_BASE_URL', '');
    this.instanceToken = this.config.get<string>('UAZAPI_INSTANCE_TOKEN', '');

    if (!this.baseUrl || !this.instanceToken) {
      this.logger.warn(
        'UAZAPI_BASE_URL or UAZAPI_INSTANCE_TOKEN not configured — WhatsApp integration disabled',
      );
      return;
    }

    const cleanBase = this.baseUrl.replace(/\/+$/, '');

    this.http = axios.create({
      baseURL: cleanBase,
      headers: {
        'Content-Type': 'application/json',
        token: this.instanceToken,
      },
      timeout: 30000,
    });

    this.logger.log(`Uazapi connected: ${cleanBase}`);
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
      await this.http.post('/send/text', {
        number: fullNumber,
        text: message,
      });
      this.logger.log(`Message sent to ${fullNumber} (${message.length} chars)`);
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to send message to ${fullNumber}: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  async markAsRead(remoteJid: string, messageId: string): Promise<void> {
    if (!this.http) return;
    try {
      await this.http.post('/mark/read', {
        remoteJid,
        messageId,
      });
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
}
