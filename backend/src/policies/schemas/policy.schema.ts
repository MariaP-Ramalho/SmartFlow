import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type PolicyDocument = HydratedDocument<Policy>;

@Schema({ _id: false })
export class PolicyCondition {
  @Prop({ required: true })
  field: string;

  @Prop({
    required: true,
    enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'],
  })
  operator: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  value: any;
}

@Schema({ timestamps: true, collection: 'policies' })
export class Policy {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({
    required: true,
    enum: ['refund', 'rma', 'cancellation', 'warranty_claim', 'sensitive_data', 'replacement', 'discount', 'account_credit', 'escalation'],
    index: true,
  })
  trigger: string;

  @Prop({ type: [PolicyCondition], default: [] })
  conditions: PolicyCondition[];

  @Prop({
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  })
  riskLevel: string;

  @Prop({ required: true, default: true })
  requiresApproval: boolean;

  @Prop({ type: [String], default: [] })
  approvers: string[];

  @Prop()
  maxAutoAmount?: number;

  @Prop({ required: true, default: true })
  active: boolean;

  @Prop()
  description?: string;
}

export const PolicySchema = SchemaFactory.createForClass(Policy);
