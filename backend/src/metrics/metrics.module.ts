import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Metric, MetricSchema } from './schemas/metric.schema';
import { Ticket, TicketSchema } from '../tickets/schemas/ticket.schema';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Metric.name, schema: MetricSchema },
      { name: Ticket.name, schema: TicketSchema },
    ]),
  ],
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
