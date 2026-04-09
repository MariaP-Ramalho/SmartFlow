import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TicketsModule } from '../tickets/tickets.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { PoliciesModule } from '../policies/policies.module';
import { ZapFlowPgModule } from '../zapflow/zapflow-pg.module';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';
import { AgentConfig, AgentConfigSchema } from './schemas/agent-config.schema';
import { ReferenceCase, ReferenceCaseSchema } from './schemas/reference-case.schema';
import { ReferenceCaseService } from './reference-case.service';
import { ToolRegistry } from './tools/tool-registry';
import { TicketTool } from './tools/ticket.tool';
import { KnowledgeTool } from './tools/knowledge.tool';
import { DiagnosticTool } from './tools/diagnostic.tool';
import { PolicyCheckTool } from './tools/policy-check.tool';
import { DevBugTool } from './tools/dev-bug.tool';
import { PastCasesTool } from './tools/past-cases.tool';
import { NotifyManagerTool } from './tools/notify-manager.tool';
import { TransferAtendimentoTool } from './tools/transfer-atendimento.tool';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { ConversationService } from './conversation.service';
import { WebhookController } from './webhook.controller';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AgentConfigService } from './agent-config.service';
import { DailyReportService } from './daily-report.service';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: ChatSession.name, schema: ChatSessionSchema },
      { name: AgentConfig.name, schema: AgentConfigSchema },
      { name: ReferenceCase.name, schema: ReferenceCaseSchema },
    ]),
    TicketsModule, KnowledgeModule, PoliciesModule, ZapFlowPgModule,
  ],
  controllers: [AgentController, WebhookController, ChatController],
  providers: [
    ToolRegistry,
    TicketTool,
    KnowledgeTool,
    DiagnosticTool,
    PolicyCheckTool,
    DevBugTool,
    PastCasesTool,
    NotifyManagerTool,
    TransferAtendimentoTool,
    AgentService,
    ConversationService,
    ChatService,
    AgentConfigService,
    DailyReportService,
    ReferenceCaseService,
  ],
  exports: [AgentService, ConversationService, ChatService, AgentConfigService, ReferenceCaseService],
})
export class AgentModule implements OnModuleInit {
  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly ticketTool: TicketTool,
    private readonly knowledgeTool: KnowledgeTool,
    private readonly diagnosticTool: DiagnosticTool,
    private readonly policyCheckTool: PolicyCheckTool,
    private readonly devBugTool: DevBugTool,
    private readonly pastCasesTool: PastCasesTool,
    private readonly notifyManagerTool: NotifyManagerTool,
    private readonly transferTool: TransferAtendimentoTool,
  ) {}

  onModuleInit() {
    this.toolRegistry.register(this.ticketTool);
    this.toolRegistry.register(this.knowledgeTool);
    this.toolRegistry.register(this.diagnosticTool);
    this.toolRegistry.register(this.policyCheckTool);
    this.toolRegistry.register(this.devBugTool);
    this.toolRegistry.register(this.pastCasesTool);
    this.toolRegistry.register(this.notifyManagerTool);
    this.toolRegistry.register(this.transferTool);
  }
}
