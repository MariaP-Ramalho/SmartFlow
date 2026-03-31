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

  @Prop({ default: 300000 })
  inactivityTimeoutMs: number;

  @Prop({ default: 3 })
  inactivityMaxWarnings: number;

  @Prop({
    type: [String],
    default: [
      'Olá, ainda está por aí? Estou aqui caso precise de ajuda.',
      'Tudo bem? Ainda estou à disposição para te ajudar.',
      'Como não recebi retorno, vou encerrar este atendimento. Caso precise, é só abrir um novo chamado que estaremos sempre à disposição!',
    ],
  })
  inactivityMessages: string[];
}

export const AgentConfigSchema = SchemaFactory.createForClass(AgentConfig);
