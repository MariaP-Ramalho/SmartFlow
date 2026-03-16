import { Controller, Get, Post, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('summary')
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  getSummary(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.metricsService.getSummary(
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('timeseries')
  @ApiQuery({ name: 'period', required: false })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  getTimeSeries(
    @Query('period') period = 'daily',
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.metricsService.getTimeSeries(
      period,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('dashboard')
  getDashboard() {
    return this.metricsService.getDashboard();
  }

  @Post('compute')
  @ApiQuery({ name: 'date', required: false })
  compute(@Query('date') date?: string) {
    return this.metricsService.computeDaily(date ? new Date(date) : new Date());
  }
}
