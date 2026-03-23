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

export interface ChatResponse {
  sessionId: string;
  reply: string;
  reasoningSteps: ReasoningStep[];
  toolsUsed: string[];
  knowledgeSourcesUsed: string[];
  totalDurationMs: number;
  conversationLength: number;
}

interface ChatSession {
  id: string;
  messages: LLMMessage[];
  conversationHistory: { role: string; content: string }[];
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

    const { reply, toolsUsed, knowledgeRefs, allSteps } = await this.runReActWithSteps(
      session.messages,
      context,
      steps,
      chatModel,
    );

    session.conversationHistory.push({ role: 'agent', content: reply });

    const uniqueKBSources = [...new Set(knowledgeRefs.map((r) => r.split(':')[0]))];

    steps.push({
      type: 'llm_response',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      content: `Resposta gerada (${reply.length} chars). Tools: ${toolsUsed.length}. KB hits: ${knowledgeRefs.length}.`,
      details: {
        replyPreview: reply.slice(0, 200),
        toolsUsed,
        knowledgeRefs,
      },
    });

    await this.persistSession(session, toolsUsed, uniqueKBSources);

    return {
      sessionId: session.id,
      reply,
      reasoningSteps: steps,
      toolsUsed,
      knowledgeSourcesUsed: uniqueKBSources,
      totalDurationMs: Date.now() - startTime,
      conversationLength: session.conversationHistory.length,
    };
  }

  private async runReActWithSteps(
    messages: LLMMessage[],
    context: AgentContext,
    steps: ReasoningStep[],
    model?: string,
  ): Promise<{
    reply: string;
    toolsUsed: string[];
    knowledgeRefs: string[];
    allSteps: ReasoningStep[];
  }> {
    const toolDefinitions = this.toolRegistry.getDefinitions().map((def) => ({
      name: def.name,
      description: def.description,
      parameters: def.parameters,
    }));

    const toolsUsed: string[] = [];
    const knowledgeRefs: string[] = [];

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

        const isKeyError = /quota|unauthorized|invalid.*key|401|429|connection/i.test(errMsg);
        const userMessage = isKeyError
          ? '⚠️ O serviço de IA está temporariamente indisponível. A equipe técnica foi notificada. Por favor, tente novamente em alguns minutos.'
          : 'Desculpe, tive um problema ao processar sua mensagem. Pode tentar novamente?';

        return {
          reply: userMessage,
          toolsUsed,
          knowledgeRefs,
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
          reply: response.content || 'Desculpe, tive um problema ao processar. Pode repetir?',
          toolsUsed,
          knowledgeRefs,
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

          messages.push({
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: toolCall.id,
          });
        }
      }
    }

    return {
      reply: 'Desculpe, atingi o limite de processamento. Pode reformular sua pergunta?',
      toolsUsed,
      knowledgeRefs,
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
