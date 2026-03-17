import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type MetricDocument = HydratedDocument<Metric>;

@Schema({ timestamps: true, collection: 'metrics' })
export class Metric {
  @Prop({ required: true, enum: ['daily', 'weekly', 'monthly'], index: true })
  period: string;

  @Prop({ required: true, index: true })
  date: Date;

  @Prop({ required: true, default: 0 })
  totalCases: number;

  @Prop({ required: true, default: 0 })
  resolvedWithoutHuman: number;

  @Prop({ required: true, default: 0 })
  resolvedWithHuman: number;

  @Prop({ required: true, default: 0 })
  escalated: number;

  @Prop({ required: true, default: 0 })
  avgResolutionTimeMs: number;

  @Prop({ required: true, default: 0 })
  backlogCount: number;

  @Prop({ default: 0 })
  customerSatisfaction?: number;

  @Prop({ default: 0 })
  slaBreaches: number;

  @Prop({ type: Object })
  categoryBreakdown?: Record<string, number>;

  @Prop({ type: Object })
  priorityBreakdown?: Record<string, number>;
}

export const MetricSchema = SchemaFactory.createForClass(Metric);

MetricSchema.index({ period: 1, date: -1 }, { unique: true });
