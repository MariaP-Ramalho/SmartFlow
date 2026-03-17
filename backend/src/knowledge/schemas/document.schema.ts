import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type KnowledgeDocumentDoc = HydratedDocument<KnowledgeDocument>;

@Schema({ timestamps: true, collection: 'knowledge_documents' })
export class KnowledgeDocument {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  content: string;

  @Prop({ index: true })
  category?: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: [Number], default: [] })
  embedding: number[];

  @Prop({
    required: true,
    enum: ['faq', 'manual', 'past_ticket', 'internal_doc', 'pdf_upload', 'web_crawl', 'assistant_kb', 'daily_transcript', 'clickup_bug', 'resolved_case'],
    default: 'internal_doc',
  })
  source: string;

  @Prop()
  chunkIndex?: number;

  @Prop()
  parentDocId?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const KnowledgeDocumentSchema = SchemaFactory.createForClass(KnowledgeDocument);

KnowledgeDocumentSchema.index({ category: 1, source: 1 });
KnowledgeDocumentSchema.index({ tags: 1 });
