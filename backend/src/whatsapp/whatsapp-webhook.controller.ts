import { Controller, Post, Body, Get, HttpCode, Logger, Res, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Public } from '../auth/auth.guard';
import { UazapiService } from './uazapi.service';
import { ChatService } from '../agent/chat.service';
import { AgentConfigService } from '../agent/agent-config.service';

interface UazapiWebhookPayload {
  // Uazapi v2 format (production)
  EventType?: string;
  owner?: string;
  token?: string;
  instanceName?: string;
  chatSource?: string;
  chat?: {
    phone?: string;
    wa_name?: string;
    wa_chatid?: string;
    owner?: string;
    [key: string]: any;
  };
  message?: {
    text?: string;
    content?: string;
    chatid?: string;
    chatlid?: string;
    fromMe?: boolean;
    messageid?: string;
    senderName?: string;
    sender?: string;
    sender_pn?: string;
    messageType?: string;
    messageTimestamp?: number;
    isGroup?: boolean;
    wasSentByApi?: boolean;
    type?: string;
    [key: string]: any;
  };
  // Legacy nested format
  event?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      imageMessage?: { caption?: string };
      videoMessage?: { caption?: string };
      documentMessage?: { caption?: string };
    };
    messageType?: string;
    messageTimestamp?: number;
  };
  // Legacy flat format
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
  private readonly recentPayloads: { ts: string; payload: any; parsed: any }[] = [];

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

  @Get('debug-payloads')
  debugPayloads() {
    return {
      count: this.recentPayloads.length,
      payloads: this.recentPayloads,
    };
  }

  @Post()
  @HttpCode(200)
  async handleWebhook(@Body() body: UazapiWebhookPayload, @Res() res: Response) {
    res.status(200).send('OK');

    try {
      this.logger.debug(`Raw webhook payload: ${JSON.stringify(body).slice(0, 500)}`);
      const parsed = this.parsePayload(body);
      const { phone, name, text, messageId, remoteJid } = parsed;

      this.recentPayloads.push({
        ts: new Date().toISOString(),
        payload: JSON.parse(JSON.stringify(body)),
        parsed: { phone, name, text: text?.slice(0, 100), messageId, remoteJid },
      });
      if (this.recentPayloads.length > 20) this.recentPayloads.shift();

      if (!phone || !text) {
        this.logger.debug(`Ignored webhook: phone=${phone}, text=${text ? 'yes' : 'null'}, event=${body.event || 'flat'}, keys=${Object.keys(body).join(',')}`);
        return;
      }

      this.logger.log(`WhatsApp message from ${name} (${phone}): ${text.slice(0, 80)}`);

      if (remoteJid && messageId) {
        this.uazapi.markAsRead(remoteJid, messageId);
      }

      this.bufferMessage(phone, name, text);
    } catch (err) {
      this.logger.error(`Webhook processing error: ${err instanceof Error ? err.stack : err}`);
    }
  }

  @Post('test-flow')
  @HttpCode(200)
  async testFlow(
    @Body() body: { message?: string; phone?: string; name?: string },
  ) {
    const steps: { step: string; status: string; durationMs?: number; detail?: string }[] = [];
    const msg = body.message || 'Teste de fluxo do agente';
    const phone = body.phone || '5500000000000';
    const name = body.name || 'Teste Diagnóstico';

    let step = 'uazapi_connection';
    steps.push({ step, status: this.uazapi.isConnected ? 'ok' : 'fail', detail: this.uazapi.isConnected ? 'connected' : 'not configured' });

    step = 'manager_phone';
    steps.push({ step, status: this.managerPhone ? 'ok' : 'warn', detail: this.managerPhone || 'not set' });

    step = 'agent_config';
    const cfgStart = Date.now();
    try {
      const cfg = await this.agentConfig.getConfig();
      steps.push({ step, status: 'ok', durationMs: Date.now() - cfgStart, detail: `model=${cfg?.chatModel}, buffer=${cfg?.bufferDelayMs}ms, maxIter=${cfg?.maxToolIterations}` });
    } catch (err) {
      steps.push({ step, status: 'fail', durationMs: Date.now() - cfgStart, detail: err instanceof Error ? err.message : String(err) });
      return { ok: false, steps };
    }

    step = 'chat_service';
    const chatStart = Date.now();
    try {
      const response = await this.chatService.chat({
        message: msg,
        sessionId: `diag-${Date.now()}`,
        systemName: 'Diagnóstico',
        customerName: name,
      });
      steps.push({
        step,
        status: 'ok',
        durationMs: Date.now() - chatStart,
        detail: `reply=${response.reply?.slice(0, 120)}... tools=${response.toolsUsed?.join(',')} duration=${response.totalDurationMs}ms`,
      });
    } catch (err) {
      steps.push({
        step,
        status: 'fail',
        durationMs: Date.now() - chatStart,
        detail: err instanceof Error ? err.stack?.slice(0, 500) : String(err),
      });
      return { ok: false, steps };
    }

    step = 'send_text';
    if (phone !== '5500000000000') {
      const sendStart = Date.now();
      try {
        const sent = await this.uazapi.sendText(phone, `[Teste] Agente funcionando.`);
        steps.push({ step, status: sent ? 'ok' : 'fail', durationMs: Date.now() - sendStart, detail: sent ? 'sent' : 'sendText returned false — check backend logs for details' });
      } catch (err) {
        steps.push({ step, status: 'fail', durationMs: Date.now() - sendStart, detail: err instanceof Error ? err.message : String(err) });
      }
    } else {
      steps.push({ step, status: 'skipped', detail: 'phone=5500000000000 (default test)' });
    }

    step = 'uazapi_direct_test';
    const directStart = Date.now();
    try {
      const axios = require('axios');
      const baseUrl = this.config.get<string>('UAZAPI_BASE_URL', '');
      const token = this.config.get<string>('UAZAPI_INSTANCE_TOKEN', '');
      const resp = await axios.post(`${baseUrl}/send/text`, { number: phone, text: '[Diag] teste direto' }, {
        headers: { 'Content-Type': 'application/json', token },
        timeout: 15000,
      });
      steps.push({ step, status: 'ok', durationMs: Date.now() - directStart, detail: `status=${resp.status} id=${resp.data?.messageid || resp.data?.id || 'n/a'}` });
    } catch (err: any) {
      const errDetail = `status=${err?.response?.status} data=${JSON.stringify(err?.response?.data)?.slice(0, 300)} msg=${err?.message}`;
      steps.push({ step, status: 'fail', durationMs: Date.now() - directStart, detail: errDetail });
    }

    const allOk = steps.every((s) => s.status === 'ok' || s.status === 'skipped');
    return { ok: allOk, steps };
  }

  private parsePayload(body: UazapiWebhookPayload): {
    phone: string | null;
    name: string;
    text: string | null;
    messageId: string | null;
    remoteJid: string | null;
  } {
    const empty = { phone: null, name: '', text: null, messageId: null, remoteJid: null };

    // Uazapi v2 format (EventType + message object)
    if (body.EventType && body.message) {
      if (body.message.fromMe || body.message.wasSentByApi || body.message.isGroup) return empty;

      const text = body.message.text || body.message.content || null;
      if (!text) return empty;

      const phone =
        body.chat?.phone ||
        (body.message.sender_pn ? this.jidToPhone(body.message.sender_pn) : null) ||
        (body.message.chatid ? this.jidToPhone(body.message.chatid) : null);

      if (!phone) return empty;

      const name =
        body.message.senderName ||
        body.chat?.wa_name ||
        phone;

      return {
        phone,
        name,
        text,
        messageId: body.message.messageid || null,
        remoteJid: body.message.chatid || null,
      };
    }

    // Legacy flat format
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

    // Legacy nested format
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

      this.logger.log(`Calling chatService.chat for ${phoneNumber}...`);
      const chatStart = Date.now();

      const response = await this.chatService.chat({
        message: combinedMessage,
        sessionId: `wa-${phoneNumber}`,
        systemName: 'WhatsApp',
        customerName: buffered.name,
      });

      this.logger.log(`chatService responded in ${Date.now() - chatStart}ms for ${phoneNumber}`);

      if (response.hasError || !response.reply) {
        this.logger.error(`Agent error for ${phoneNumber} (hasError=${response.hasError}). Escalating to manager.`);
        this.escalateToManager(buffered.name, phoneNumber, 'Erro interno do agente ao processar a mensagem');
        return;
      }

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
        const sent = await this.uazapi.sendText(phoneNumber, paragraphs[i]);
        this.logger.log(`sendText to ${phoneNumber} part ${i + 1}/${paragraphs.length}: ${sent ? 'ok' : 'failed'}`);

        if (!sent) {
          this.logger.warn(`sendText failed for ${phoneNumber}, retrying as single message`);
          const retrySent = await this.uazapi.sendText(phoneNumber, response.reply);
          if (!retrySent) {
            this.logger.error(`All send attempts failed for ${phoneNumber}. Escalating to manager.`);
            this.escalateToManager(buffered.name, phoneNumber, 'Falha ao enviar mensagem pelo WhatsApp');
          }
          break;
        }
      }

      const cfg = await this.agentConfig.getConfig();
      const displayName = cfg?.agentDisplayName || this.agentName;
      this.mirrorToManager(`*${displayName}*: ${response.reply}`);

      this.logger.log(
        `Reply sent to ${phoneNumber}. Tools: ${response.toolsUsed?.join(', ') || 'none'}. Duration: ${response.totalDurationMs}ms`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to process/reply to ${phoneNumber}: ${err instanceof Error ? err.stack : err}`,
      );
      this.escalateToManager(buffered.name, phoneNumber, err instanceof Error ? err.message : String(err));
    } finally {
      this.processingLock.delete(phoneNumber);
    }
  }

  private escalateToManager(customerName: string, customerPhone: string, reason: string): void {
    if (!this.managerPhone) {
      this.logger.error(`Cannot escalate: MANAGER_WHATSAPP not configured. Customer: ${customerName} (${customerPhone}), reason: ${reason}`);
      return;
    }
    const msg =
      `[ALERTA AGENTE]\n` +
      `O agente não conseguiu processar o atendimento de *${customerName}* (${customerPhone}).\n` +
      `Por favor, transfira para outro analista.\n` +
      `Motivo: ${reason.slice(0, 200)}`;
    this.uazapi.sendText(this.managerPhone, msg).catch((err) => {
      this.logger.error(`CRITICAL: Failed to escalate to manager: ${err}`);
    });
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
