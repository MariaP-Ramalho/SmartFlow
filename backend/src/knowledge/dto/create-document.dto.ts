import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsArray,
  IsObject,
} from 'class-validator';

export enum DocumentSource {
  FAQ = 'faq',
  MANUAL = 'manual',
  PAST_TICKET = 'past_ticket',
  INTERNAL_DOC = 'internal_doc',
  PDF_UPLOAD = 'pdf_upload',
  WEB_CRAWL = 'web_crawl',
}

export class CreateDocumentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: DocumentSource, default: DocumentSource.INTERNAL_DOC })
  @IsOptional()
  @IsEnum(DocumentSource)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
