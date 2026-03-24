import {
  Controller, Get, Patch, Post, Body, Request, HttpCode,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { UazapiService } from './uazapi.service';

@ApiTags('whatsapp-config')
@Controller('whatsapp/config')
export class WhatsAppConfigController {
  constructor(
    private readonly configService: WhatsAppConfigService,
    private readonly uazapi: UazapiService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get WhatsApp configuration (admin)' })
  async getConfig(@Request() req: any) {
    this.requireAdmin(req);
    const cfg = await this.configService.getConfig();
    return {
      uazapiBaseUrl: cfg.uazapiBaseUrl,
      uazapiInstanceToken: cfg.uazapiInstanceToken ? '••••' + cfg.uazapiInstanceToken.slice(-6) : '',
      managerWhatsApp: cfg.managerWhatsApp,
      mirrorWhatsAppExtra: cfg.mirrorWhatsAppExtra || '',
      mirrorRecipientCount: this.configService.getMirrorRecipientPhones().length,
      agentDisplayName: cfg.agentDisplayName,
      webhookUrl: cfg.webhookUrl,
      enabled: cfg.enabled,
      connected: this.uazapi.isConnected,
      updatedAt: (cfg as any).updatedAt,
    };
  }

  @Patch()
  @HttpCode(200)
  @ApiOperation({ summary: 'Update WhatsApp configuration (admin)' })
  async updateConfig(@Request() req: any, @Body() body: any) {
    this.requireAdmin(req);

    const allowed = [
      'uazapiBaseUrl', 'uazapiInstanceToken', 'managerWhatsApp', 'mirrorWhatsAppExtra',
      'agentDisplayName', 'webhookUrl', 'enabled',
    ];
    const updates: Record<string, any> = {};
    for (const key of allowed) {
      if (body[key] !== undefined) updates[key] = body[key];
    }

    const config = await this.configService.updateConfig(updates);

    if (updates.uazapiBaseUrl !== undefined || updates.uazapiInstanceToken !== undefined) {
      await this.uazapi.reload();
    }

    return {
      message: 'Configuração WhatsApp atualizada.',
      connected: this.uazapi.isConnected,
      updatedAt: (config as any).updatedAt,
    };
  }

  @Post('test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Test WhatsApp connection (admin)' })
  async testConnection(@Request() req: any) {
    this.requireAdmin(req);
    const result = await this.uazapi.testConnection();
    return { ...result, baseUrl: this.configService.getUazapiBaseUrl() };
  }

  @Post('reload')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reload Uazapi connection from saved config (admin)' })
  async reload(@Request() req: any) {
    this.requireAdmin(req);
    const result = await this.uazapi.reload();
    return { message: 'Conexão recarregada.', ...result };
  }

  private requireAdmin(req: any): void {
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException('Acesso restrito a administradores');
    }
  }
}
