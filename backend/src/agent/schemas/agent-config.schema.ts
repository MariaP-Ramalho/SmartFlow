import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AgentConfigDocument = AgentConfig & Document;

@Schema({ timestamps: true })
export class AgentConfig {
  @Prop({ required: true, unique: true, default: 'default' })
  configId: string;

  @Prop({ required: true })
  systemPrompt: string;

  @Prop({ default: 4000 })
  bufferDelayMs: number;

  @Prop({ default: 'gpt-5.2' })
  chatModel: string;

  @Prop({ default: 3 })
  maxAttempts: number;

  @Prop({ default: 5 })
  maxToolIterations: number;

  @Prop({ default: 'Renato Solves' })
  agentDisplayName: string;

  @Prop({ default: '' })
  customInstructions: string;
}

export const AgentConfigSchema = SchemaFactory.createForClass(AgentConfig);
