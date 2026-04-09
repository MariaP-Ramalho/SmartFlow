import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Get audit log statistics' })
  @ApiQuery({ name: 'startDate', required: false, type: String, description: 'ISO date string' })
  @ApiQuery({ name: 'endDate', required: false, type: String, description: 'ISO date string' })
  getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const dateRange =
      startDate && endDate
        ? { start: new Date(startDate), end: new Date(endDate) }
        : undefined;
    return this.auditService.getStats(dateRange);
  }

  @Get('case/:caseId')
  @ApiOperation({ summary: 'Get audit timeline for a case' })
  @ApiParam({ name: 'caseId', description: 'Case/ticket ID' })
  getTimeline(@Param('caseId') caseId: string) {
    return this.auditService.getTimeline(caseId);
  }

  @Get('learning')
  @ApiOperation({ summary: 'Get daily learning history' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  async getLearningHistory(@Query('days') days?: string) {
    const limit = days ? Math.min(90, Math.max(1, parseInt(days, 10))) : 30;
    const result = await this.auditService.findAll({
      action: 'daily_agent_learning',
      limit,
      page: 1,
    });
    const reportLogs = await this.auditService.findAll({
      action: 'daily_report_zapflow',
      limit,
      page: 1,
    });
    return {
      learningLogs: result.data.map((log: any) => ({
        date: log.details?.date || log.createdAt,
        totalCases: log.details?.totalCases || 0,
        transferredLearned: log.details?.transferredLearned || 0,
        resolvedLearned: log.details?.resolvedLearned || 0,
        createdAt: log.createdAt,
      })),
      reportLogs: reportLogs.data.map((log: any) => ({
        date: log.details?.date || log.createdAt,
        ingestedCount: log.details?.ingestedCount || 0,
        createdAt: log.createdAt,
      })),
    };
  }

  @Get()
  @ApiOperation({ summary: 'List audit logs with filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'caseId', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('caseId') caseId?: string,
    @Query('action') action?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.auditService.findAll({
      page,
      limit,
      caseId,
      action,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }
}
