import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LlmService } from './llm/llm.service';
import { LLMMessage } from './llm/llm.interface';
import { TicketsService } from '../tickets/tickets.service';
import { AuditService } from '../audit/audit.service';
import { ToolRegistry } from './tools/tool-registry';
import { AgentContext, ToolResult } from './tools/tool.interface';

const SYSTEM_PROMPT = `You are an autonomous support agent for the Resolve-to-Close system. Your job is to resolve customer support tickets end-to-end.

You follow the ReAct pattern: Reason about the situation, then Act using your tools, then Observe the results.

Your workflow:
1. Analyze the incoming request/ticket
2. Search the knowledge base for relevant context
3. Run diagnostics if needed (collect info, check warranty, etc.)
4. Determine the appropriate resolution
5. Check policies before taking high-risk actions (refunds, RMA, replacements)
6. If approval is needed, request it and wait
7. Execute the resolution (update ticket, communicate with customer)
8. Close the case

Always be thorough, professional, and follow company policies. If you're unsure, escalate to a human.`;

const MAX_ITERATIONS = 10;

export interface ProcessCaseInput {
  ticketId?: string;
  message: string;
  customer?: any;
  metadata?: Record<string, any>;
}

export interface CaseResult {
  caseId: string;
  ticketId: string;
  status: string;
  actions: { tool: string; input: Record<string, any>; output: ToolResult }[];
  resolution: string | null;
}

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly ticketsService: TicketsService,
    private readonly auditService: AuditService,
    private readonly toolRegistry: ToolRegistry,
  ) {}

  async processCase(input: ProcessCaseInput): Promise<CaseResult> {
    const caseId = randomUUID();
    const caseStart = Date.now();
    const actions: CaseResult['actions'] = [];

    try {
      let ticketId = input.ticketId;

      if (ticketId) {
        await this.ticketsService.findById(ticketId);
      } else {
        const ticket = await this.ticketsService.create({
          title: input.message.slice(0, 120),
          description: input.message,
          customer: input.customer,
        });
        ticketId = ticket._id.toString();
      }

      await this.auditService.log({
        caseId,
        action: 'case_started',
        actor: 'agent',
        details: { ticketId, hasExistingTicket: !!input.ticketId },
        input: { message: input.message },
      });

      await this.ticketsService.updateStatus(ticketId, 'in_progress' as any);

      const messages: LLMMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: this.buildInitialPrompt(input, ticketId) },
      ];

      const context: AgentContext = {
        caseId,
        ticketId,
        conversationHistory: [],
        metadata: { ...input.metadata, customer: input.customer },
      };

      const result = await this.runReActLoop(caseId, ticketId, messages, context, actions);

      await this.auditService.log({
        caseId,
        action: 'case_completed',
        actor: 'agent',
        details: { ticketId, actionsCount: actions.length },
        output: { resolution: result },
        durationMs: Date.now() - caseStart,
      });

      return {
        caseId,
        ticketId,
        status: 'completed',
        actions,
        resolution: result,
      };
    } catch (error) {
      this.logger.error(`Case ${caseId} failed: ${error instanceof Error ? error.message : String(error)}`);

      await this.auditService.log({
        caseId,
        action: 'case_failed',
        actor: 'agent',
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - caseStart,
      });

      return {
        caseId,
        ticketId: input.ticketId || '',
        status: 'failed',
        actions,
        resolution: null,
      };
    }
  }

  private async runReActLoop(
    caseId: string,
    ticketId: string,
    messages: LLMMessage[],
    context: AgentContext,
    actions: CaseResult['actions'],
  ): Promise<string | null> {
    const toolDefinitions = this.toolRegistry.getDefinitions().map((def) => ({
      name: def.name,
      description: def.description,
      parameters: def.parameters,
    }));

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      this.logger.log(`Case ${caseId} — iteration ${iteration + 1}/${MAX_ITERATIONS}`);

      const llmStart = Date.now();
      let response;

      try {
        response = await this.llm.chat(messages, { tools: toolDefinitions });
      } catch (error) {
        this.logger.error(`LLM call failed on iteration ${iteration + 1}: ${error instanceof Error ? error.message : String(error)}`);
        await this.auditService.log({
          caseId,
          action: 'llm_error',
          actor: 'agent',
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - llmStart,
        });
        break;
      }

      await this.auditService.log({
        caseId,
        action: 'llm_call',
        actor: 'agent',
        details: { iteration: iteration + 1, finishReason: response.finishReason },
        output: {
          hasToolCalls: !!response.toolCalls?.length,
          toolCallCount: response.toolCalls?.length || 0,
          usage: response.usage,
        },
        durationMs: Date.now() - llmStart,
      });

      if (response.finishReason === 'stop' || (!response.toolCalls?.length && response.content)) {
        if (response.content) {
          messages.push({ role: 'assistant', content: response.content });
        }
        return response.content;
      }

      if (response.toolCalls?.length) {
        messages.push({
          role: 'assistant',
          content: response.content || null,
          tool_calls: response.toolCalls,
        });

        for (const toolCall of response.toolCalls) {
          const toolResult = await this.executeTool(caseId, ticketId, toolCall, context);

          actions.push({
            tool: toolCall.name,
            input: this.safeParseJson(toolCall.arguments),
            output: toolResult,
          });

          messages.push({
            role: 'tool',
            content: JSON.stringify(toolResult),
            tool_call_id: toolCall.id,
          });

          context.conversationHistory.push({
            tool: toolCall.name,
            args: this.safeParseJson(toolCall.arguments),
            result: toolResult,
          });
        }
      }
    }

    this.logger.warn(`Case ${caseId} reached max iterations (${MAX_ITERATIONS})`);
    return null;
  }

  private async executeTool(
    caseId: string,
    ticketId: string,
    toolCall: { id: string; name: string; arguments: string },
    context: AgentContext,
  ): Promise<ToolResult> {
    const toolStart = Date.now();
    const args = this.safeParseJson(toolCall.arguments);
    const tool = this.toolRegistry.get(toolCall.name);

    if (!tool) {
      const result: ToolResult = { success: false, error: `Unknown tool: ${toolCall.name}` };
      await this.logToolExecution(caseId, ticketId, toolCall.name, args, result, toolStart);
      return result;
    }

    try {
      const result = await tool.execute(args, context);
      await this.logToolExecution(caseId, ticketId, toolCall.name, args, result, toolStart);
      return result;
    } catch (error) {
      const result: ToolResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
      await this.logToolExecution(caseId, ticketId, toolCall.name, args, result, toolStart);
      return result;
    }
  }

  private async logToolExecution(
    caseId: string,
    ticketId: string,
    toolName: string,
    args: Record<string, any>,
    result: ToolResult,
    startTime: number,
  ): Promise<void> {
    const durationMs = Date.now() - startTime;

    await Promise.all([
      this.auditService.log({
        caseId,
        action: `tool_${toolName}`,
        actor: 'agent',
        input: args,
        output: result.success ? result.data : undefined,
        error: result.error,
        durationMs,
      }),
      this.ticketsService.addAgentAction(ticketId, {
        action: `tool_${toolName}`,
        tool: toolName,
        input: args,
        output: result.success ? result.data : { error: result.error },
        durationMs,
        status: result.success ? 'success' : 'error',
      }).catch((err) => {
        this.logger.warn(`Failed to add agent action to ticket: ${err.message}`);
      }),
    ]);
  }

  private buildInitialPrompt(input: ProcessCaseInput, ticketId: string): string {
    const parts = [
      `Ticket ID: ${ticketId}`,
      `Customer Message: ${input.message}`,
    ];

    if (input.customer) {
      parts.push(`Customer Info: ${JSON.stringify(input.customer)}`);
    }

    if (input.metadata) {
      parts.push(`Additional Context: ${JSON.stringify(input.metadata)}`);
    }

    return parts.join('\n\n');
  }

  private safeParseJson(str: string): Record<string, any> {
    try {
      return JSON.parse(str);
    } catch {
      return { raw: str };
    }
  }
}
