import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import configuration from './config/configuration';
import { TicketsModule } from './tickets/tickets.module';
import { AuditModule } from './audit/audit.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { PoliciesModule } from './policies/policies.module';
import { MetricsModule } from './metrics/metrics.module';
import { LlmModule } from './agent/llm/llm.module';
import { AgentModule } from './agent/agent.module';
import { ZapFlowPgModule } from './zapflow/zapflow-pg.module';
import { WhatsAppModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '.env.example'],
    }),

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('database.uri'),
      }),
      inject: [ConfigService],
    }),

    ScheduleModule.forRoot(),
    ZapFlowPgModule,
    AuditModule,
    TicketsModule,
    KnowledgeModule,
    PoliciesModule,
    MetricsModule,
    LlmModule,
    AgentModule,
    WhatsAppModule,
  ],
})
export class AppModule {}
