import { Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TicketsModule } from '../tickets/tickets.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { PoliciesModule } from '../policies/policies.module';
import { ZapFlowPgModule } from '../zapflow/zapflow-pg.module';
import { ChatSession, ChatSessionSchema } from './schemas/chat-session.schema';
import { ToolRegistry } from './tools/tool-registry';
import { TicketTool } from './tools/ticket.tool';
import { KnowledgeTool } from './tools/knowledge.tool';
import { DiagnosticTool } from './tools/diagnostic.tool';
import { PolicyCheckTool } from './tools/policy-check.tool';
import { DevBugTool } from './tools/dev-bug.tool';
import { PastCasesTool } from './tools/past-cases.tool';
import { AgentService } from './agent.service';
import { AgentController } from './agent.controller';
import { ConversationService } from './conversation.service';
import { WebhookController } from './webhook.controller';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { DailyReportService } from './daily-report.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ChatSession.name, schema: ChatSessionSchema }]),
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
    AgentService,
    ConversationService,
    ChatService,
    DailyReportService,
  ],
  exports: [AgentService, ConversationService, ChatService],
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
  ) {}

  onModuleInit() {
    this.toolRegistry.register(this.ticketTool);
    this.toolRegistry.register(this.knowledgeTool);
    this.toolRegistry.register(this.diagnosticTool);
    this.toolRegistry.register(this.policyCheckTool);
    this.toolRegistry.register(this.devBugTool);
    this.toolRegistry.register(this.pastCasesTool);
  }
}
