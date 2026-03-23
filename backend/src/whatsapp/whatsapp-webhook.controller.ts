import { Controller, Post, Body, Get, HttpCode, Logger, Res, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Public } from '../auth/auth.guard';
import { UazapiService } from './uazapi.service';
import { ChatService } from '../agent/chat.service';
import { AgentConfigService } from '../agent/agent-config.service';

interface UazapiWebhookPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
      id?: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: {
        text?: string;
      };
      imageMessage?: { caption?: string };
      videoMessage?: { caption?: string };
      documentMessage?: { caption?: string };
    };
    messageType?: string;
    messageTimestamp?: number;
  };
  // Alternative flat format some Uazapi versions use
  remoteJid?: string;
  fromMe?: boolean;
  pushName?: string;
  body?: string;
  messageId?: string;
}

@Public()
@Controller('webhook/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);
  private readonly messageBuffer = new Map<
    string,
    { texts: string[]; name: string; timer: ReturnType<typeof setTimeout> }
  >();
  private readonly BUFFER_DELAY_MS = 4000;
  private readonly processingLock = new Set<string>();
  private readonly managerPhone: string;
  private readonly agentName: string;

  constructor(
    private readonly uazapi: UazapiService,
    private readonly chatService: ChatService,
    private readonly config: ConfigService,
    private readonly agentConfig: AgentConfigService,
  ) {
    this.managerPhone = this.config.get<string>('MANAGER_WHATSAPP', '');
    this.agentName = this.config.get<string>('AGENT_DISPLAY_NAME', 'Renato Solves');
  }

  @Get('status')
  status() {
    return {
      connected: this.uazapi.isConnected,
      bufferedConversations: this.messageBuffer.size,
      processing: this.processingLock.size,
      timestamp: new Date().toISOString(),
    };
  }

  @Post()
  @HttpCode(200)
  async handleWebhook(@Body() body: UazapiWebhookPayload, @Res() res: Response) {
    res.status(200).send('OK');

    try {
      const { phone, name, text, messageId, remoteJid } = this.parsePayload(body);

      if (!phone || !text) return;

      this.logger.log(`WhatsApp message from ${name} (${phone}): ${text.slice(0, 80)}`);

      if (remoteJid && messageId) {
        this.uazapi.markAsRead(remoteJid, messageId);
      }

      this.bufferMessage(phone, name, text);
    } catch (err) {
      this.logger.error(`Webhook processing error: ${err instanceof Error ? err.message : err}`);
    }
  }

  private parsePayload(body: UazapiWebhookPayload): {
    phone: string | null;
    name: string;
    text: string | null;
    messageId: string | null;
    remoteJid: string | null;
  } {
    const empty = { phone: null, name: '', text: null, messageId: null, remoteJid: null };

    if (body.body && body.remoteJid && !body.fromMe) {
      const phone = this.jidToPhone(body.remoteJid);
      return {
        phone,
        name: body.pushName || phone,
        text: body.body,
        messageId: body.messageId || null,
        remoteJid: body.remoteJid,
      };
    }

    const isMessageEvent =
      body.event === 'messages' ||
      body.event === 'messages.upsert' ||
      body.event === 'message';

    if (!isMessageEvent) return empty;

    const data = body.data;
    if (!data?.key || data.key.fromMe) return empty;

    const text = this.extractText(data);
    if (!text) return empty;

    const remoteJid = data.key.remoteJid || '';
    const phone = this.jidToPhone(remoteJid);

    return {
      phone,
      name: data.pushName || phone,
      text,
      messageId: data.key.id || null,
      remoteJid,
    };
  }

  private async bufferMessage(phoneNumber: string, senderName: string, text: string) {
    const config = await this.agentConfig.getConfig();
    const delay = config?.bufferDelayMs || this.BUFFER_DELAY_MS;

    const existing = this.messageBuffer.get(phoneNumber);

    if (existing) {
      existing.texts.push(text);
      clearTimeout(existing.timer);
      existing.timer = setTimeout(
        () => this.flushAndProcess(phoneNumber),
        delay,
      );
    } else {
      const timer = setTimeout(
        () => this.flushAndProcess(phoneNumber),
        delay,
      );
      this.messageBuffer.set(phoneNumber, { texts: [text], name: senderName, timer });
    }
  }

  private async flushAndProcess(phoneNumber: string) {
    const buffered = this.messageBuffer.get(phoneNumber);
    if (!buffered) return;
    this.messageBuffer.delete(phoneNumber);

    if (this.processingLock.has(phoneNumber)) {
      this.logger.warn(`Already processing for ${phoneNumber}, re-buffering`);
      for (const t of buffered.texts) {
        this.bufferMessage(phoneNumber, buffered.name, t);
      }
      return;
    }

    this.processingLock.add(phoneNumber);
    const combinedMessage = buffered.texts.join('\n');

    this.logger.log(
      `Processing ${buffered.texts.length} buffered message(s) from ${buffered.name}: ${combinedMessage.slice(0, 100)}`,
    );

    try {
      this.uazapi.sendTyping(phoneNumber, 8000);

      this.mirrorToManager(`*${buffered.name}*: ${combinedMessage}`);

      const response = await this.chatService.chat({
        message: combinedMessage,
        sessionId: `wa-${phoneNumber}`,
        systemName: 'WhatsApp',
        customerName: buffered.name,
      });

      if (response.reply) {
        const paragraphs = response.reply
          .split(/\n{2,}/)
          .map((p) => p.trim())
          .filter(Boolean);

        for (let i = 0; i < paragraphs.length; i++) {
          if (i > 0) {
            await this.delay(1500);
            this.uazapi.sendTyping(phoneNumber, 2000);
            await this.delay(2000);
          }
          await this.uazapi.sendText(phoneNumber, paragraphs[i]);
        }

        const cfg = await this.agentConfig.getConfig();
        const displayName = cfg?.agentDisplayName || this.agentName;
        this.mirrorToManager(`*${displayName}*: ${response.reply}`);
      }

      this.logger.log(
        `Reply sent to ${phoneNumber}. Tools: ${response.toolsUsed?.join(', ') || 'none'}. Duration: ${response.totalDurationMs}ms`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to process/reply to ${phoneNumber}: ${err instanceof Error ? err.message : err}`,
      );
      await this.uazapi.sendText(
        phoneNumber,
        'Desculpe, estou com uma instabilidade no momento. Vou passar você para um dos nossos analistas.',
      );
    } finally {
      this.processingLock.delete(phoneNumber);
    }
  }

  private mirrorToManager(text: string): void {
    if (!this.managerPhone) return;
    this.uazapi.sendText(this.managerPhone, text).catch((err) => {
      this.logger.warn(`Failed to mirror to manager: ${err}`);
    });
  }

  private extractText(data: UazapiWebhookPayload['data']): string | null {
    if (!data?.message) return null;
    if (data.message.conversation) return data.message.conversation;
    if (data.message.extendedTextMessage?.text) return data.message.extendedTextMessage.text;
    if (data.message.imageMessage?.caption) return data.message.imageMessage.caption;
    if (data.message.videoMessage?.caption) return data.message.videoMessage.caption;
    if (data.message.documentMessage?.caption) return data.message.documentMessage.caption;
    return null;
  }

  private jidToPhone(jid: string): string {
    return jid.replace(/@.*$/, '').replace(/\D/g, '');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
