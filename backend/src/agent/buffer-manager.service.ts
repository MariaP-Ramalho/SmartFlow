import { Injectable, Logger } from '@nestjs/common';
import { AgentConfigService } from './agent-config.service';
import { ChatService, ChatResponse, ManagerNotification, TransferCommand } from './chat.service';

const DEFAULT_BUFFER_DELAY_MS = 15000;
const PROCESSING_TIMEOUT_MS = 120_000;

export interface ApiMessageInput {
  customerPhone: string;
  customerName: string;
  systemName: string;
  message: string;
  sessionId?: string;
  atendimentoId?: number;
  agentTecnicoId?: number;
  isNewConversation?: boolean;
  attachments?: string[];
}

export interface ApiMessageResponse {
  status: 'superseded' | 'completed' | 'error';
  bufferedMessages: number;

  reply?: string;
  sessionId?: string;
  toolsUsed?: string[];
  knowledgeSourcesUsed?: string[];
  knowledgeHits?: { id: string; title: string; source?: string }[];
  pastCasesUsed?: { atendimentoId: number; sistema?: string; problemaPreview?: string }[];
  totalDurationMs?: number;
  conversationLength?: number;
  hasError?: boolean;

  managerNotifications?: ManagerNotification[];
  transferCommands?: TransferCommand[];
}

interface BufferEntry {
  messages: string[];
  metadata: {
    customerName: string;
    systemName: string;
    sessionId?: string;
    atendimentoId?: number;
    agentTecnicoId?: number;
  };
  timer: ReturnType<typeof setTimeout>;
  currentHolder: {
    resolve: (result: ApiMessageResponse) => void;
  };
  processingStarted: boolean;
}

@Injectable()
export class BufferManagerService {
  private readonly logger = new Logger(BufferManagerService.name);
  private readonly buffers = new Map<string, BufferEntry>();
  private readonly processingLock = new Map<string, number>();

  constructor(
    private readonly chatService: ChatService,
    private readonly agentConfig: AgentConfigService,
  ) {}

  async addMessage(input: ApiMessageInput): Promise<ApiMessageResponse> {
    const phone = this.normalizePhone(input.customerPhone);

    if (input.isNewConversation) {
      this.clearBuffer(phone);
      const sessionId = input.sessionId || `api-${phone}`;
      this.chatService.clearSession(sessionId);
      this.logger.log(`New conversation for ${phone}: session ${sessionId} cleared`);
    }

    const config = await this.agentConfig.getConfig();
    const delayMs = config?.bufferDelayMs || DEFAULT_BUFFER_DELAY_MS;

    const existing = this.buffers.get(phone);

    if (existing && !existing.processingStarted) {
      existing.messages.push(input.message);
      clearTimeout(existing.timer);

      if (input.atendimentoId) existing.metadata.atendimentoId = input.atendimentoId;
      if (input.agentTecnicoId) existing.metadata.agentTecnicoId = input.agentTecnicoId;

      const previousHolder = existing.currentHolder;

      const promise = new Promise<ApiMessageResponse>((resolve) => {
        existing.currentHolder = { resolve };
        existing.timer = setTimeout(() => this.flush(phone), delayMs);
      });

      previousHolder.resolve({
        status: 'superseded',
        bufferedMessages: existing.messages.length,
      });

      this.logger.log(
        `Buffered msg #${existing.messages.length} for ${phone} (previous req superseded)`,
      );

      return promise;
    }

    if (existing && existing.processingStarted) {
      this.logger.log(
        `Phone ${phone} is currently processing. Queueing new message for next batch.`,
      );
    }

    return new Promise<ApiMessageResponse>((resolve) => {
      const timer = setTimeout(() => this.flush(phone), delayMs);

      this.buffers.set(phone, {
        messages: [input.message],
        metadata: {
          customerName: input.customerName,
          systemName: input.systemName,
          sessionId: input.sessionId,
          atendimentoId: input.atendimentoId,
          agentTecnicoId: input.agentTecnicoId,
        },
        timer,
        currentHolder: { resolve },
        processingStarted: false,
      });

      this.logger.log(`Buffer started for ${phone} (delay=${delayMs}ms)`);
    });
  }

  private async flush(phone: string): Promise<void> {
    const entry = this.buffers.get(phone);
    if (!entry) return;

    entry.processingStarted = true;
    this.buffers.delete(phone);

    const lockStart = this.processingLock.get(phone);
    if (lockStart && Date.now() - lockStart < PROCESSING_TIMEOUT_MS) {
      this.logger.warn(`Phone ${phone} still locked from previous processing. Waiting...`);
    }

    this.processingLock.set(phone, Date.now());

    const combinedMessage = entry.messages.join('\n');
    const sessionId = entry.metadata.sessionId || `api-${phone}`;
    const messageCount = entry.messages.length;

    this.logger.log(
      `Flushing ${messageCount} msg(s) for ${phone}: "${combinedMessage.slice(0, 100)}"`,
    );

    try {
      const chatResponse: ChatResponse = await this.chatService.chat({
        message: combinedMessage,
        sessionId,
        systemName: entry.metadata.systemName,
        customerName: entry.metadata.customerName,
        atendimentoId: entry.metadata.atendimentoId,
        agentTecnicoId: entry.metadata.agentTecnicoId,
        excludeTools: ['search_knowledge'],
      });

      entry.currentHolder.resolve({
        status: 'completed',
        bufferedMessages: messageCount,
        reply: chatResponse.reply,
        sessionId: chatResponse.sessionId,
        toolsUsed: chatResponse.toolsUsed,
        knowledgeSourcesUsed: chatResponse.knowledgeSourcesUsed,
        knowledgeHits: chatResponse.knowledgeHits,
        pastCasesUsed: chatResponse.pastCasesUsed,
        totalDurationMs: chatResponse.totalDurationMs,
        conversationLength: chatResponse.conversationLength,
        hasError: chatResponse.hasError,
        managerNotifications: chatResponse.managerNotifications,
        transferCommands: chatResponse.transferCommands,
      });

      this.logger.log(
        `Response sent for ${phone}: ${chatResponse.reply?.length || 0} chars, ` +
        `tools=${chatResponse.toolsUsed?.join(',') || 'none'}, ` +
        `duration=${chatResponse.totalDurationMs}ms`,
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Processing failed for ${phone}: ${errorMsg}`);

      entry.currentHolder.resolve({
        status: 'error',
        bufferedMessages: messageCount,
        hasError: true,
        reply: 'Desculpe, ocorreu um erro interno ao processar sua mensagem.',
      });
    } finally {
      this.processingLock.delete(phone);
    }
  }

  private clearBuffer(phone: string): void {
    const existing = this.buffers.get(phone);
    if (existing) {
      clearTimeout(existing.timer);
      existing.currentHolder.resolve({
        status: 'superseded',
        bufferedMessages: existing.messages.length,
      });
      this.buffers.delete(phone);
    }
    this.processingLock.delete(phone);
  }

  getStatus(): {
    activeBuffers: number;
    processingLocks: number;
    phones: string[];
  } {
    return {
      activeBuffers: this.buffers.size,
      processingLocks: this.processingLock.size,
      phones: [...this.buffers.keys(), ...this.processingLock.keys()].filter(
        (v, i, a) => a.indexOf(v) === i,
      ),
    };
  }

  resetPhone(phone: string): { reset: boolean } {
    const normalized = this.normalizePhone(phone);
    this.clearBuffer(normalized);
    const sessionId = `api-${normalized}`;
    this.chatService.clearSession(sessionId);
    this.logger.log(`Phone ${normalized} fully reset`);
    return { reset: true };
  }

  private normalizePhone(raw: string): string {
    return raw.replace(/\D/g, '');
  }
}
