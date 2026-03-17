import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from '../agent/agent.module';
import { UazapiService } from './uazapi.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';

@Module({
  imports: [ConfigModule, AgentModule],
  controllers: [WhatsAppWebhookController],
  providers: [UazapiService],
  exports: [UazapiService],
})
export class WhatsAppModule {}
