import { Controller, Post, Get, Body, Param, Query, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';
import { ChatService } from './chat.service';

class ChatMessageDto {
  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  sessionId?: string;

  @IsString()
  @IsOptional()
  systemName?: string;

  @IsString()
  @IsOptional()
  customerName?: string;
}

@ApiTags('agent')
@Controller('agent/chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a message to the agent and get a response with reasoning steps' })
  @ApiBody({ type: ChatMessageDto })
  async chat(@Body() dto: ChatMessageDto) {
    return this.chatService.chat({
      message: dto.message,
      sessionId: dto.sessionId,
      systemName: dto.systemName || 'Sistema de Teste',
      customerName: dto.customerName || 'Usuário Teste',
    });
  }

  @Post('reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset a chat session' })
  async reset(@Body() body: { sessionId?: string }) {
    return this.chatService.resetSession(body.sessionId);
  }

  @Get('history')
  @ApiOperation({ summary: 'List all past chat sessions' })
  async listSessions(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.listSessions(
      parseInt(page || '1', 10),
      parseInt(limit || '20', 10),
    );
  }

  @Get('history/:sessionId')
  @ApiOperation({ summary: 'Get a specific chat session with full messages' })
  async getSession(@Param('sessionId') sessionId: string) {
    const session = await this.chatService.getSession(sessionId);
    if (!session) {
      return { error: 'Session not found' };
    }
    return session;
  }
}
