import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WhatsAppConfigDocument = WhatsAppConfig & Document;

@Schema({ timestamps: true })
export class WhatsAppConfig {
  @Prop({ required: true, unique: true, default: 'default' })
  configId: string;

  @Prop({ default: '' })
  uazapiBaseUrl: string;

  @Prop({ default: '' })
  uazapiInstanceToken: string;

  @Prop({ default: '' })
  managerWhatsApp: string;

  /** Números extras (CSV) para espelhamento; alertas seguem só em managerWhatsApp. */
  @Prop({ default: '' })
  mirrorWhatsAppExtra: string;

  @Prop({ default: 'Renato Solves' })
  agentDisplayName: string;

  @Prop({ default: '' })
  webhookUrl: string;

  @Prop({ default: false })
  enabled: boolean;
}

export const WhatsAppConfigSchema = SchemaFactory.createForClass(WhatsAppConfig);
