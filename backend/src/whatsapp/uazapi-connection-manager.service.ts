import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { WhatsAppAgentService } from './whatsapp-agent.service';

export interface UazapiConnection {
  slug: string;
  baseUrl: string;
  isConnected: boolean;
  sendText(number: string, message: string): Promise<boolean>;
  sendTyping(number: string, durationMs?: number): Promise<void>;
  markAsRead(remoteJid: string, messageId: string): Promise<void>;
  downloadMedia(messageId: string): Promise<{ base64: string; mimetype: string } | null>;
  testConnection(): Promise<{ ok: boolean; status?: number; error?: string }>;
}

@Injectable()
export class UazapiConnectionManager {
  private readonly logger = new Logger(UazapiConnectionManager.name);
  private readonly connections = new Map<string, UazapiConnection>();

  constructor(private readonly agentService: WhatsAppAgentService) {}

  getConnection(slug: string): UazapiConnection | null {
    const cached = this.connections.get(slug);
    if (cached) return cached;

    const agent = this.agentService.getBySlugCached(slug);
    if (!agent?.uazapiBaseUrl || !agent?.uazapiInstanceToken) {
      return null;
    }

    const conn = this.createConnection(slug, agent.uazapiBaseUrl, agent.uazapiInstanceToken);
    this.connections.set(slug, conn);
    return conn;
  }

  invalidate(slug: string): void {
    this.connections.delete(slug);
    this.logger.log(`Connection invalidated for agent: ${slug}`);
  }

  invalidateAll(): void {
    this.connections.clear();
  }

  private createConnection(slug: string, baseUrl: string, token: string): UazapiConnection {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
    const headers = { 'Content-Type': 'application/json', token };
    const timeout = 30000;
    const logger = this.logger;

    const normalizeNumber = (num: string): string => {
      const clean = num.replace(/\D/g, '');
      return clean.startsWith('55') ? clean : `55${clean}`;
    };

    return {
      slug,
      baseUrl: cleanBaseUrl,
      get isConnected() {
        return !!cleanBaseUrl && !!token;
      },

      async sendText(number: string, message: string): Promise<boolean> {
        const fullNumber = normalizeNumber(number);
        try {
          const resp = await axios.post(
            `${cleanBaseUrl}/send/text`,
            { number: fullNumber, text: message },
            { headers, timeout },
          );
          logger.log(`[${slug}] Message sent to ${fullNumber} (${message.length} chars) status=${resp.status}`);
          return true;
        } catch (err: any) {
          logger.error(
            `[${slug}] Failed to send to ${fullNumber}: status=${err?.response?.status} msg=${err?.message}`,
          );
          return false;
        }
      },

      async sendTyping(number: string, durationMs = 3000): Promise<void> {
        const fullNumber = normalizeNumber(number);
        try {
          await axios.post(
            `${cleanBaseUrl}/send/presence`,
            { number: fullNumber, presence: 'composing', delay: durationMs },
            { headers, timeout: 10000 },
          );
        } catch {
          // non-critical
        }
      },

      async markAsRead(remoteJid: string, messageId: string): Promise<void> {
        try {
          await axios.post(
            `${cleanBaseUrl}/mark/read`,
            { remoteJid, messageId },
            { headers, timeout: 10000 },
          );
        } catch {
          // non-critical
        }
      },

      async downloadMedia(messageId: string): Promise<{ base64: string; mimetype: string } | null> {
        const idsToTry = [messageId];
        if (messageId.includes(':')) {
          idsToTry.push(messageId.split(':').pop()!);
        }

        for (const id of idsToTry) {
          try {
            const resp = await axios.post(
              `${cleanBaseUrl}/chat/downloadMedia`,
              { messageId: id },
              { headers, timeout: 30000 },
            );
            const data = resp.data;
            const base64 = data?.base64 || data?.data || data?.media || null;
            const mimetype = data?.mimetype || data?.mimeType || 'image/jpeg';
            if (!base64) continue;
            logger.log(`[${slug}] Media downloaded id=${id}: ${mimetype}`);
            return { base64, mimetype };
          } catch {
            // try next id
          }
        }
        logger.error(`[${slug}] All downloadMedia attempts failed for ${messageId}`);
        return null;
      },

      async testConnection(): Promise<{ ok: boolean; status?: number; error?: string }> {
        try {
          const resp = await axios.get(`${cleanBaseUrl}/status`, { headers, timeout: 10000 });
          return { ok: true, status: resp.status };
        } catch (err: any) {
          return {
            ok: false,
            status: err?.response?.status,
            error: err?.message || 'Unknown error',
          };
        }
      },
    };
  }
}
