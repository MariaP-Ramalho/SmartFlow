import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsBoolean,
  IsOptional,
  IsArray,
  IsNumber,
  ValidateNested,
} from 'class-validator';

export enum PolicyTrigger {
  REFUND = 'refund',
  RMA = 'rma',
  CANCELLATION = 'cancellation',
  WARRANTY_CLAIM = 'warranty_claim',
  SENSITIVE_DATA = 'sensitive_data',
  REPLACEMENT = 'replacement',
  DISCOUNT = 'discount',
  ACCOUNT_CREDIT = 'account_credit',
  ESCALATION = 'escalation',
}

export enum RiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export class PolicyConditionDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  field: string;

  @ApiProperty({ enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'] })
  @IsEnum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'])
  operator: string;

  @ApiProperty()
  @IsNotEmpty()
  value: any;
}

export class CreatePolicyDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: PolicyTrigger })
  @IsEnum(PolicyTrigger)
  trigger: string;

  @ApiPropertyOptional({ type: [PolicyConditionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PolicyConditionDto)
  conditions?: PolicyConditionDto[];

  @ApiPropertyOptional({ enum: RiskLevel, default: RiskLevel.MEDIUM })
  @IsOptional()
  @IsEnum(RiskLevel)
  riskLevel?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approvers?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  maxAutoAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;
}
