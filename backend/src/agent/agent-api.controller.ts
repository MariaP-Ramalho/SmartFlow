import { Controller, Post, Get, Body, HttpCode, Logger, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiResponse } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsArray } from 'class-validator';
import { Public } from '../auth/auth.guard';
import { BufferManagerService, ApiMessageInput, ApiMessageResponse } from './buffer-manager.service';
import { ChatService } from './chat.service';

class ApiMessageDto {
  @IsString()
  customerPhone: string;

  @IsString()
  customerName: string;

  @IsString()
  systemName: string;

  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  sessionId?: string;

  @IsNumber()
  @IsOptional()
  atendimentoId?: number;

  @IsNumber()
  @IsOptional()
  agentTecnicoId?: number;

  @IsBoolean()
  @IsOptional()
  isNewConversation?: boolean;

  @IsArray()
  @IsOptional()
  attachments?: string[];
}

class ResetPhoneDto {
  @IsString()
  customerPhone: string;
}

@Public()
@ApiTags('agent-api')
@Controller('agent/api')
export class AgentApiController {
  private readonly logger = new Logger(AgentApiController.name);

  constructor(
    private readonly bufferManager: BufferManagerService,
    private readonly chatService: ChatService,
  ) {}

  @Post('message')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Send a message and receive the agent response directly',
    description:
      'Messages from the same customerPhone are buffered. ' +
      'If another message arrives for the same phone before the buffer expires, ' +
      'the previous request returns immediately with status "superseded". ' +
      'Only the last request receives the actual AI response with status "completed".',
  })
  @ApiBody({ type: ApiMessageDto })
  @ApiResponse({
    status: 200,
    description: 'Agent response or superseded notification',
  })
  async message(@Body() body: ApiMessageDto): Promise<ApiMessageResponse> {
    this.logger.log(
      `API message — phone=${body.customerPhone} name=${body.customerName} ` +
      `system=${body.systemName} new=${body.isNewConversation || false}`,
    );

    const input: ApiMessageInput = {
      customerPhone: body.customerPhone,
      customerName: body.customerName,
      systemName: body.systemName,
      message: body.message,
      sessionId: body.sessionId,
      atendimentoId: body.atendimentoId,
      agentTecnicoId: body.agentTecnicoId,
      isNewConversation: body.isNewConversation,
      attachments: body.attachments,
    };

    return this.bufferManager.addMessage(input);
  }

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset buffer and session for a specific phone number' })
  @ApiBody({ type: ResetPhoneDto })
  async resetPhone(@Body() body: ResetPhoneDto) {
    return this.bufferManager.resetPhone(body.customerPhone);
  }

  @Get('status')
  @ApiOperation({ summary: 'Get current buffer status (active buffers, processing locks)' })
  status() {
    return this.bufferManager.getStatus();
  }

  @Get('sessions')
  @ApiOperation({ summary: 'List chat sessions' })
  async listSessions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.listSessions(
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
    );
  }
}
