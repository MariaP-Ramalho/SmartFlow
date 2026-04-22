import {
  Controller, Post, Get, Patch, Delete, Body, Param, HttpCode, Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, IsArray } from 'class-validator';
import { WhatsAppAgentService } from './whatsapp-agent.service';
import { UazapiConnectionManager } from './uazapi-connection-manager.service';

class CreateAgentDto {
  @IsString()
  slug: string;

  @IsString()
  name: string;

  @IsString()
  uazapiBaseUrl: string;

  @IsString()
  uazapiInstanceToken: string;

  @IsString()
  @IsOptional()
  managerWhatsApp?: string;

  @IsString()
  @IsOptional()
  mirrorWhatsAppExtra?: string;

  @IsString()
  @IsOptional()
  agentDisplayName?: string;

  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @IsString()
  @IsOptional()
  customInstructions?: string;

  @IsString()
  @IsOptional()
  chatModel?: string;

  @IsNumber()
  @IsOptional()
  bufferDelayMs?: number;

  @IsNumber()
  @IsOptional()
  maxAttempts?: number;

  @IsNumber()
  @IsOptional()
  maxToolIterations?: number;

  @IsNumber()
  @IsOptional()
  inactivityTimeoutMs?: number;

  @IsNumber()
  @IsOptional()
  inactivityMaxWarnings?: number;

  @IsArray()
  @IsOptional()
  inactivityMessages?: string[];

  @IsString()
  @IsOptional()
  knowledgeTag?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

class UpdateAgentDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  uazapiBaseUrl?: string;

  @IsString()
  @IsOptional()
  uazapiInstanceToken?: string;

  @IsString()
  @IsOptional()
  managerWhatsApp?: string;

  @IsString()
  @IsOptional()
  mirrorWhatsAppExtra?: string;

  @IsString()
  @IsOptional()
  agentDisplayName?: string;

  @IsString()
  @IsOptional()
  systemPrompt?: string;

  @IsString()
  @IsOptional()
  customInstructions?: string;

  @IsString()
  @IsOptional()
  chatModel?: string;

  @IsNumber()
  @IsOptional()
  bufferDelayMs?: number;

  @IsNumber()
  @IsOptional()
  maxAttempts?: number;

  @IsNumber()
  @IsOptional()
  maxToolIterations?: number;

  @IsNumber()
  @IsOptional()
  inactivityTimeoutMs?: number;

  @IsNumber()
  @IsOptional()
  inactivityMaxWarnings?: number;

  @IsArray()
  @IsOptional()
  inactivityMessages?: string[];

  @IsString()
  @IsOptional()
  knowledgeTag?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}

@ApiTags('whatsapp-agents')
@Controller('whatsapp/agents')
export class WhatsAppAgentCrudController {
  private readonly logger = new Logger(WhatsAppAgentCrudController.name);

  constructor(
    private readonly agentService: WhatsAppAgentService,
    private readonly connManager: UazapiConnectionManager,
  ) {}

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a new WhatsApp agent' })
  async create(@Body() dto: CreateAgentDto) {
    const agent = await this.agentService.create(dto);
    return {
      ...this.serialize(agent),
      webhookUrl: `/webhook/whatsapp/${agent.slug}`,
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all WhatsApp agents' })
  async findAll() {
    const agents = await this.agentService.findAll();
    return agents.map((a) => ({
      ...this.serialize(a),
      webhookUrl: `/webhook/whatsapp/${a.slug}`,
    }));
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a specific WhatsApp agent by slug' })
  async findOne(@Param('slug') slug: string) {
    const agent = await this.agentService.findBySlug(slug);
    if (!agent) return { error: 'Agent not found' };
    return {
      ...this.serialize(agent),
      webhookUrl: `/webhook/whatsapp/${agent.slug}`,
    };
  }

  @Patch(':slug')
  @HttpCode(200)
  @ApiOperation({ summary: 'Update a WhatsApp agent' })
  async update(@Param('slug') slug: string, @Body() dto: UpdateAgentDto) {
    const agent = await this.agentService.update(slug, dto);
    this.connManager.invalidate(slug);
    return {
      ...this.serialize(agent),
      webhookUrl: `/webhook/whatsapp/${agent.slug}`,
    };
  }

  @Delete(':slug')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a WhatsApp agent' })
  async remove(@Param('slug') slug: string) {
    await this.agentService.remove(slug);
    this.connManager.invalidate(slug);
    return { deleted: slug };
  }

  @Post(':slug/test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Test Uazapi connection for an agent' })
  async testConnection(@Param('slug') slug: string) {
    const agent = await this.agentService.findBySlug(slug);
    if (!agent) return { ok: false, error: 'Agent not found' };

    this.connManager.invalidate(slug);
    const conn = this.connManager.getConnection(slug);
    if (!conn) return { ok: false, error: 'Cannot create connection (missing credentials)' };

    const result = await conn.testConnection();
    return { slug, ...result };
  }

  private serialize(agent: any): Record<string, any> {
    return {
      slug: agent.slug,
      name: agent.name,
      enabled: agent.enabled,
      uazapiBaseUrl: agent.uazapiBaseUrl,
      managerWhatsApp: agent.managerWhatsApp,
      mirrorWhatsAppExtra: agent.mirrorWhatsAppExtra,
      agentDisplayName: agent.agentDisplayName,
      chatModel: agent.chatModel,
      bufferDelayMs: agent.bufferDelayMs,
      maxAttempts: agent.maxAttempts,
      maxToolIterations: agent.maxToolIterations,
      knowledgeTag: agent.knowledgeTag,
      inactivityTimeoutMs: agent.inactivityTimeoutMs,
      inactivityMaxWarnings: agent.inactivityMaxWarnings,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    };
  }
}
