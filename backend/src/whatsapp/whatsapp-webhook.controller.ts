import { Controller, Post, Body, Get, HttpCode, Logger, Res, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { Public } from '../auth/auth.guard';
import { UazapiService } from './uazapi.service';
import { ChatService } from '../agent/chat.service';
import { AgentConfigService } from '../agent/agent-config.service';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { ReferenceCaseService } from '../agent/reference-case.service';
import OpenAI from 'openai';

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
    content?: any;
    chatid?: string;
    chatlid?: string;
    fromMe?: boolean;
    messageid?: string;
    senderName?: string;
    sender?: string;
    sender_pn?: string;
    messageType?: string;
    mediaType?: string;
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
    { texts: string[]; customerName: string; systemName?: string; timer: ReturnType<typeof setTimeout> }
  >();
  private readonly BUFFER_DELAY_MS = 15000;
  private readonly PROCESSING_TIMEOUT_MS = 120_000; // 2 min max per chat call
  private readonly processingLock = new Map<string, number>(); // phone → start timestamp
  private readonly recentPayloads: { ts: string; payload: any; parsed: any }[] = [];
  /** Tracks which customer name is active on each phone/channel. */
  private readonly activeClientByPhone = new Map<string, string>();
  private readonly sendFailCountByPhone = new Map<string, number>();
  /** Tracks how many times a message was re-buffered due to lock contention. */
  private readonly rebufferCount = new Map<string, number>();
  /** Recent messages sent BY the agent (phone → last N text snippets) for detecting human analyst intervention. */
  private readonly recentAgentSent = new Map<string, string[]>();
  private readonly AGENT_SENT_HISTORY_SIZE = 20;
  /** Cooldown after analyst intervention: phone → timestamp when cooldown expires. */
  private readonly analystCooldown = new Map<string, number>();
  private readonly ANALYST_COOLDOWN_MS = 30_000;
  /** Tracks if an analyst collaborated during the current atendimento. */
  private readonly analystCollaborated = new Map<string, boolean>();
  /** Tracks the active atendimento ID for each phone/channel. */
  private readonly activeAtendimentoByPhone = new Map<string, number>();

  /** Mensagens do sistema ZapFlow que NÃO são de clientes reais e devem ser ignoradas. */
  private static readonly ZAPFLOW_SYSTEM_PATTERNS: RegExp[] = [
    /^Erro ao enviar mensagem:/i,
    /^Mensagem de transbordo:/i,
    /^O número do seu protocolo é/i,
    /^Cliente aguardando atendimento/i,
    /^Aguarde o retorno do cliente/i,
    /^Por favor, me informe como posso te ajudar/i,
    /^Prezado\(a\) .+, recebemos sua demanda/i,
  ];

  /** Detects and parses the "new atendimento" notification from ZapFlow. */
  private static readonly NEW_ATENDIMENTO_REGEX =
    /^Olá .+, foi encaminhado um atendimento[\s\S]*?Atendimento:\s*(\d+)\s*\n\s*Cliente:\s*(.+?)\s*\n\s*Entidade:\s*(.+?)\s*\n\s*Sistema:\s*(.+?)$/im;

  /** Formato ZapFlow: "*Nome diz:*\n\nMensagem real do cliente" */
  private static readonly ZAPFLOW_CLIENT_MSG_REGEX = /^\*(.+?)\s+diz:\*\s*\n+([\s\S]+)$/;

  private readonly openai: OpenAI | null;
  /** Cached agent tecnico ID from ZapFlow (resolved once on first use). */
  private resolvedAgentTecnicoId: number | undefined;

  constructor(
    private readonly uazapi: UazapiService,
    private readonly chatService: ChatService,
    private readonly agentConfig: AgentConfigService,
    private readonly waConfig: WhatsAppConfigService,
    private readonly configService: ConfigService,
    private readonly referenceCaseService: ReferenceCaseService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY') || this.configService.get<string>('llm.openai.apiKey');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
    const tecId = this.configService.get<string>('AGENT_TECNICO_ID');
    if (tecId) this.resolvedAgentTecnicoId = parseInt(tecId, 10) || undefined;
  }

  private get managerPhone(): string {
    return this.waConfig.getManagerPhone();
  }

  private get agentName(): string {
    return this.waConfig.getAgentDisplayName();
  }

  @Get('status')
  status() {
    const now = Date.now();
    const locks: Record<string, number> = {};
    this.processingLock.forEach((start, phone) => {
      locks[phone] = Math.round((now - start) / 1000);
    });
    return {
      connected: this.uazapi.isConnected,
      bufferedConversations: this.messageBuffer.size,
      processingLocks: locks,
      activeClients: Object.fromEntries(this.activeClientByPhone),
      sendFailCounts: Object.fromEntries(this.sendFailCountByPhone),
      analystCooldowns: Object.fromEntries(
        [...this.analystCooldown.entries()].map(([p, t]) => [p, Math.max(0, Math.round((t - now) / 1000))]),
      ),
      analystCollaborations: Object.fromEntries(this.analystCollaborated),
      activeAtendimentos: Object.fromEntries(this.activeAtendimentoByPhone),
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

  @Post('reset-channel')
  @HttpCode(200)
  resetChannel(@Body() body: { phone?: string }) {
    const phone = body.phone ? this.normalizePhone(body.phone) : null;
    if (!phone) {
      this.processingLock.clear();
      this.sendFailCountByPhone.clear();
      this.rebufferCount.clear();
      this.activeClientByPhone.clear();
      this.recentAgentSent.clear();
      this.analystCooldown.clear();
      this.analystCollaborated.clear();
      this.activeAtendimentoByPhone.clear();
      this.logger.log('All channels reset');
      return { reset: 'all' };
    }
    this.processingLock.delete(phone);
    this.sendFailCountByPhone.delete(phone);
    this.rebufferCount.delete(phone);
    this.activeClientByPhone.delete(phone);
    this.recentAgentSent.delete(phone);
    this.analystCooldown.delete(phone);
    this.analystCollaborated.delete(phone);
    this.activeAtendimentoByPhone.delete(phone);
    this.chatService.clearSession(`wa-${phone}`);
    this.logger.log(`Channel ${phone} reset`);
    return { reset: phone };
  }

  @Post()
  @HttpCode(200)
  async handleWebhook(@Body() body: UazapiWebhookPayload, @Res() res: Response) {
    res.status(200).send('OK');

    try {
      this.logger.debug(`Raw webhook payload: ${JSON.stringify(body).slice(0, 500)}`);
      const parsed = this.parsePayload(body);
      const { phone, name, text, messageId, remoteJid, mediaType, isFromMe } = parsed;

      this.recentPayloads.push({
        ts: new Date().toISOString(),
        payload: JSON.parse(JSON.stringify(body)),
        parsed: { phone, name, text: text?.slice(0, 100), messageId, remoteJid, mediaType, isFromMe },
      });
      if (this.recentPayloads.length > 50) this.recentPayloads.shift();

      if (mediaType) {
        this.logger.log(`Media detected from ${phone}: type=${mediaType}, msgType=${body.message?.messageType}, rawMediaType=${body.message?.mediaType}, messageId=${messageId}`);
      }

      if (!phone || (!text && !mediaType)) {
        const rawMsgType = body.message?.messageType || body.message?.type || '';
        const rawMediaType = body.message?.mediaType || '';
        this.logger.debug(`Ignored webhook: phone=${phone}, text=${text ? 'yes' : 'null'}, media=${mediaType}, msgType=${rawMsgType}, rawMedia=${rawMediaType}, event=${body.EventType || body.event || 'flat'}, keys=${Object.keys(body).join(',')}`);
        return;
      }

      // --- Detect fromMe messages: agent echo vs analyst intervention ---
      if (isFromMe) {
        const msgText = text || '';
        if (this.isAgentEcho(phone, msgText)) {
          this.logger.debug(`Ignored agent echo for ${phone}: "${msgText.slice(0, 60)}"`);
          return;
        }

        this.logger.warn(`ANALYST INTERVENTION detected on ${phone}: "${msgText.slice(0, 80)}"`);
        this.analystCooldown.set(phone, Date.now() + this.ANALYST_COOLDOWN_MS);
        this.analystCollaborated.set(phone, true);

        const sessionId = `wa-${phone}`;
        this.chatService.injectAnalystGuidance(sessionId, 'Cássio (gestor)', msgText);

        this.broadcastMirrorMessage(`*[Intervenção Cássio]* (${phone}): ${msgText}`);
        return;
      }

      if (remoteJid && messageId) {
        this.uazapi.markAsRead(remoteJid, messageId);
      }

      // --- Image processing ---
      let effectiveText = text || '';
      if (mediaType === 'image' && messageId) {
        const imageDesc = await this.processImage(messageId, text || undefined);
        if (imageDesc) {
          effectiveText = imageDesc;
          this.logger.log(`Image processed for ${phone}: "${imageDesc.slice(0, 80)}"`);
        } else if (!text) {
          this.logger.warn(`Image from ${phone} could not be analyzed and has no caption. Asking client to describe.`);
          const fallback = 'Recebi sua imagem, mas não consegui visualizar. Pode descrever o que aparece na tela?';
          const sent = await this.sendWithRetry(phone, fallback, 2);
          if (sent) {
            this.broadcastMirrorMessage(`*${this.agentName}*: ${fallback}`);
          }
          return;
        }
      }

      // --- ZapFlow message parsing ---
      const zapflowParsed = this.parseZapFlowMessage(effectiveText);

      if (zapflowParsed.isSystemMessage) {
        this.logger.debug(`Ignored ZapFlow system message: "${effectiveText.slice(0, 80)}"`);
        return;
      }

      if (zapflowParsed.isNewAtendimento) {
        this.logger.log(`New atendimento detected on channel ${phone}. Full reset and starting conversation.`);
        this.chatService.clearSession(`wa-${phone}`);
        this.processingLock.delete(phone);
        this.sendFailCountByPhone.delete(phone);
        this.rebufferCount.delete(phone);
        this.recentAgentSent.delete(phone);
        this.analystCooldown.delete(phone);
        this.analystCollaborated.delete(phone);
        this.activeAtendimentoByPhone.delete(phone);

        const atd = zapflowParsed.atendimentoData;
        const clientName = atd?.cliente || name;
        const systemName = atd?.sistema || 'WhatsApp';
        const greeting =
          `Novo atendimento #${atd?.numero || '?'}. ` +
          `Cliente: ${clientName}. ` +
          `Entidade: ${atd?.entidade || '?'}. ` +
          `Sistema: ${systemName}. ` +
          `O cliente está aguardando. Cumprimente e pergunte como pode ajudar.`;

        this.activeClientByPhone.set(phone, clientName);
        const ateId = parseInt(atd?.numero || '0', 10);
        if (ateId > 0) {
          this.activeAtendimentoByPhone.set(phone, ateId);
        }
        this.logger.log(`Starting atendimento #${ateId}: ${clientName} (${systemName}) on ${phone}`);
        this.bufferMessage(phone, clientName, greeting, systemName);
        return;
      }

      const currentOwner = this.activeClientByPhone.get(phone);
      let actualName: string;
      let actualText: string;

      if (zapflowParsed.clientName && zapflowParsed.clientMessage) {
        actualText = zapflowParsed.clientMessage;
        if (!currentOwner) {
          actualName = zapflowParsed.clientName;
        } else if (this.isSameClient(currentOwner, zapflowParsed.clientName)) {
          actualName = currentOwner;
        } else {
          actualName = currentOwner;
          this.logger.warn(
            `Name mismatch on ${phone}: owner="${currentOwner}", msg="${zapflowParsed.clientName}". Passing message through without forwarded tag.`,
          );
        }
      } else {
        actualName = currentOwner || name;
        actualText = effectiveText;
      }

      this.logger.log(`WhatsApp from ${actualName} (via ${phone}): ${actualText.slice(0, 80)}`);

      this.bufferMessage(phone, actualName, actualText);
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

    step = 'mirror_recipients';
    const mirrors = this.waConfig.getMirrorRecipientPhones();
    steps.push({
      step,
      status: mirrors.length > 0 ? 'ok' : 'warn',
      detail:
        mirrors.length > 0
          ? `count=${mirrors.length}: ${mirrors.join(', ')}`
          : 'nenhum destinatário de espelhamento (configure gestor e/ou extras)',
    });

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
      const baseUrl = this.waConfig.getUazapiBaseUrl();
      const token = this.waConfig.getUazapiToken();
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

  private static readonly IMAGE_TYPES = new Set([
    'image', 'imageMessage', 'ImageMessage', 'stickerMessage', 'StickerMessage',
  ]);

  private parsePayload(body: UazapiWebhookPayload): {
    phone: string | null;
    name: string;
    text: string | null;
    messageId: string | null;
    remoteJid: string | null;
    mediaType: string | null;
    isFromMe: boolean;
  } {
    const empty = { phone: null, name: '', text: null, messageId: null, remoteJid: null, mediaType: null, isFromMe: false };

    // Uazapi v2 format (EventType + message object)
    if (body.EventType && body.message) {
      if (body.message.isGroup) return empty;

      const isFromMe = !!(body.message.fromMe || body.message.wasSentByApi);

      const msgType = body.message.messageType || body.message.type || null;
      const rawMediaType = body.message.mediaType || '';
      const isMedia =
        (msgType && WhatsAppWebhookController.IMAGE_TYPES.has(msgType)) ||
        rawMediaType.toLowerCase().startsWith('image');

      // Extract text: for media messages caption may be in content.caption
      const contentObj = body.message.content;
      const caption =
        (typeof contentObj === 'object' && contentObj !== null)
          ? (contentObj as any).caption || (contentObj as any).text || null
          : null;
      const text = body.message.text || caption || (typeof contentObj === 'string' ? contentObj : null) || null;

      if (!text && !isMedia) return empty;

      const rawPhone =
        body.chat?.phone ||
        body.message.sender_pn ||
        body.message.chatid ||
        null;
      const phone = rawPhone ? this.normalizePhone(rawPhone) : null;

      if (!phone) return empty;

      const name =
        body.message.senderName ||
        body.chat?.wa_name ||
        phone;

      return {
        phone,
        name,
        text,
        messageId: body.message.id || body.message.messageid || null,
        remoteJid: body.message.chatid || null,
        mediaType: isMedia ? 'image' : null,
        isFromMe,
      };
    }

    // Legacy flat format
    if (body.body && body.remoteJid) {
      const phone = this.jidToPhone(body.remoteJid);
      return {
        phone,
        name: body.pushName || phone,
        text: body.body,
        messageId: body.messageId || null,
        remoteJid: body.remoteJid,
        mediaType: null,
        isFromMe: !!body.fromMe,
      };
    }

    // Legacy nested format
    const isMessageEvent =
      body.event === 'messages' ||
      body.event === 'messages.upsert' ||
      body.event === 'message';

    if (!isMessageEvent) return empty;

    const data = body.data;
    if (!data?.key) return empty;

    const text = this.extractText(data);
    const hasImage = !!data.message?.imageMessage;
    if (!text && !hasImage) return empty;

    const remoteJid = data.key.remoteJid || '';
    const phone = this.jidToPhone(remoteJid);

    return {
      phone,
      name: data.pushName || phone,
      text,
      messageId: data.key.id || null,
      remoteJid,
      mediaType: hasImage ? 'image' : null,
      isFromMe: !!data.key.fromMe,
    };
  }

  private async bufferMessage(phone: string, customerName: string, text: string, systemName?: string) {
    const config = await this.agentConfig.getConfig();
    const delay = config?.bufferDelayMs || this.BUFFER_DELAY_MS;

    if (!this.activeClientByPhone.has(phone)) {
      this.activeClientByPhone.set(phone, customerName);
    }

    const existing = this.messageBuffer.get(phone);

    if (existing) {
      existing.texts.push(text);
      if (systemName) existing.systemName = systemName;
      clearTimeout(existing.timer);
      existing.timer = setTimeout(
        () => this.flushAndProcess(phone),
        delay,
      );
    } else {
      const timer = setTimeout(
        () => this.flushAndProcess(phone),
        delay,
      );
      this.messageBuffer.set(phone, {
        texts: [text],
        customerName,
        systemName,
        timer,
      });
    }
  }

  private isLockExpired(phone: string): boolean {
    const lockStart = this.processingLock.get(phone);
    if (lockStart == null) return false;
    return Date.now() - lockStart > this.PROCESSING_TIMEOUT_MS;
  }

  private async flushAndProcess(phone: string) {
    const buffered = this.messageBuffer.get(phone);
    if (!buffered) return;
    this.messageBuffer.delete(phone);

    if (this.processingLock.has(phone)) {
      if (this.isLockExpired(phone)) {
        this.logger.warn(`Processing lock for ${phone} expired after ${this.PROCESSING_TIMEOUT_MS}ms. Force-releasing.`);
        this.processingLock.delete(phone);
        this.rebufferCount.delete(phone);
      } else {
        const count = (this.rebufferCount.get(phone) || 0) + 1;
        this.rebufferCount.set(phone, count);
        if (count > 5) {
          this.logger.error(`Re-buffer limit reached for ${phone} (${count} times). Force-releasing lock and processing.`);
          this.processingLock.delete(phone);
          this.rebufferCount.delete(phone);
        } else {
          this.logger.warn(`Already processing ${phone} (attempt #${count}), re-buffering ${buffered.texts.length} msg(s)`);
          for (const t of buffered.texts) {
            this.bufferMessage(phone, buffered.customerName, t, buffered.systemName);
          }
          return;
        }
      }
    }

    // Check analyst cooldown – if an analyst intervened recently, wait before responding
    const cooldownExpiry = this.analystCooldown.get(phone);
    if (cooldownExpiry && Date.now() < cooldownExpiry) {
      const remainMs = cooldownExpiry - Date.now();
      this.logger.log(`Analyst cooldown active for ${phone} (${Math.round(remainMs / 1000)}s remaining). Delaying agent response.`);
      await this.delay(remainMs);
    }
    this.analystCooldown.delete(phone);

    this.processingLock.set(phone, Date.now());
    this.rebufferCount.delete(phone);
    const combinedMessage = buffered.texts.join('\n');

    this.logger.log(
      `Processing ${buffered.texts.length} buffered msg(s) from ${buffered.customerName} (${phone}): ${combinedMessage.slice(0, 100)}`,
    );

    try {
      this.uazapi.sendTyping(phone, 8000);

      this.broadcastMirrorMessage(`*${buffered.customerName}*: ${combinedMessage}`);

      this.logger.log(`Calling chatService.chat for wa-${phone}...`);
      const chatStart = Date.now();

      const chatPromise = this.chatService.chat({
        message: combinedMessage,
        sessionId: `wa-${phone}`,
        systemName: buffered.systemName || 'WhatsApp',
        customerName: buffered.customerName,
        atendimentoId: this.activeAtendimentoByPhone.get(phone),
        agentTecnicoId: this.resolvedAgentTecnicoId,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Chat processing timed out after ${this.PROCESSING_TIMEOUT_MS}ms`)), this.PROCESSING_TIMEOUT_MS),
      );
      const response = await Promise.race([chatPromise, timeoutPromise]);

      this.logger.log(`chatService responded in ${Date.now() - chatStart}ms for ${phone}`);

      if (response.hasError || !response.reply) {
        this.logger.error(`Agent error for ${phone} (hasError=${response.hasError}). Escalating to manager.`);
        this.escalateToManager(buffered.customerName, phone, 'Erro interno do agente ao processar a mensagem');
        return;
      }

      const cleanReply = this.sanitizeForWhatsApp(response.reply);
      const sent = await this.sendWithRetry(phone, cleanReply, 3);
      this.logger.log(`sendText to ${phone}: ${sent ? 'ok' : 'FAILED after retries'}`);

      if (!sent) {
        this.logger.error(`Failed to deliver reply to ${phone} after retries. Notifying manager.`);
        this.sendPrimaryManagerOnly(
          `[FALHA ENVIO]\nO agente gerou resposta para *${buffered.customerName}* (${phone}) mas não conseguiu entregar via WhatsApp.\nResposta gerada: ${response.reply.slice(0, 300)}`,
        );
      } else {
        this.sendFailCountByPhone.delete(phone);
      }

      const displayName = this.agentName;
      if (sent) {
        this.broadcastMirrorMessage(`*${displayName}*: ${cleanReply}`);
      }

      if (response.managerNotifications?.length > 0) {
        for (const notif of response.managerNotifications) {
          const notifMsg =
            `[${this.reasonLabel(notif.reason)}]\n` +
            `Cliente: *${buffered.customerName}* (${phone})\n` +
            `${notif.message}` +
            (notif.customerSummary ? `\nResumo: ${notif.customerSummary}` : '');

          if (notif.reason === 'issue_resolved') {
            this.logger.log(`Issue resolved for ${phone}. Sending @zapflow finalization command.`);

            const zapflowCmd = `@zapflow finalizar atendimento ${notif.message}`;
            this.trackAgentSent(phone, zapflowCmd);
            this.uazapi.sendText(phone, zapflowCmd).then((ok) => {
              if (ok) {
                this.logger.log(`ZapFlow finalization command sent to ${phone}`);
              } else {
                this.logger.error(`Failed to send ZapFlow finalization command to ${phone}`);
              }
            });

            if (this.analystCollaborated.get(phone)) {
              this.saveReferenceCaseFromSession(phone, buffered.customerName, buffered.systemName, notif.message, notif.customerSummary);
              this.analystCollaborated.delete(phone);
            }

            const closeMsg =
              `[ATENDIMENTO RESOLVIDO]\n` +
              `Cliente: *${buffered.customerName}* (${phone})\n` +
              `${notif.message}` +
              (notif.customerSummary ? `\nResumo: ${notif.customerSummary}` : '');
            this.sendClosureNotification(closeMsg);
          } else {
            this.sendPrimaryManagerOnly(notifMsg);
          }
        }
      }

      // --- Process transfer commands ---
      if (response.transferCommands?.length > 0) {
        for (const cmd of response.transferCommands) {
          const zapflowCmd = `@zapflow transferir id_do_atendimento=${cmd.atendimentoId}, idnovocolaborador=${cmd.targetTecnicoId}, motivo=${cmd.reason}`;
          this.logger.log(`Sending transfer command: ${zapflowCmd.slice(0, 150)}`);
          this.trackAgentSent(phone, zapflowCmd);
          this.uazapi.sendText(phone, zapflowCmd).then((ok) => {
            if (ok) {
              this.logger.log(`Transfer command sent for atendimento ${cmd.atendimentoId} → ${cmd.targetTecnicoName}`);
            } else {
              this.logger.error(`Failed to send transfer command for atendimento ${cmd.atendimentoId}`);
              this.sendPrimaryManagerOnly(
                `[FALHA TRANSFERÊNCIA]\nComando @zapflow transferir falhou para atendimento #${cmd.atendimentoId}.\n` +
                `Destino: ${cmd.targetTecnicoName} (ID ${cmd.targetTecnicoId})\nMotivo: ${cmd.reason.slice(0, 200)}`,
              );
            }
          });
        }
      }

      this.logger.log(
        `Reply sent to ${phone}. Tools: ${response.toolsUsed?.join(', ') || 'none'}. Notifications: ${response.managerNotifications?.length || 0}. Transfers: ${response.transferCommands?.length || 0}. Duration: ${response.totalDurationMs}ms`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to process/reply to ${phone}: ${err instanceof Error ? err.stack : err}`,
      );
      this.escalateToManager(buffered.customerName, phone, err instanceof Error ? err.message : String(err));
    } finally {
      this.processingLock.delete(phone);
    }
  }

  private saveReferenceCaseFromSession(
    phone: string,
    customerName: string,
    systemName: string | undefined,
    problemSolution: string,
    customerSummary?: string,
  ): void {
    const sessionId = `wa-${phone}`;
    const history = this.chatService.getConversationHistory(sessionId);
    if (!history || history.length === 0) {
      this.logger.warn(`Cannot save reference case for ${phone}: no conversation history`);
      return;
    }

    const parts = problemSolution.match(/Resumo do problema:\s*(.+?)\.?\s*Resumo da solução:\s*(.+)/i);
    const problemSummary = parts?.[1] || customerSummary || '';
    const solutionSummary = parts?.[2] || problemSolution;

    this.referenceCaseService.saveReferenceCase({
      phone,
      customerName,
      systemName,
      analystName: 'Cássio',
      conversation: history,
      problemSummary,
      solutionSummary,
    });

    this.logger.log(`Reference case queued for saving: ${customerName} (${phone})`);
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

  private reasonLabel(reason: string): string {
    const labels: Record<string, string> = {
      escalation_needed: 'ESCALAÇÃO',
      possible_bug: 'POSSÍVEL BUG',
      cannot_handle: 'NÃO CONSIGO RESOLVER',
      needs_system_access: 'PRECISA ACESSO AO SISTEMA',
      client_requested_human: 'CLIENTE PEDIU HUMANO',
      max_attempts_reached: 'MÁXIMO DE TENTATIVAS',
      issue_resolved: 'ATENDIMENTO RESOLVIDO',
      other: 'NOTIFICAÇÃO',
    };
    return labels[reason] || 'NOTIFICAÇÃO AGENTE';
  }

  private parseZapFlowMessage(rawText: string): {
    isSystemMessage: boolean;
    isNewAtendimento?: boolean;
    atendimentoData?: { numero: string; cliente: string; entidade: string; sistema: string };
    clientName?: string;
    clientMessage?: string;
  } {
    const trimmed = rawText.trim();

    const atdMatch = WhatsAppWebhookController.NEW_ATENDIMENTO_REGEX.exec(trimmed);
    if (atdMatch) {
      return {
        isSystemMessage: false,
        isNewAtendimento: true,
        atendimentoData: {
          numero: atdMatch[1].trim(),
          cliente: atdMatch[2].trim(),
          entidade: atdMatch[3].trim(),
          sistema: atdMatch[4].trim(),
        },
      };
    }

    if (/^Olá .+, foi encaminhado um atendimento/i.test(trimmed)) {
      return { isSystemMessage: false, isNewAtendimento: true };
    }

    for (const pattern of WhatsAppWebhookController.ZAPFLOW_SYSTEM_PATTERNS) {
      if (pattern.test(trimmed)) {
        return { isSystemMessage: true };
      }
    }

    const match = WhatsAppWebhookController.ZAPFLOW_CLIENT_MSG_REGEX.exec(trimmed);
    if (match) {
      const clientName = match[1].trim();
      const clientMessage = match[2].trim();

      if (!clientMessage) return { isSystemMessage: true };

      for (const pattern of WhatsAppWebhookController.ZAPFLOW_SYSTEM_PATTERNS) {
        if (pattern.test(clientMessage)) {
          return { isSystemMessage: true };
        }
      }

      return { isSystemMessage: false, clientName, clientMessage };
    }

    return { isSystemMessage: false };
  }

  /** Espelhamento cliente/agente: todos os números (gestor principal + extras). */
  private broadcastMirrorMessage(text: string): void {
    const phones = this.waConfig.getMirrorRecipientPhones();
    if (phones.length === 0) {
      this.logger.warn('No mirror recipients configured; skipping mirror broadcast');
      return;
    }
    for (const phone of phones) {
      this.uazapi.sendText(phone, text).catch((err) => {
        this.logger.warn(`Failed to mirror to ${phone}: ${err}`);
      });
    }
  }

  /** Alertas operacionais (bug, escalação, erro): somente gestor principal (Cássio). */
  private sendPrimaryManagerOnly(text: string): void {
    if (!this.managerPhone) return;
    this.uazapi.sendText(this.managerPhone, text).catch((err) => {
      this.logger.warn(`Failed to notify primary manager: ${err}`);
    });
  }

  /** Notificação de encerramento: envia para todos os gestores de espelhamento (Cássio + Carolina + extras). */
  private sendClosureNotification(text: string): void {
    const phones = this.waConfig.getMirrorRecipientPhones();
    if (phones.length === 0) {
      this.logger.warn('No mirror recipients for closure notification');
      return;
    }
    for (const phone of phones) {
      this.uazapi.sendText(phone, text).catch((err) => {
        this.logger.warn(`Failed to send closure notification to ${phone}: ${err}`);
      });
    }
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

  /** Strips everything except digits from any phone/jid string. */
  private normalizePhone(raw: string): string {
    return raw.replace(/@.*$/, '').replace(/\D/g, '');
  }

  private jidToPhone(jid: string): string {
    return this.normalizePhone(jid);
  }

  private static readonly NAME_NOISE = new Set([
    'de', 'da', 'do', 'dos', 'das', 'e', 'a', 'o', 'em',
  ]);

  private static readonly NAME_TITLES = /\b(senhor|senhora|sr\.?|sra\.?|dr\.?|dra\.?)\b/gi;

  private normalizeName(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(WhatsAppWebhookController.NAME_TITLES, '')
      .replace(/[^a-z\s]/g, '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private isSameClient(nameA: string, nameB: string): boolean {
    const a = this.normalizeName(nameA);
    const b = this.normalizeName(nameB);

    if (a === b) return true;
    if (a.includes(b) || b.includes(a)) return true;

    const wordsA = a.split(' ').filter((w) => w.length >= 4 && !WhatsAppWebhookController.NAME_NOISE.has(w));
    const wordsB = b.split(' ').filter((w) => w.length >= 4 && !WhatsAppWebhookController.NAME_NOISE.has(w));

    for (const w of wordsA) {
      if (wordsB.includes(w)) return true;
    }

    return false;
  }

  private sanitizeForWhatsApp(text: string): string {
    let s = text;
    s = s.replace(/[\u201C\u201D\u201E\u201F]/g, '"');
    s = s.replace(/[\u2018\u2019\u201A\u201B]/g, "'");
    s = s.replace(/[\u2014\u2013]/g, '-');
    s = s.replace(/\u2026/g, '...');
    s = s.replace(/\*\*(.+?)\*\*/g, '$1');
    s = s.replace(/__(.+?)__/g, '$1');
    s = s.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1');
    s = s.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '$1');
    s = s.replace(/`([^`]+)`/g, '$1');
    s = s.replace(/^#{1,6}\s+/gm, '');
    s = s.replace(/^[-*]\s+/gm, '');
    s = s.replace(/\n{3,}/g, '\n\n');
    return s.trim();
  }

  private async processImage(messageId: string, caption?: string): Promise<string | null> {
    if (!this.openai) {
      this.logger.warn('OpenAI not configured — cannot analyze image');
      return caption ? `[Imagem enviada] ${caption}` : null;
    }

    try {
      const media = await this.uazapi.downloadMedia(messageId);
      if (!media) {
        this.logger.warn(`Could not download media for message ${messageId}`);
        return caption ? `[Imagem enviada] ${caption}` : null;
      }

      const base64Url = `data:${media.mimetype};base64,${media.base64}`;

      const promptText = caption
        ? `O cliente enviou esta imagem com a seguinte legenda: "${caption}". Descreva o que voce ve na imagem, focando em elementos relevantes para suporte tecnico (telas de sistema, erros, mensagens). Seja conciso em 2-3 frases.`
        : 'O cliente enviou esta imagem. Descreva o que voce ve, focando em elementos relevantes para suporte tecnico (telas de sistema, erros, mensagens). Seja conciso em 2-3 frases.';

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: base64Url, detail: 'low' } },
            { type: 'text', text: promptText },
          ] as OpenAI.ChatCompletionContentPart[],
        }],
        max_tokens: 300,
        temperature: 0.2,
      });

      const description = response.choices?.[0]?.message?.content?.trim();
      if (!description) {
        this.logger.warn('Vision API returned empty description');
        return caption ? `[Imagem enviada] ${caption}` : null;
      }

      const prefix = caption ? `[Imagem enviada com legenda: "${caption}"]` : '[Imagem enviada pelo cliente]';
      return `${prefix} Descricao da imagem: ${description}`;
    } catch (err: any) {
      this.logger.error(`Vision analysis failed: ${err?.message}`);
      return caption ? `[Imagem enviada] ${caption}` : null;
    }
  }

  private trackAgentSent(phone: string, text: string): void {
    const snippet = text.slice(0, 80).toLowerCase().trim();
    const list = this.recentAgentSent.get(phone) || [];
    list.push(snippet);
    if (list.length > this.AGENT_SENT_HISTORY_SIZE) list.shift();
    this.recentAgentSent.set(phone, list);
  }

  private isAgentEcho(phone: string, text: string): boolean {
    const snippet = text.slice(0, 80).toLowerCase().trim();
    const list = this.recentAgentSent.get(phone);
    if (!list || list.length === 0) return false;
    return list.some((s) => snippet.startsWith(s) || s.startsWith(snippet));
  }

  private async sendWithRetry(phone: string, text: string, maxRetries: number): Promise<boolean> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const sent = await this.uazapi.sendText(phone, text);
      if (sent) {
        this.trackAgentSent(phone, text);
        return true;
      }
      if (attempt < maxRetries) {
        this.logger.warn(`sendText to ${phone} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in 3s...`);
        await this.delay(3000);
      }
    }
    return false;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
