import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'crypto';
import { LlmService } from './llm/llm.service';
import { LLMMessage } from './llm/llm.interface';
import { ToolRegistry } from './tools/tool-registry';
import { AgentContext, ToolResult } from './tools/tool.interface';
import { AgentConfigService } from './agent-config.service';
import { ChatSession as ChatSessionDoc, ChatSessionDocument } from './schemas/chat-session.schema';

let MAX_TOOL_ITERATIONS = 5;

export interface ReasoningStep {
  type: 'thinking' | 'tool_call' | 'tool_result' | 'knowledge_hit' | 'llm_response' | 'phase_change' | 'error';
  timestamp: string;
  durationMs?: number;
  content: string;
  details?: Record<string, any>;
}

export interface ChatInput {
  message: string;
  sessionId?: string;
  systemName: string;
  customerName: string;
}

export interface ManagerNotification {
  reason: string;
  message: string;
  customerSummary: string;
  timestamp: string;
}

export interface AgentMessageSourcesMeta {
  toolsUsed: string[];
  knowledge: { id: string; title: string; source?: string }[];
  pastCases: { atendimentoId: number; sistema?: string; problemaPreview?: string }[];
}

export interface ChatResponse {
  sessionId: string;
  reply: string;
  hasError: boolean;
  reasoningSteps: ReasoningStep[];
  toolsUsed: string[];
  knowledgeSourcesUsed: string[];
  /** Documentos da base usados nesta resposta (detalhe) */
  knowledgeHits?: { id: string; title: string; source?: string }[];
  /** Casos ZapFlow consultados nesta resposta */
  pastCasesUsed?: { atendimentoId: number; sistema?: string; problemaPreview?: string }[];
  totalDurationMs: number;
  conversationLength: number;
  managerNotifications: ManagerNotification[];
}

interface ChatSession {
  id: string;
  messages: LLMMessage[];
  conversationHistory: { role: string; content: string; meta?: AgentMessageSourcesMeta }[];
  systemName: string;
  customerName: string;
  attemptCount: number;
  createdAt: Date;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly sessions = new Map<string, ChatSession>();

  constructor(
    private readonly llm: LlmService,
    private readonly toolRegistry: ToolRegistry,
    private readonly agentConfig: AgentConfigService,
    @InjectModel(ChatSessionDoc.name) private readonly chatSessionModel: Model<ChatSessionDocument>,
  ) {}

  clearSession(sessionId: string): void {
    if (this.sessions.delete(sessionId)) {
      this.logger.log(`Session ${sessionId} cleared (client change)`);
    }
  }

  async chat(input: ChatInput): Promise<ChatResponse> {
    const startTime = Date.now();
    const steps: ReasoningStep[] = [];

    let session = input.sessionId ? this.sessions.get(input.sessionId) : undefined;

    if (!session) {
      const id = input.sessionId || randomUUID();
      session = {
        id,
        messages: [],
        conversationHistory: [],
        systemName: input.systemName,
        customerName: input.customerName,
        attemptCount: 0,
        createdAt: new Date(),
      };
      this.sessions.set(id, session);

      steps.push({
        type: 'phase_change',
        timestamp: new Date().toISOString(),
        content: `Nova sessão de chat criada. Sistema: ${input.systemName}, Cliente: ${input.customerName}`,
      });
    }

    session.conversationHistory.push({ role: 'customer', content: input.message });

    const config = await this.agentConfig.getConfig();
    MAX_TOOL_ITERATIONS = config?.maxToolIterations || 5;
    const chatModel = config?.chatModel || undefined;

    const systemPrompt = this.agentConfig.buildPromptForSession({
      systemName: session.systemName,
      customerName: session.customerName,
      customerPhone: '',
      entityName: 'Teste via Interface',
      previousMessagesCount: session.conversationHistory.length,
      attemptCount: session.attemptCount,
    });

    session.messages = [{ role: 'system', content: systemPrompt }];
    for (const msg of session.conversationHistory) {
      session.messages.push({
        role: msg.role === 'customer' ? 'user' : 'assistant',
        content: msg.content,
      });
    }

    steps.push({
      type: 'thinking',
      timestamp: new Date().toISOString(),
      content: `Processando mensagem do cliente: "${input.message.slice(0, 100)}${input.message.length > 100 ? '...' : ''}"`,
      details: {
        conversationLength: session.conversationHistory.length,
        systemPromptLength: systemPrompt.length,
      },
    });

    const isWhatsApp = input.sessionId?.startsWith('wa-') ?? false;
    const context: AgentContext = {
      caseId: `chat-${session.id}`,
      ticketId: undefined,
      conversationHistory: [],
      metadata: {
        systemName: session.systemName,
        customerName: session.customerName,
        isTestChat: !isWhatsApp,
      },
    };

    const result = await this.runReActWithSteps(
      session.messages,
      context,
      steps,
      chatModel,
    );

    if (result.reply) {
      const sourcesMeta: AgentMessageSourcesMeta = {
        toolsUsed: [...new Set(result.toolsUsed)],
        knowledge: result.knowledgeHits,
        pastCases: result.pastCases,
      };
      session.conversationHistory.push({
        role: 'agent',
        content: result.reply,
        meta: sourcesMeta,
      });
    }

    const uniqueKBSources = [...new Set(result.knowledgeRefs.map((r) => r.split(':')[0]))];

    steps.push({
      type: result.hasError ? 'error' : 'llm_response',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      content: result.hasError
        ? `Erro no processamento. Tools: ${result.toolsUsed.length}.`
        : `Resposta gerada (${result.reply.length} chars). Tools: ${result.toolsUsed.length}. KB hits: ${result.knowledgeRefs.length}.`,
      details: {
        replyPreview: result.reply?.slice(0, 200) || null,
        toolsUsed: result.toolsUsed,
        knowledgeRefs: result.knowledgeRefs,
      },
    });

    await this.persistSession(session, result.toolsUsed, uniqueKBSources);

    const managerNotifications: ManagerNotification[] =
      context.metadata?.managerNotifications || [];

    return {
      sessionId: session.id,
      reply: result.reply,
      hasError: result.hasError,
      reasoningSteps: steps,
      toolsUsed: result.toolsUsed,
      knowledgeSourcesUsed: uniqueKBSources,
      knowledgeHits: result.knowledgeHits,
      pastCasesUsed: result.pastCases,
      totalDurationMs: Date.now() - startTime,
      conversationLength: session.conversationHistory.length,
      managerNotifications,
    };
  }

  private async runReActWithSteps(
    messages: LLMMessage[],
    context: AgentContext,
    steps: ReasoningStep[],
    model?: string,
  ): Promise<{
    reply: string;
    hasError: boolean;
    toolsUsed: string[];
    knowledgeRefs: string[];
    knowledgeHits: { id: string; title: string; source?: string }[];
    pastCases: { atendimentoId: number; sistema?: string; problemaPreview?: string }[];
    allSteps: ReasoningStep[];
  }> {
    const toolDefinitions = this.toolRegistry.getDefinitions().map((def) => ({
      name: def.name,
      description: def.description,
      parameters: def.parameters,
    }));

    const toolsUsed: string[] = [];
    const knowledgeRefs: string[] = [];
    const knowledgeHits: { id: string; title: string; source?: string }[] = [];
    const seenKnowledgeId = new Set<string>();
    const pastCases: { atendimentoId: number; sistema?: string; problemaPreview?: string }[] = [];
    const seenCaseId = new Set<number>();

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const llmStart = Date.now();

      steps.push({
        type: 'thinking',
        timestamp: new Date().toISOString(),
        content: `Iteração ${i + 1}/${MAX_TOOL_ITERATIONS}: Chamando LLM...`,
        details: {
          messageCount: messages.length,
          toolsAvailable: toolDefinitions.map((t) => t.name),
        },
      });

      let response;
      try {
        response = await this.llm.chat(messages, { tools: toolDefinitions, model });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`All LLM providers failed: ${errMsg}`);
        steps.push({
          type: 'error',
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - llmStart,
          content: `Erro na chamada LLM: ${errMsg}`,
          details: {
            availableProviders: this.llm.listProviders(),
            hint: 'Verifique se as API keys estão configuradas corretamente no .env (OPENAI_API_KEY, ANTHROPIC_API_KEY ou AZURE_OPENAI_API_KEY)',
          },
        });

        return {
          reply: '',
          hasError: true,
          toolsUsed,
          knowledgeRefs,
          knowledgeHits,
          pastCases,
          allSteps: steps,
        };
      }

      const llmDuration = Date.now() - llmStart;

      if (response.finishReason === 'stop' || (!response.toolCalls?.length && response.content)) {
        steps.push({
          type: 'thinking',
          timestamp: new Date().toISOString(),
          durationMs: llmDuration,
          content: `LLM respondeu diretamente (sem tool calls). Tokens: ${response.usage?.totalTokens || 'N/A'}`,
          details: {
            finishReason: response.finishReason,
            usage: response.usage,
          },
        });

        return {
          reply: response.content || '',
          hasError: !response.content,
          toolsUsed,
          knowledgeRefs,
          knowledgeHits,
          pastCases,
          allSteps: steps,
        };
      }

      if (response.toolCalls?.length) {
        steps.push({
          type: 'thinking',
          timestamp: new Date().toISOString(),
          durationMs: llmDuration,
          content: `LLM decidiu usar ${response.toolCalls.length} tool(s): ${response.toolCalls.map((t) => t.name).join(', ')}`,
          details: {
            finishReason: response.finishReason,
            usage: response.usage,
            pendingText: response.content?.slice(0, 200) || null,
          },
        });

        messages.push({
          role: 'assistant',
          content: response.content || null,
          tool_calls: response.toolCalls,
        });

        for (const toolCall of response.toolCalls) {
          const args = this.safeParseJson(toolCall.arguments);
          const tool = this.toolRegistry.get(toolCall.name);

          steps.push({
            type: 'tool_call',
            timestamp: new Date().toISOString(),
            content: `Chamando tool: ${toolCall.name}`,
            details: { toolName: toolCall.name, arguments: args },
          });

          const toolStart = Date.now();
          let result: ToolResult;

          if (!tool) {
            result = { success: false, error: `Tool desconhecida: ${toolCall.name}` };
          } else {
            try {
              result = await tool.execute(args, context);
            } catch (err) {
              result = { success: false, error: err instanceof Error ? err.message : String(err) };
            }
          }

          const toolDuration = Date.now() - toolStart;
          toolsUsed.push(toolCall.name);

          steps.push({
            type: 'tool_result',
            timestamp: new Date().toISOString(),
            durationMs: toolDuration,
            content: result.success
              ? `Tool ${toolCall.name} executada com sucesso (${toolDuration}ms)`
              : `Tool ${toolCall.name} falhou: ${result.error}`,
            details: {
              toolName: toolCall.name,
              success: result.success,
              resultPreview: result.success
                ? JSON.stringify(result.data).slice(0, 500)
                : result.error,
            },
          });

          if (toolCall.name === 'search_knowledge' && result.success && result.data?.results) {
            for (const r of result.data.results) {
              knowledgeRefs.push(`${r.source}:${r.id}`);
              const kid = String(r.id ?? '');
              if (kid && !seenKnowledgeId.has(kid)) {
                seenKnowledgeId.add(kid);
                knowledgeHits.push({
                  id: kid,
                  title: r.title || '(sem título)',
                  source: r.source || r.category,
                });
              }
              steps.push({
                type: 'knowledge_hit',
                timestamp: new Date().toISOString(),
                content: `Encontrado: "${r.title}" (fonte: ${r.source}, relevância: ${r.relevanceScore ?? 'N/A'})`,
                details: {
                  documentId: r.id,
                  source: r.source,
                  title: r.title,
                  relevanceScore: r.relevanceScore,
                  contentPreview: r.content?.slice(0, 200),
                },
              });
            }
          }

          if (toolCall.name === 'search_past_cases' && result.success && result.data?.cases?.length) {
            for (const c of result.data.cases) {
              const aid = Number(c.atendimento_id);
              if (Number.isFinite(aid) && !seenCaseId.has(aid)) {
                seenCaseId.add(aid);
                pastCases.push({
                  atendimentoId: aid,
                  sistema: c.sistema,
                  problemaPreview: (c.problema || '').slice(0, 240),
                });
              }
            }
          }

          messages.push({
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: toolCall.id,
          });
        }
      }
    }

    return {
      reply: '',
      hasError: true,
      toolsUsed,
      knowledgeRefs,
      knowledgeHits,
      pastCases,
      allSteps: steps,
    };
  }

  resetSession(sessionId?: string): { success: boolean; message: string } {
    if (sessionId) {
      this.sessions.delete(sessionId);
      return { success: true, message: `Sessão ${sessionId} removida.` };
    }
    this.sessions.clear();
    return { success: true, message: 'Todas as sessões removidas.' };
  }

  private async persistSession(
    session: ChatSession,
    toolsUsed: string[],
    knowledgeSources: string[],
  ): Promise<void> {
    try {
      const dbMessages = session.conversationHistory.map((m) => ({
        role: m.role === 'agent' ? 'agent' : 'user',
        content: m.content,
        timestamp: new Date(),
        ...(m.role === 'agent' && m.meta ? { meta: m.meta } : {}),
      }));

      await this.chatSessionModel.findOneAndUpdate(
        { sessionId: session.id },
        {
          $set: {
            sessionId: session.id,
            systemName: session.systemName,
            customerName: session.customerName,
            messages: dbMessages,
            attemptCount: session.attemptCount,
          },
          $addToSet: {
            toolsUsed: { $each: toolsUsed },
            knowledgeSourcesUsed: { $each: knowledgeSources },
          },
        },
        { upsert: true, new: true },
      );
    } catch (err) {
      this.logger.error(`Failed to persist session: ${err}`);
    }
  }

  async listSessions(
    page = 1,
    limit = 20,
  ): Promise<{
    sessions: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;
    const [sessions, total] = await Promise.all([
      this.chatSessionModel
        .find()
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      this.chatSessionModel.countDocuments(),
    ]);

    return {
      sessions: sessions.map((s: any) => ({
        sessionId: s.sessionId,
        systemName: s.systemName,
        customerName: s.customerName,
        messageCount: s.messages?.length ?? 0,
        lastMessage: s.messages?.length
          ? s.messages[s.messages.length - 1].content?.slice(0, 100)
          : '',
        toolsUsed: s.toolsUsed,
        knowledgeSourcesUsed: s.knowledgeSourcesUsed,
        status: s.status,
        attemptCount: s.attemptCount,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSession(sessionId: string): Promise<any | null> {
    return this.chatSessionModel.findOne({ sessionId }).lean();
  }

  private safeParseJson(str: string): Record<string, any> {
    try {
      return JSON.parse(str);
    } catch {
      return { raw: str };
    }
  }
}
