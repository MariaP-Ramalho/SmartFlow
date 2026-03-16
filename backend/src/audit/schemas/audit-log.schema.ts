import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AuditLogDocument = HydratedDocument<AuditLog>;

@Schema({ timestamps: true, collection: 'audit_logs' })
export class AuditLog {
  @Prop({ required: true, index: true })
  caseId: string;

  @Prop({ required: true, index: true })
  action: string;

  @Prop({ required: true, enum: ['agent', 'human', 'system'], default: 'agent' })
  actor: string;

  @Prop()
  actorId?: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  details?: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  input?: Record<string, any>;

  @Prop({ type: MongooseSchema.Types.Mixed })
  output?: Record<string, any>;

  @Prop()
  durationMs?: number;

  @Prop()
  error?: string;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ caseId: 1, createdAt: 1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
