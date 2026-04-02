import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'reference_cases' })
export class ReferenceCase {
  @Prop({ required: true })
  phone: string;

  @Prop({ required: true })
  customerName: string;

  @Prop({ default: '' })
  systemName: string;

  @Prop({ default: '' })
  entityName: string;

  @Prop({ default: '' })
  analystName: string;

  @Prop({ type: [{ role: String, content: String, timestamp: Date }], default: [] })
  conversation: { role: string; content: string; timestamp?: Date }[];

  @Prop({ default: '' })
  problemSummary: string;

  @Prop({ default: '' })
  solutionSummary: string;

  @Prop({ type: [String], default: [] })
  keywords: string[];

  @Prop({ default: 'resolved' })
  outcome: string;
}

export type ReferenceCaseDocument = ReferenceCase & Document;
export const ReferenceCaseSchema = SchemaFactory.createForClass(ReferenceCase);

ReferenceCaseSchema.index({ keywords: 'text', problemSummary: 'text', solutionSummary: 'text' });
