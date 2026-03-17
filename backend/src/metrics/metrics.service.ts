import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Metric, MetricDocument } from './schemas/metric.schema';
import { Ticket, TicketDocument } from '../tickets/schemas/ticket.schema';

@Injectable()
export class MetricsService {
  constructor(
    @InjectModel(Metric.name) private metricModel: Model<MetricDocument>,
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
  ) {}

  async computeDaily(date: Date): Promise<Metric> {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    const dateFilter = { createdAt: { $gte: start, $lte: end } };

    const [
      totalCases,
      resolvedWithoutHuman,
      resolvedWithHuman,
      escalated,
      avgResolution,
      backlogCount,
      categoryBreakdown,
      priorityBreakdown,
    ] = await Promise.all([
      this.ticketModel.countDocuments(dateFilter),
      this.ticketModel.countDocuments({
        ...dateFilter,
        status: { $in: ['resolved', 'closed'] },
        resolvedByAgent: true,
      }),
      this.ticketModel.countDocuments({
        ...dateFilter,
        status: { $in: ['resolved', 'closed'] },
        resolvedByAgent: false,
      }),
      this.ticketModel.countDocuments({ ...dateFilter, status: 'escalated' }),
      this.ticketModel.aggregate([
        { $match: { ...dateFilter, resolvedAt: { $ne: null } } },
        {
          $group: {
            _id: null,
            avg: { $avg: { $subtract: ['$resolvedAt', '$createdAt'] } },
          },
        },
      ]),
      this.ticketModel.countDocuments({
        status: { $in: ['open', 'in_progress', 'waiting_customer', 'waiting_approval'] },
      }),
      this.ticketModel.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      this.ticketModel.aggregate([
        { $match: dateFilter },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
    ]);

    const metricData = {
      period: 'daily' as const,
      date: start,
      totalCases,
      resolvedWithoutHuman,
      resolvedWithHuman,
      escalated,
      avgResolutionTimeMs: avgResolution[0]?.avg ?? 0,
      backlogCount,
      slaBreaches: 0,
      categoryBreakdown: Object.fromEntries(
        categoryBreakdown.map((c) => [c._id ?? 'uncategorized', c.count]),
      ),
      priorityBreakdown: Object.fromEntries(
        priorityBreakdown.map((p) => [p._id ?? 'unknown', p.count]),
      ),
    };

    return this.metricModel
      .findOneAndUpdate(
        { period: 'daily', date: start },
        { $set: metricData },
        { new: true, upsert: true },
      )
      .exec();
  }

  async getSummary(
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, any>> {
    const metrics = await this.metricModel
      .find({ date: { $gte: startDate, $lte: endDate } })
      .exec();

    if (metrics.length === 0) {
      return {
        totalCases: 0,
        resolvedWithoutHuman: 0,
        resolvedWithHuman: 0,
        escalated: 0,
        avgResolutionTimeMs: 0,
        backlogCount: 0,
        slaBreaches: 0,
      };
    }

    const sum = (fn: (m: Metric) => number) =>
      metrics.reduce((acc, m) => acc + fn(m), 0);

    return {
      totalCases: sum((m) => m.totalCases),
      resolvedWithoutHuman: sum((m) => m.resolvedWithoutHuman),
      resolvedWithHuman: sum((m) => m.resolvedWithHuman),
      escalated: sum((m) => m.escalated),
      avgResolutionTimeMs:
        sum((m) => m.avgResolutionTimeMs) / metrics.length,
      backlogCount: metrics[metrics.length - 1]?.backlogCount ?? 0,
      slaBreaches: sum((m) => m.slaBreaches),
      days: metrics.length,
    };
  }

  async getTimeSeries(
    period: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Metric[]> {
    return this.metricModel
      .find({ period, date: { $gte: startDate, $lte: endDate } })
      .sort({ date: 1 })
      .exec();
  }

  async getDashboard(): Promise<Record<string, any>> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [todayMetric, weekMetrics] = await Promise.all([
      this.metricModel.findOne({ period: 'daily', date: today }).exec(),
      this.metricModel
        .find({ period: 'daily', date: { $gte: weekAgo, $lte: today } })
        .sort({ date: 1 })
        .exec(),
    ]);

    const prevWeekStart = new Date(weekAgo);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekMetrics = await this.metricModel
      .find({
        period: 'daily',
        date: { $gte: prevWeekStart, $lt: weekAgo },
      })
      .exec();

    const sumField = (arr: Metric[], fn: (m: Metric) => number) =>
      arr.reduce((acc, m) => acc + fn(m), 0);

    const thisWeekTotal = sumField(weekMetrics, (m) => m.totalCases);
    const prevWeekTotal = sumField(prevWeekMetrics, (m) => m.totalCases);
    const trend =
      prevWeekTotal === 0
        ? 0
        : ((thisWeekTotal - prevWeekTotal) / prevWeekTotal) * 100;

    return {
      today: todayMetric ?? null,
      weekTimeSeries: weekMetrics,
      trend: { totalCasesDelta: Math.round(trend * 100) / 100 },
    };
  }
}
