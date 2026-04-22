import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from '../agent/agent.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { VapiController } from './vapi.controller';
import { VapiService } from './vapi.service';

@Module({
  imports: [ConfigModule, AgentModule, WhatsAppModule],
  controllers: [VapiController],
  providers: [VapiService],
  exports: [VapiService],
})
export class VapiModule {}
