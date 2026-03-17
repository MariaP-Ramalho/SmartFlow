import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class ChatMessage {
  @Prop({ required: true, enum: ['user', 'agent'] })
  role: string;

  @Prop({ required: true })
  content: string;

  @Prop()
  timestamp: Date;

  @Prop({ type: Object })
  meta?: Record<string, any>;
}

const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

@Schema({ timestamps: true, collection: 'chat_sessions' })
export class ChatSession {
  @Prop({ required: true, unique: true })
  sessionId: string;

  @Prop({ default: 'Sistema de Teste' })
  systemName: string;

  @Prop({ default: 'Usuário' })
  customerName: string;

  @Prop({ type: [ChatMessageSchema], default: [] })
  messages: ChatMessage[];

  @Prop({ type: [String], default: [] })
  toolsUsed: string[];

  @Prop({ type: [String], default: [] })
  knowledgeSourcesUsed: string[];

  @Prop({ default: 0 })
  attemptCount: number;

  @Prop({ default: 'active', enum: ['active', 'resolved', 'escalated'] })
  status: string;

  @Prop()
  closedAt?: Date;
}

export type ChatSessionDocument = ChatSession & Document;
export const ChatSessionSchema = SchemaFactory.createForClass(ChatSession);
