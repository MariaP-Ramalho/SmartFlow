import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AgentModule } from '../agent/agent.module';
import { UazapiService } from './uazapi.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppConfigController } from './whatsapp-config.controller';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppConfig, WhatsAppConfigSchema } from './schemas/whatsapp-config.schema';

@Module({
  imports: [
    ConfigModule,
    AgentModule,
    MongooseModule.forFeature([
      { name: WhatsAppConfig.name, schema: WhatsAppConfigSchema },
    ]),
  ],
  controllers: [WhatsAppWebhookController, WhatsAppConfigController],
  providers: [UazapiService, WhatsAppConfigService],
  exports: [UazapiService, WhatsAppConfigService],
})
export class WhatsAppModule {}
