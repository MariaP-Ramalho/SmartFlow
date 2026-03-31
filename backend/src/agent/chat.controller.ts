import {
  Controller, Post, Get, Patch, Body, Param, Query, Request, HttpCode,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber } from 'class-validator';
import { ChatService } from './chat.service';
import { AgentConfigService } from './agent-config.service';

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
  constructor(
    private readonly chatService: ChatService,
    private readonly agentConfigService: AgentConfigService,
  ) {}

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

  // --- Agent Config (admin only) ---

  @Get('config')
  @ApiOperation({ summary: 'Get current agent configuration (admin only)' })
  async getConfig(@Request() req: any) {
    this.requireAdmin(req);
    const config = await this.agentConfigService.getConfig();
    return {
      systemPrompt: config.systemPrompt,
      bufferDelayMs: config.bufferDelayMs,
      chatModel: config.chatModel,
      maxAttempts: config.maxAttempts,
      maxToolIterations: config.maxToolIterations,
      agentDisplayName: config.agentDisplayName,
      customInstructions: config.customInstructions,
      inactivityTimeoutMs: (config as any).inactivityTimeoutMs ?? 300000,
      inactivityMaxWarnings: (config as any).inactivityMaxWarnings ?? 3,
      inactivityMessages: (config as any).inactivityMessages ?? [],
      updatedAt: (config as any).updatedAt,
    };
  }

  @Patch('config')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update agent configuration (admin only)' })
  async updateConfig(@Request() req: any, @Body() body: any) {
    this.requireAdmin(req);

    const allowed = [
      'systemPrompt', 'bufferDelayMs', 'chatModel',
      'maxAttempts', 'maxToolIterations', 'agentDisplayName', 'customInstructions',
      'inactivityTimeoutMs', 'inactivityMaxWarnings', 'inactivityMessages',
    ];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const config = await this.agentConfigService.updateConfig(updates);
    return { message: 'Configuração atualizada.', updatedAt: (config as any).updatedAt };
  }

  @Post('config/reset')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset agent configuration to defaults (admin only)' })
  async resetConfig(@Request() req: any) {
    this.requireAdmin(req);
    await this.agentConfigService.resetToDefault();
    return { message: 'Configuração resetada para o padrão.' };
  }

  private requireAdmin(req: any): void {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Acesso restrito a administradores');
    }
  }
}
