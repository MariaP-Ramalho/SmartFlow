import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type ApprovalDocument = HydratedDocument<Approval>;

@Schema({ timestamps: true, collection: 'approvals' })
export class Approval {
  @Prop({ required: true, index: true })
  policyId: string;

  @Prop({ required: true, index: true })
  caseId: string;

  @Prop({ required: true, index: true })
  ticketId: string;

  @Prop({ required: true })
  action: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  context?: Record<string, any>;

  @Prop({
    required: true,
    enum: ['pending', 'approved', 'rejected', 'expired'],
    default: 'pending',
    index: true,
  })
  status: string;

  @Prop()
  requestedBy?: string;

  @Prop()
  resolvedAt?: Date;

  @Prop()
  resolvedBy?: string;

  @Prop()
  reason?: string;
}

export const ApprovalSchema = SchemaFactory.createForClass(Approval);

ApprovalSchema.index({ status: 1, createdAt: -1 });
