import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WhatsAppAgentDocument = WhatsAppAgent & Document;

@Schema({ timestamps: true })
export class WhatsAppAgent {
  @Prop({ required: true, unique: true, index: true })
  slug: string;

  @Prop({ required: true })
  name: string;

  @Prop({ default: true })
  enabled: boolean;

  // ─── Uazapi connection ────────────────────────────────────
  @Prop({ required: true })
  uazapiBaseUrl: string;

  @Prop({ required: true })
  uazapiInstanceToken: string;

  // ─── WhatsApp config ──────────────────────────────────────
  @Prop({ default: '' })
  managerWhatsApp: string;

  @Prop({ default: '' })
  mirrorWhatsAppExtra: string;

  @Prop({ default: 'Agente IA' })
  agentDisplayName: string;

  // ─── Agent behavior ───────────────────────────────────────
  @Prop({ default: '' })
  systemPrompt: string;

  @Prop({ default: '' })
  customInstructions: string;

  @Prop({ default: 'gpt-4o' })
  chatModel: string;

  @Prop({ default: 15000 })
  bufferDelayMs: number;

  @Prop({ default: 3 })
  maxAttempts: number;

  @Prop({ default: 5 })
  maxToolIterations: number;

  // ─── Inactivity ───────────────────────────────────────────
  @Prop({ default: 600000 })
  inactivityTimeoutMs: number;

  @Prop({ default: 3 })
  inactivityMaxWarnings: number;

  @Prop({
    type: [String],
    default: [
      'Olá, ainda está por aí? Estou aqui caso precise de ajuda.',
      'Tudo bem? Ainda estou à disposição para te ajudar.',
      'Como não recebi retorno, vou encerrar este atendimento. Caso precise, é só abrir um novo chamado!',
    ],
  })
  inactivityMessages: string[];

  // ─── Knowledge filter ─────────────────────────────────────
  @Prop({ default: '' })
  knowledgeTag: string;
}

export const WhatsAppAgentSchema = SchemaFactory.createForClass(WhatsAppAgent);
