import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export interface AuditLogInput {
  caseId: string;
  action: string;
  actor?: string;
  actorId?: string;
  details?: Record<string, any>;
  input?: Record<string, any>;
  output?: Record<string, any>;
  durationMs?: number;
  error?: string;
}

export interface AuditFilters {
  caseId?: string;
  action?: string;
  actor?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>,
  ) {}

  async log(data: AuditLogInput): Promise<AuditLog> {
    const entry = new this.auditModel({
      ...data,
      actor: data.actor || 'agent',
    });
    return entry.save();
  }

  async findByCaseId(caseId: string): Promise<AuditLog[]> {
    return this.auditModel
      .find({ caseId })
      .sort({ createdAt: 1 })
      .exec();
  }

  async findAll(filters: AuditFilters): Promise<PaginatedResult<AuditLog>> {
    const { caseId, action, actor, startDate, endDate, page = 1, limit = 50 } = filters;
    const query: FilterQuery<AuditLogDocument> = {};

    if (caseId) query.caseId = caseId;
    if (action) query.action = action;
    if (actor) query.actor = actor;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = startDate;
      if (endDate) query.createdAt.$lte = endDate;
    }

    const [data, total] = await Promise.all([
      this.auditModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.auditModel.countDocuments(query).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getTimeline(caseId: string): Promise<AuditLog[]> {
    return this.auditModel
      .find({ caseId })
      .sort({ createdAt: 1 })
      .exec();
  }

  async getStats(dateRange?: { start: Date; end: Date }): Promise<Record<string, any>> {
    const match: FilterQuery<AuditLogDocument> = {};
    if (dateRange) {
      match.createdAt = { $gte: dateRange.start, $lte: dateRange.end };
    }

    const [actionCounts, avgDuration, actorCounts] = await Promise.all([
      this.auditModel.aggregate([
        { $match: match },
        { $group: { _id: '$action', count: { $sum: 1 } } },
      ]),
      this.auditModel.aggregate([
        { $match: { ...match, durationMs: { $ne: null } } },
        {
          $group: {
            _id: '$action',
            avgDurationMs: { $avg: '$durationMs' },
            count: { $sum: 1 },
          },
        },
      ]),
      this.auditModel.aggregate([
        { $match: match },
        { $group: { _id: '$actor', count: { $sum: 1 } } },
      ]),
    ]);

    return {
      byAction: Object.fromEntries(actionCounts.map((a) => [a._id, a.count])),
      byActor: Object.fromEntries(actorCounts.map((a) => [a._id, a.count])),
      avgDuration: Object.fromEntries(
        avgDuration.map((d) => [d._id, { avgMs: d.avgDurationMs, count: d.count }]),
      ),
      total: await this.auditModel.countDocuments(match).exec(),
    };
  }
}
