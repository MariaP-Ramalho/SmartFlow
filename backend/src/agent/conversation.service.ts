import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LlmService } from './llm/llm.service';
import { LLMMessage } from './llm/llm.interface';
import { TicketsService } from '../tickets/tickets.service';
import { AuditService } from '../audit/audit.service';
import { ZapFlowPgService } from '../zapflow/zapflow-pg.service';
import { ToolRegistry } from './tools/tool-registry';
import { AgentContext, ToolResult } from './tools/tool.interface';
import { TicketDocument } from '../tickets/schemas/ticket.schema';
import { buildAgentSystemPrompt } from './system-prompt';

const MAX_TOOL_ITERATIONS = 5;
const MAX_ATTEMPTS = 3;

export interface StartConversationInput {
  zapflowAteId: number;
  zapflowSisId?: number;
  zapflowEntId?: number;
  customerPhone: string;
  customerName: string;
  systemName: string;
  initialMessage: string;
  zapflowConversationId?: string;
  attachments?: string[];
}

export interface HandleMessageInput {
  ticketId?: string;
  zapflowAteId?: number;
  message: string;
  attachments?: string[];
}

export interface ConversationTurnResult {
  reply: string;
  phase: string;
  attemptCount: number;
  escalatedTo: 'none' | 'human' | 'dev';
  nextAction: 'continue' | 'ask_evidence' | 'propose_solution' | 'handoff_human' | 'create_clickup' | 'close';
  internalSummary: string;
  knowledgeSourcesUsed: string[];
  confidence: number;
  ticketId: string;
  zapflowAteId: number;
}

// System prompt moved to ./system-prompt.ts

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly ticketsService: TicketsService,
    private readonly auditService: AuditService,
    private readonly zapflow: ZapFlowPgService,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  async startConversation(input: StartConversationInput): Promise<ConversationTurnResult> {
    const caseId = randomUUID();
    const turnStart = Date.now();

    let ticket = await this.ticketsService.findByZapflowAteId(input.zapflowAteId);

    if (!ticket) {
      ticket = await this.ticketsService.create({
        title: `${input.systemName} — ${input.customerName}`,
        description: input.initialMessage,
        customer: { name: input.customerName, email: '', phone: input.customerPhone },
      }) as TicketDocument;

      await this.ticketsService.update(ticket._id.toString(), {
        zapflowAteId: input.zapflowAteId,
        zapflowConversationId: input.zapflowConversationId,
        customerPhone: input.customerPhone,
        systemName: input.systemName,
        zapflowSisId: input.zapflowSisId,
        zapflowEntId: input.zapflowEntId,
      } as any);
    }

    const ticketId = ticket._id.toString();

    let entityName = input.customerName;
    if (input.zapflowEntId && this.zapflow.isConnected) {
      const ent = await this.zapflow.getEntidade(input.zapflowEntId);
      if (ent) entityName = ent.z90_ent_razao_social;
    }

    await this.ticketsService.addConversationMessage(ticketId, {
      role: 'customer',
      content: input.initialMessage,
      metadata: { phase: 'greeting' },
    });

    await this.auditService.log({
      caseId,
      action: 'conversation_started',
      actor: 'agent',
      details: {
        ticketId,
        zapflowAteId: input.zapflowAteId,
        systemName: input.systemName,
        customerName: input.customerName,
      },
    });

    const systemPrompt = buildAgentSystemPrompt({
      systemName: input.systemName,
      customerName: input.customerName,
      customerPhone: input.customerPhone,
      entityName,
      previousMessagesCount: 0,
      attemptCount: 0,
    });

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input.initialMessage },
    ];

    const context: AgentContext = {
      caseId,
      ticketId,
      conversationHistory: [],
      metadata: {
        systemName: input.systemName,
        customerName: input.customerName,
        zapflowAteId: input.zapflowAteId,
      },
    };

    const { reply, toolsUsed, knowledgeRefs } = await this.runMicroReActLoop(
      caseId, ticketId, messages, context,
    );

    await this.ticketsService.addConversationMessage(ticketId, {
      role: 'agent',
      content: reply,
      metadata: {
        phase: 'understanding',
        toolsUsed,
        knowledgeRefs,
        confidence: 0.3,
      },
    });

    await this.ticketsService.updateGovernance(ticketId, {
      conversationPhase: 'understanding',
      decisionTraceEntry: `${new Date().toISOString()} — Conversa iniciada. Sistema: ${input.systemName}. Aguardando descrição do problema.`,
    });

    await this.auditService.log({
      caseId,
      action: 'conversation_turn',
      actor: 'agent',
      details: { phase: 'understanding', toolsUsed, knowledgeRefs },
      durationMs: Date.now() - turnStart,
    });

    const knowledgeSources = [...new Set(knowledgeRefs.map((r) => r.split(':')[0]))];

    return {
      reply,
      phase: 'understanding',
      attemptCount: 0,
      escalatedTo: 'none',
      nextAction: 'continue',
      internalSummary: `Novo caso aberto. Sistema: ${input.systemName}. Aguardando mais detalhes do cliente.`,
      knowledgeSourcesUsed: knowledgeSources,
      confidence: 0.3,
      ticketId,
      zapflowAteId: input.zapflowAteId,
    };
  }

  async handleMessage(input: HandleMessageInput): Promise<ConversationTurnResult> {
    const turnStart = Date.now();

    let ticket: TicketDocument | null = null;
    if (input.ticketId) {
      ticket = await this.ticketsService.findById(input.ticketId) as TicketDocument;
    } else if (input.zapflowAteId) {
      ticket = await this.ticketsService.findByZapflowAteId(input.zapflowAteId);
    }

    if (!ticket) {
      throw new Error('Ticket not found. Use startConversation first.');
    }

    const ticketId = ticket._id.toString();
    const caseId = randomUUID();
    const zapflowAteId = (ticket as any).zapflowAteId || input.zapflowAteId || 0;

    await this.ticketsService.addConversationMessage(ticketId, {
      role: 'customer',
      content: input.message,
      metadata: { phase: (ticket as any).conversationPhase || 'understanding' },
    });

    const currentPhase = (ticket as any).conversationPhase || 'understanding';
    const attemptCount = (ticket as any).attemptCount || 0;
    const conversation = (ticket as any).conversation || [];

    if (currentPhase === 'awaiting_confirmation') {
      const isPositive = this.detectPositiveFeedback(input.message);
      const isNegative = this.detectNegativeFeedback(input.message);
      const isHumanRequest = this.detectHumanRequest(input.message);

      if (isHumanRequest) {
        return this.escalateToHuman(ticketId, zapflowAteId, 'client_requested', conversation);
      }

      if (isPositive) {
        return this.closeCase(ticketId, zapflowAteId, attemptCount, conversation, input.message);
      }

      if (isNegative && attemptCount > 0) {
        await this.ticketsService.updateAttemptOutcome(ticketId, attemptCount, 'failed', input.message);
        await this.ticketsService.updateGovernance(ticketId, {
          decisionTraceEntry: `${new Date().toISOString()} — Tentativa ${attemptCount} falhou. Feedback: "${input.message.slice(0, 100)}"`,
        });

        if (attemptCount >= MAX_ATTEMPTS) {
          return this.escalateToHuman(ticketId, zapflowAteId, '3_attempts_failed', conversation);
        }
      }
    }

    if (this.detectHumanRequest(input.message)) {
      return this.escalateToHuman(ticketId, zapflowAteId, 'client_requested', conversation);
    }

    let entityName = (ticket as any).customer?.name || '';
    if ((ticket as any).zapflowEntId && this.zapflow.isConnected) {
      const ent = await this.zapflow.getEntidade((ticket as any).zapflowEntId);
      if (ent) entityName = ent.z90_ent_razao_social;
    }

    const systemPrompt = buildAgentSystemPrompt({
      systemName: (ticket as any).systemName || 'Não identificado',
      customerName: (ticket as any).customer?.name || 'Cliente',
      customerPhone: (ticket as any).customerPhone || '',
      entityName,
      previousMessagesCount: conversation.length,
      attemptCount,
    });

    const llmMessages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    for (const msg of conversation) {
      llmMessages.push({
        role: msg.role === 'customer' ? 'user' : 'assistant',
        content: msg.content,
      });
    }

    llmMessages.push({ role: 'user', content: input.message });

    const context: AgentContext = {
      caseId,
      ticketId,
      conversationHistory: [],
      metadata: {
        systemName: (ticket as any).systemName,
        customerName: (ticket as any).customer?.name,
        zapflowAteId,
        attemptCount,
        currentPhase,
      },
    };

    const { reply, toolsUsed, knowledgeRefs, devBugCreated } = await this.runMicroReActLoop(
      caseId, ticketId, llmMessages, context,
    );

    const isSolutionProposal = this.detectSolutionProposal(reply);
    let newPhase = currentPhase;
    let nextAction: ConversationTurnResult['nextAction'] = 'continue';
    let newAttemptCount = attemptCount;

    if (devBugCreated) {
      return this.escalateToDev(ticketId, zapflowAteId, devBugCreated, conversation, reply);
    }

    if (isSolutionProposal) {
      newAttemptCount = attemptCount + 1;
      newPhase = 'awaiting_confirmation';
      nextAction = 'propose_solution';

      const knowledgeSourceRefs = knowledgeRefs.map((r) => r);
      await this.ticketsService.recordAttempt(ticketId, {
        attemptNumber: newAttemptCount,
        solution: reply.slice(0, 500),
        knowledgeSourcesUsed: knowledgeSourceRefs,
        outcome: 'pending',
        decisionTrace: `Proposta baseada em: ${knowledgeRefs.join(', ') || 'raciocínio geral'}`,
      });

      await this.ticketsService.updateGovernance(ticketId, {
        conversationPhase: 'awaiting_confirmation',
        decisionTraceEntry: `${new Date().toISOString()} — TENTATIVA ${newAttemptCount}: Solução proposta. Fontes: ${knowledgeRefs.join(', ') || 'N/A'}. Confiança: ${this.estimateConfidence(knowledgeRefs)}`,
      });
    } else if (this.detectEvidenceRequest(reply)) {
      newPhase = 'collecting_evidence';
      nextAction = 'ask_evidence';
      await this.ticketsService.updateGovernance(ticketId, {
        conversationPhase: 'collecting_evidence',
        evidenceStatus: 'requested',
        decisionTraceEntry: `${new Date().toISOString()} — Evidência solicitada ao cliente.`,
      });
    } else {
      const phaseDetected = this.detectPhase(reply, currentPhase);
      newPhase = phaseDetected;
      await this.ticketsService.updateGovernance(ticketId, {
        conversationPhase: phaseDetected,
      });
    }

    const confidence = this.estimateConfidence(knowledgeRefs);

    await this.ticketsService.addConversationMessage(ticketId, {
      role: 'agent',
      content: reply,
      metadata: {
        phase: newPhase,
        attemptNumber: isSolutionProposal ? newAttemptCount : undefined,
        toolsUsed,
        knowledgeRefs,
        confidence,
      },
    });

    await this.auditService.log({
      caseId,
      action: 'conversation_turn',
      actor: 'agent',
      details: { phase: newPhase, toolsUsed, knowledgeRefs, attemptCount: newAttemptCount },
      durationMs: Date.now() - turnStart,
    });

    const knowledgeSources = [...new Set(knowledgeRefs.map((r) => r.split(':')[0]))];

    return {
      reply,
      phase: newPhase,
      attemptCount: newAttemptCount,
      escalatedTo: 'none',
      nextAction,
      internalSummary: `Fase: ${newPhase}. Tentativas: ${newAttemptCount}/${MAX_ATTEMPTS}. Tools: ${toolsUsed.join(', ') || 'nenhuma'}. KB: ${knowledgeRefs.length} docs.`,
      knowledgeSourcesUsed: knowledgeSources,
      confidence,
      ticketId,
      zapflowAteId,
    };
  }

  // ─── Escalation methods ─────────────────────────────────────

  async escalateToHuman(
    ticketId: string,
    zapflowAteId: number,
    reason: string,
    conversation: any[],
  ): Promise<ConversationTurnResult> {
    const farewell = reason === 'client_requested'
      ? 'Entendo perfeitamente! Vou encaminhar você para um dos nossos analistas que poderá te ajudar. Um momento, por favor.'
      : `Infelizmente não consegui resolver o seu problema com as soluções disponíveis. Vou encaminhar você para um dos nossos analistas especializados que vai dar continuidade ao atendimento. Um momento, por favor.`;

    let handoffAnalystId: number | undefined;

    if (this.zapflow.isConnected) {
      const analyst = await this.zapflow.selectAnalystForHandoff();
      if (analyst) {
        handoffAnalystId = analyst.z90_tec_id;
      }
    }

    await this.ticketsService.addConversationMessage(ticketId, {
      role: 'agent',
      content: farewell,
      metadata: { phase: 'escalated_human' },
    });

    await this.ticketsService.recordEscalation(ticketId, {
      type: 'human',
      reason,
      handoffAnalystId,
    });

    await this.ticketsService.updateGovernance(ticketId, {
      conversationPhase: 'escalated_human',
      decisionTraceEntry: `${new Date().toISOString()} — Handoff para humano. Motivo: ${reason}. Analista: ${handoffAnalystId || 'N/A'}`,
    });

    const ticket = await this.ticketsService.findById(ticketId) as any;

    return {
      reply: farewell,
      phase: 'escalated_human',
      attemptCount: ticket?.attemptCount || 0,
      escalatedTo: 'human',
      nextAction: 'handoff_human',
      internalSummary: `Escalado para humano. Motivo: ${reason}. Analista: ${handoffAnalystId || 'nenhum disponível'}`,
      knowledgeSourcesUsed: [],
      confidence: 0,
      ticketId,
      zapflowAteId,
    };
  }

  private async escalateToDev(
    ticketId: string,
    zapflowAteId: number,
    devBugResult: { clickupTaskId: string; clickupUrl: string; taskName: string },
    conversation: any[],
    agentReply: string,
  ): Promise<ConversationTurnResult> {
    await this.ticketsService.recordEscalation(ticketId, {
      type: 'dev',
      reason: 'bug_identified',
      clickupTaskId: devBugResult.clickupTaskId,
      clickupUrl: devBugResult.clickupUrl,
    });

    await this.ticketsService.addConversationMessage(ticketId, {
      role: 'agent',
      content: agentReply,
      metadata: { phase: 'escalated_dev' },
    });

    await this.ticketsService.updateGovernance(ticketId, {
      conversationPhase: 'escalated_dev',
      decisionTraceEntry: `${new Date().toISOString()} — Bug identificado. ClickUp: ${devBugResult.clickupTaskId}. Escalando para dev + humano.`,
    });

    return this.escalateToHuman(ticketId, zapflowAteId, 'bug_identified', conversation);
  }

  private async closeCase(
    ticketId: string,
    zapflowAteId: number,
    attemptCount: number,
    conversation: any[],
    clientMessage: string,
  ): Promise<ConversationTurnResult> {
    const farewell = 'Que ótimo, fico feliz que conseguimos resolver! Se precisar de algo mais, pode me chamar. Tenha um ótimo dia! 😊';

    await this.ticketsService.updateAttemptOutcome(ticketId, attemptCount, 'success', clientMessage);

    await this.ticketsService.resolve(ticketId, {
      type: 'agent_resolved',
      description: `Resolvido na tentativa ${attemptCount}`,
    });

    await this.ticketsService.addConversationMessage(ticketId, {
      role: 'agent',
      content: farewell,
      metadata: { phase: 'closing' },
    });

    await this.ticketsService.updateGovernance(ticketId, {
      conversationPhase: 'closing',
      decisionTraceEntry: `${new Date().toISOString()} — Caso resolvido na tentativa ${attemptCount}. Cliente confirmou.`,
    });

    return {
      reply: farewell,
      phase: 'closing',
      attemptCount,
      escalatedTo: 'none',
      nextAction: 'close',
      internalSummary: `Caso resolvido na tentativa ${attemptCount}. Cliente confirmou resolução.`,
      knowledgeSourcesUsed: [],
      confidence: 1.0,
      ticketId,
      zapflowAteId,
    };
  }

  // ─── ReAct micro-loop ──────────────────────────────────────

  private async runMicroReActLoop(
    caseId: string,
    ticketId: string,
    messages: LLMMessage[],
    context: AgentContext,
  ): Promise<{
    reply: string;
    toolsUsed: string[];
    knowledgeRefs: string[];
    devBugCreated?: { clickupTaskId: string; clickupUrl: string; taskName: string };
  }> {
    const toolDefinitions = this.toolRegistry.getDefinitions().map((def) => ({
      name: def.name,
      description: def.description,
      parameters: def.parameters,
    }));

    const toolsUsed: string[] = [];
    const knowledgeRefs: string[] = [];
    let devBugCreated: { clickupTaskId: string; clickupUrl: string; taskName: string } | undefined;

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await this.llm.chat(messages, { tools: toolDefinitions });

      if (response.finishReason === 'stop' || (!response.toolCalls?.length && response.content)) {
        return { reply: response.content || 'Desculpe, tive um problema ao processar. Pode repetir?', toolsUsed, knowledgeRefs, devBugCreated };
      }

      if (response.toolCalls?.length) {
        messages.push({
          role: 'assistant',
          content: response.content || null,
          tool_calls: response.toolCalls,
        });

        for (const toolCall of response.toolCalls) {
          const args = this.safeParseJson(toolCall.arguments);
          const tool = this.toolRegistry.get(toolCall.name);

          let result: ToolResult;
          if (!tool) {
            result = { success: false, error: `Unknown tool: ${toolCall.name}` };
          } else {
            result = await tool.execute(args, context);
          }

          toolsUsed.push(toolCall.name);

          if (toolCall.name === 'search_knowledge' && result.success && result.data?.results) {
            for (const r of result.data.results) {
              knowledgeRefs.push(`${r.source}:${r.id}`);
              await this.ticketsService.recordKnowledgeHit(ticketId, {
                documentId: r.id,
                source: r.source,
                title: r.title,
                relevanceScore: r.relevanceScore ?? undefined,
              });
            }
          }

          if (toolCall.name === 'create_dev_bug' && result.success && result.data) {
            devBugCreated = {
              clickupTaskId: result.data.clickupTaskId,
              clickupUrl: result.data.clickupUrl,
              taskName: result.data.taskName,
            };
          }

          messages.push({
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: toolCall.id,
          });

          await this.auditService.log({
            caseId,
            action: `tool_${toolCall.name}`,
            actor: 'agent',
            input: args,
            output: result.success ? result.data : undefined,
            error: result.error,
          });
        }
      }
    }

    return { reply: 'Desculpe, tive um problema ao processar sua solicitação. Pode repetir?', toolsUsed, knowledgeRefs, devBugCreated };
  }

  // ─── Detection helpers ──────────────────────────────────────

  private detectPositiveFeedback(msg: string): boolean {
    const positive = /\b(sim|funcionou|resolveu|deu certo|consegui|ok|obrigad[oa]|perfeito|ótimo|massa|valeu|isso|show)\b/i;
    return positive.test(msg);
  }

  private detectNegativeFeedback(msg: string): boolean {
    const negative = /\b(não|nao|n[aã]o funcionou|continua|mesmo problema|igual|nada|piorou|erro|falhou|sem sucesso|nem|infelizmente)\b/i;
    return negative.test(msg);
  }

  private detectHumanRequest(msg: string): boolean {
    const human = /\b(humano|pessoa|atendente|analista|algu[eé]m|gente|falar com|transferir|escalar)\b/i;
    return human.test(msg);
  }

  private detectSolutionProposal(reply: string): boolean {
    const markers = /\b(tente|faça|siga|passo|etapa|instrução|procedimento|solução|resolver|corrigi|1\.|primeiro)\b/i;
    const question = /(funcionou|conseguiu|resolveu|deu certo|tente.*e me diga)/i;
    return markers.test(reply) && question.test(reply);
  }

  private detectEvidenceRequest(reply: string): boolean {
    const evidence = /(print|screenshot|log|versão|ambiente|mensagem de erro|pode me enviar|pode me mandar)/i;
    return evidence.test(reply);
  }

  private detectPhase(reply: string, current: string): string {
    if (this.detectEvidenceRequest(reply)) return 'collecting_evidence';
    if (/(entendi que|correto\?|está certo\?|é isso\?)/i.test(reply)) return 'validating';
    if (this.detectSolutionProposal(reply)) return 'proposing_solution';
    if (/(analisar|verificar|consultar|investigar)/i.test(reply)) return 'diagnosing';
    return current;
  }

  private estimateConfidence(knowledgeRefs: string[]): number {
    if (knowledgeRefs.length === 0) return 0.2;
    if (knowledgeRefs.length <= 2) return 0.5;
    return Math.min(0.9, 0.5 + knowledgeRefs.length * 0.1);
  }

  private safeParseJson(str: string): Record<string, any> {
    try {
      return JSON.parse(str);
    } catch {
      return { raw: str };
    }
  }
}
