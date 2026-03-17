import { Controller, Post, Get, Param, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { IsString, IsOptional, IsObject } from 'class-validator';
import { AgentService, ProcessCaseInput } from './agent.service';
import { AuditService } from '../audit/audit.service';

class ProcessCaseDto {
  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  ticketId?: string;

  @IsObject()
  @IsOptional()
  customer?: any;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}

class FollowUpDto {
  @IsString()
  caseId: string;

  @IsString()
  message: string;
}

@ApiTags('agent')
@Controller('agent')
export class AgentController {
  constructor(
    private readonly agentService: AgentService,
    private readonly auditService: AuditService,
  ) {}

  @Post('process')
  @HttpCode(200)
  @ApiOperation({ summary: 'Process a new support case through the autonomous agent' })
  @ApiBody({ type: ProcessCaseDto })
  @ApiResponse({ status: 200, description: 'Case processed successfully' })
  @ApiResponse({ status: 500, description: 'Agent processing failed' })
  async processCase(@Body() body: ProcessCaseDto) {
    const input: ProcessCaseInput = {
      message: body.message,
      ticketId: body.ticketId,
      customer: body.customer,
      metadata: body.metadata,
    };
    return this.agentService.processCase(input);
  }

  @Post('message')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a follow-up message to an existing case' })
  @ApiBody({ type: FollowUpDto })
  @ApiResponse({ status: 200, description: 'Follow-up processed' })
  async followUp(@Body() body: FollowUpDto) {
    return this.agentService.processCase({
      ticketId: body.caseId,
      message: body.message,
    });
  }

  @Get('status/:caseId')
  @ApiOperation({ summary: 'Get the current status and audit trail of a case' })
  @ApiResponse({ status: 200, description: 'Case status and timeline' })
  async getCaseStatus(@Param('caseId') caseId: string) {
    const timeline = await this.auditService.findByCaseId(caseId);
    const lastEntry = timeline[timeline.length - 1];

    return {
      caseId,
      status: lastEntry?.action?.includes('completed')
        ? 'completed'
        : lastEntry?.action?.includes('failed')
          ? 'failed'
          : 'in_progress',
      timeline,
      lastUpdated: (lastEntry as any)?.createdAt,
    };
  }
}
