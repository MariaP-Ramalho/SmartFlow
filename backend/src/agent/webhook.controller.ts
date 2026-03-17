import { Controller, Post, Body, HttpCode, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { IsString, IsNumber, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { ConversationService, ConversationTurnResult } from './conversation.service';

class IncomingMessageDto {
  @IsNumber()
  zapflowAteId: number;

  @IsNumber()
  @IsOptional()
  zapflowSisId?: number;

  @IsNumber()
  @IsOptional()
  zapflowEntId?: number;

  @IsString()
  customerPhone: string;

  @IsString()
  customerName: string;

  @IsString()
  systemName: string;

  @IsString()
  message: string;

  @IsArray()
  @IsOptional()
  attachments?: string[];

  @IsBoolean()
  isNewConversation: boolean;

  @IsString()
  @IsOptional()
  zapflowConversationId?: string;
}

class EscalateDto {
  @IsNumber()
  zapflowAteId: number;

  @IsString()
  reason: string;

  @IsString()
  @IsOptional()
  operatorNote?: string;
}

@ApiTags('agent-webhook')
@Controller('agent/webhook')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(private readonly conversationService: ConversationService) {}

  @Post('incoming')
  @HttpCode(200)
  @ApiOperation({ summary: 'Receive a message from ZapFlow and return agent response' })
  @ApiBody({ type: IncomingMessageDto })
  @ApiResponse({ status: 200, description: 'Agent response with governance metadata' })
  async incoming(@Body() body: IncomingMessageDto): Promise<ConversationTurnResult> {
    this.logger.log(
      `Incoming message — ateId=${body.zapflowAteId} new=${body.isNewConversation} system=${body.systemName}`,
    );

    try {
      if (body.isNewConversation) {
        return await this.conversationService.startConversation({
          zapflowAteId: body.zapflowAteId,
          zapflowSisId: body.zapflowSisId,
          zapflowEntId: body.zapflowEntId,
          customerPhone: body.customerPhone,
          customerName: body.customerName,
          systemName: body.systemName,
          initialMessage: body.message,
          zapflowConversationId: body.zapflowConversationId,
          attachments: body.attachments,
        });
      }

      return await this.conversationService.handleMessage({
        zapflowAteId: body.zapflowAteId,
        message: body.message,
        attachments: body.attachments,
      });
    } catch (error) {
      this.logger.error(
        `Webhook error for ateId=${body.zapflowAteId}: ${error instanceof Error ? error.message : error}`,
      );

      return {
        reply: 'Desculpe, tive um problema técnico ao processar sua mensagem. Vou encaminhar você para um dos nossos analistas.',
        phase: 'escalated_human',
        attemptCount: 0,
        escalatedTo: 'human',
        nextAction: 'handoff_human',
        internalSummary: `ERRO: ${error instanceof Error ? error.message : String(error)}`,
        knowledgeSourcesUsed: [],
        confidence: 0,
        ticketId: '',
        zapflowAteId: body.zapflowAteId,
      };
    }
  }

  @Post('escalate')
  @HttpCode(200)
  @ApiOperation({ summary: 'Force escalation of an active conversation to human analyst' })
  @ApiBody({ type: EscalateDto })
  @ApiResponse({ status: 200, description: 'Escalation result' })
  async escalate(@Body() body: EscalateDto): Promise<Partial<ConversationTurnResult>> {
    this.logger.log(`Forced escalation — ateId=${body.zapflowAteId} reason=${body.reason}`);

    try {
      const result = await this.conversationService.escalateToHuman(
        '',
        body.zapflowAteId,
        body.reason,
        [],
      );
      return result;
    } catch (error) {
      this.logger.error(`Escalation error: ${error instanceof Error ? error.message : error}`);
      return {
        reply: 'Vou encaminhar você para um dos nossos analistas. Um momento, por favor.',
        phase: 'escalated_human',
        escalatedTo: 'human',
        nextAction: 'handoff_human',
      };
    }
  }
}
