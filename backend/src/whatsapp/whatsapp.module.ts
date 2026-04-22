import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AgentModule } from '../agent/agent.module';
import { UazapiService } from './uazapi.service';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller';
import { WhatsAppConfigController } from './whatsapp-config.controller';
import { WhatsAppConfigService } from './whatsapp-config.service';
import { WhatsAppConfig, WhatsAppConfigSchema } from './schemas/whatsapp-config.schema';
import { WhatsAppAgent, WhatsAppAgentSchema } from './schemas/whatsapp-agent.schema';
import { WhatsAppAgentService } from './whatsapp-agent.service';
import { WhatsAppAgentCrudController } from './whatsapp-agent-crud.controller';
import { UazapiConnectionManager } from './uazapi-connection-manager.service';

@Module({
  imports: [
    ConfigModule,
    AgentModule,
    MongooseModule.forFeature([
      { name: WhatsAppConfig.name, schema: WhatsAppConfigSchema },
      { name: WhatsAppAgent.name, schema: WhatsAppAgentSchema },
    ]),
  ],
  controllers: [WhatsAppWebhookController, WhatsAppConfigController, WhatsAppAgentCrudController],
  providers: [UazapiService, WhatsAppConfigService, WhatsAppAgentService, UazapiConnectionManager],
  exports: [UazapiService, WhatsAppConfigService, WhatsAppAgentService, UazapiConnectionManager],
})
export class WhatsAppModule {}
