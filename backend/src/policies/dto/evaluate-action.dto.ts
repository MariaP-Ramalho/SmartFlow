import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsObject, IsOptional } from 'class-validator';

export class EvaluateActionDto {
  @ApiProperty({ description: 'Action type to evaluate (e.g. refund, rma)' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiPropertyOptional({ description: 'Context data for condition evaluation' })
  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}
