import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  passwordHash: string;

  @Prop({ required: true })
  salt: string;

  @Prop({ default: 'analyst', enum: ['admin', 'analyst', 'viewer'] })
  role: string;

  @Prop({ default: true })
  active: boolean;

  @Prop({ default: false })
  pendingApproval: boolean;
}

export const UserSchema = SchemaFactory.createForClass(User);
