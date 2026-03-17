import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type TicketDocument = HydratedDocument<Ticket>;

@Schema({ _id: false })
export class CustomerInfo {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  phone?: string;

  @Prop()
  company?: string;

  @Prop()
  tier?: string;
}

@Schema({ _id: false })
export class ProductInfo {
  @Prop({ required: true })
  name: string;

  @Prop()
  version?: string;

  @Prop()
  serialNumber?: string;

  @Prop()
  sku?: string;
}

@Schema({ _id: false })
export class WarrantyInfo {
  @Prop({ required: true })
  active: boolean;

  @Prop()
  expiresAt?: Date;

  @Prop()
  type?: string;
}

@Schema({ _id: false })
export class DiagnosticStep {
  @Prop({ required: true })
  question: string;

  @Prop()
  answer?: string;

  @Prop()
  result?: string;

  @Prop()
  timestamp?: Date;
}

@Schema({ _id: false })
export class AgentActionRecord {
  @Prop({ required: true })
  action: string;

  @Prop({ required: true })
  tool: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  input?: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  output?: Record<string, any>;

  @Prop()
  durationMs?: number;

  @Prop({ default: () => new Date() })
  timestamp: Date;

  @Prop({ enum: ['success', 'failure', 'skipped'], default: 'success' })
  status: string;
}

@Schema({ _id: false })
export class Resolution {
  @Prop({ required: true })
  type: string;

  @Prop({ required: true })
  description: string;

  @Prop()
  approvedBy?: string;

  @Prop()
  approvedAt?: Date;
}

// ─── Conversation & Governance sub-documents ──────────────────

@Schema({ _id: false })
export class ConversationMessageMetadata {
  @Prop()
  phase?: string;

  @Prop()
  attemptNumber?: number;

  @Prop({ type: [String] })
  toolsUsed?: string[];

  @Prop({ type: [String] })
  knowledgeRefs?: string[];

  @Prop()
  confidence?: number;

  @Prop({ enum: ['low', 'medium', 'high'] })
  riskLevel?: string;

  @Prop()
  internalReasoning?: string;

  @Prop()
  zapflowIntId?: number;
}

@Schema({ _id: false })
export class ConversationMessage {
  @Prop({ required: true, enum: ['agent', 'customer', 'system'] })
  role: string;

  @Prop({ required: true })
  content: string;

  @Prop({ default: () => new Date() })
  timestamp: Date;

  @Prop({ type: ConversationMessageMetadata })
  metadata?: ConversationMessageMetadata;
}

@Schema({ _id: false })
export class SolutionAttempt {
  @Prop({ required: true })
  attemptNumber: number;

  @Prop({ required: true })
  solution: string;

  @Prop({ type: [String], default: [] })
  knowledgeSourcesUsed: string[];

  @Prop()
  clientFeedback?: string;

  @Prop({ enum: ['pending', 'success', 'failed'], default: 'pending' })
  outcome: string;

  @Prop()
  decisionTrace: string;

  @Prop({ default: () => new Date() })
  proposedAt: Date;

  @Prop()
  resolvedAt?: Date;
}

@Schema({ _id: false })
export class KnowledgeHit {
  @Prop({ required: true })
  documentId: string;

  @Prop({ required: true, enum: ['assistant_kb', 'daily_transcript', 'clickup_bug', 'resolved_case'] })
  source: string;

  @Prop({ required: true })
  title: string;

  @Prop()
  relevanceScore?: number;

  @Prop({ default: () => new Date() })
  consultedAt: Date;

  @Prop()
  usedInAttempt?: number;
}

@Schema({ _id: false })
export class EscalationRecord {
  @Prop({ required: true, enum: ['human', 'dev'] })
  type: string;

  @Prop({ required: true })
  reason: string;

  @Prop()
  clickupTaskId?: string;

  @Prop()
  clickupUrl?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  devPayload?: Record<string, any>;

  @Prop()
  handoffAnalystId?: number;

  @Prop()
  zapflowTransbordoId?: number;

  @Prop({ default: () => new Date() })
  escalatedAt: Date;
}

// ─── Main Ticket document ─────────────────────────────────────

@Schema({ timestamps: true, collection: 'tickets' })
export class Ticket {
  @Prop({ index: true })
  clickupId?: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  description: string;

  @Prop({
    required: true,
    enum: ['open', 'in_progress', 'waiting_approval', 'waiting_customer', 'resolved', 'closed', 'escalated'],
    default: 'open',
    index: true,
  })
  status: string;

  @Prop({
    required: true,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
    index: true,
  })
  priority: string;

  @Prop({ index: true })
  category?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: CustomerInfo })
  customer?: CustomerInfo;

  @Prop({ type: ProductInfo })
  product?: ProductInfo;

  @Prop({ type: WarrantyInfo })
  warranty?: WarrantyInfo;

  @Prop({ type: [DiagnosticStep], default: [] })
  diagnosticSteps: DiagnosticStep[];

  @Prop({ type: MongooseSchema.Types.Mixed })
  collectedInfo?: Record<string, any>;

  @Prop({ type: Resolution })
  resolution?: Resolution;

  @Prop({ type: [AgentActionRecord], default: [] })
  agentActions: AgentActionRecord[];

  @Prop()
  resolvedAt?: Date;

  @Prop()
  slaDeadline?: Date;

  @Prop({ default: false })
  resolvedByAgent: boolean;

  // ─── Conversation ───────────────────────────────────────────

  @Prop({ type: [ConversationMessage], default: [] })
  conversation: ConversationMessage[];

  @Prop({
    enum: [
      'greeting', 'understanding', 'collecting_evidence', 'validating',
      'diagnosing', 'proposing_solution', 'awaiting_confirmation',
      'closing', 'escalated_human', 'escalated_dev',
    ],
    default: 'greeting',
  })
  conversationPhase?: string;

  // ─── Governance ─────────────────────────────────────────────

  @Prop({ default: 0 })
  attemptCount: number;

  @Prop()
  lastAttemptAt?: Date;

  @Prop({
    enum: ['not_required', 'required', 'requested', 'received', 'sufficient', 'insufficient'],
    default: 'not_required',
  })
  evidenceStatus?: string;

  @Prop({ type: [SolutionAttempt], default: [] })
  attempts: SolutionAttempt[];

  @Prop({ type: [KnowledgeHit], default: [] })
  knowledgeHits: KnowledgeHit[];

  @Prop({ type: [EscalationRecord], default: [] })
  escalations: EscalationRecord[];

  @Prop({ type: [String], default: [] })
  decisionTrace: string[];

  // ─── ZapFlow link ───────────────────────────────────────────

  @Prop({ index: true })
  zapflowAteId?: number;

  @Prop()
  zapflowConversationId?: string;

  @Prop()
  customerPhone?: string;

  @Prop()
  systemName?: string;

  @Prop()
  zapflowSisId?: number;

  @Prop()
  zapflowEntId?: number;
}

export const TicketSchema = SchemaFactory.createForClass(Ticket);
TicketSchema.index({ zapflowAteId: 1 }, { sparse: true });
