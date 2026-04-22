import {
  Controller,
  Post,
  Body,
  Headers,
  Logger,
  HttpCode,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/auth.guard';
import { VapiService } from './vapi.service';

@Controller('vapi')
export class VapiController {
  private readonly logger = new Logger(VapiController.name);

  constructor(
    private readonly vapiService: VapiService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(
    @Body() body: any,
    @Headers('x-vapi-secret') vapiSecret?: string,
  ): Promise<any> {
    const expectedSecret = this.config.get<string>('vapi.webhookSecret') || this.config.get<string>('VAPI_WEBHOOK_SECRET');
    if (expectedSecret && vapiSecret !== expectedSecret) {
      this.logger.warn('Vapi webhook rejected: invalid secret');
      throw new UnauthorizedException('Invalid Vapi secret');
    }

    const message = body?.message || body;
    const messageType = message?.type;

    this.logger.log(`Vapi webhook received: type=${messageType}`);

    switch (messageType) {
      case 'assistant-request':
        return this.handleAssistantRequest(message);

      case 'tool-calls':
        return this.handleToolCalls(message);

      case 'end-of-call-report':
        return this.handleEndOfCallReport(message);

      case 'transfer-destination-request':
        return this.handleTransferRequest(message);

      case 'status-update':
        this.logger.log(`Call status update: ${message?.status}`);
        return {};

      case 'speech-update':
      case 'transcript':
      case 'hang':
      case 'conversation-update':
        return {};

      default:
        this.logger.warn(`Unknown Vapi webhook type: ${messageType}`);
        return {};
    }
  }

  private async handleAssistantRequest(message: any): Promise<any> {
    const call = message?.call || {};
    this.logger.log(`Assistant request for call ${call.id}, customer: ${call.customer?.number}`);

    try {
      return await this.vapiService.buildAssistantConfig(call);
    } catch (err: any) {
      this.logger.error(`Failed to build assistant config: ${err?.message}`);
      return this.buildFallbackAssistant();
    }
  }

  private async handleToolCalls(message: any): Promise<any> {
    const call = message?.call || {};
    const toolCallList = message?.toolCallList || [];

    if (!toolCallList.length) {
      this.logger.warn(`No tool calls in message for call ${call.id}`);
      return { results: [] };
    }

    this.logger.log(
      `Processing ${toolCallList.length} tool call(s) for call ${call.id}: ` +
      toolCallList.map((tc: any) => tc.function?.name).join(', '),
    );

    try {
      return await this.vapiService.executeToolCalls(toolCallList, call);
    } catch (err: any) {
      this.logger.error(`Tool calls failed for call ${call.id}: ${err?.message}`);
      return {
        results: toolCallList.map((tc: any) => ({
          toolCallId: tc.id,
          result: JSON.stringify({ success: false, error: 'Internal error processing tool call' }),
        })),
      };
    }
  }

  private async handleEndOfCallReport(message: any): Promise<any> {
    try {
      await this.vapiService.handleEndOfCallReport(message);
    } catch (err: any) {
      this.logger.error(`Failed to handle end-of-call report: ${err?.message}`);
    }
    return {};
  }

  private async handleTransferRequest(message: any): Promise<any> {
    const call = message?.call || {};
    this.logger.log(`Transfer destination request for call ${call.id}`);

    try {
      return await this.vapiService.handleTransferRequest(call);
    } catch (err: any) {
      this.logger.error(`Failed to handle transfer request: ${err?.message}`);
      return { destination: { type: 'number', number: '' } };
    }
  }

  private buildFallbackAssistant(): Record<string, any> {
    return {
      assistant: {
        model: {
          provider: 'openai',
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content:
                'Você é Renato, analista de suporte da Freire Tecnologia. ' +
                'Houve um problema técnico temporário. Peça desculpas e diga que vai transferir para um colega.',
            },
          ],
        },
        firstMessage:
          'Oi, desculpa, estou com uma instabilidade aqui. Vou te passar pra um colega, tá bom?',
      },
    };
  }
}
