import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import {
  Ticket,
  TicketDocument,
  ConversationMessage,
  SolutionAttempt,
  KnowledgeHit,
  EscalationRecord,
} from './schemas/ticket.schema';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto, TicketStatus } from './dto/update-ticket.dto';
import { ClickUpClient, ClickUpTask } from './clickup.client';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TicketFilters {
  status?: string;
  priority?: string;
  category?: string;
  search?: string;
  page?: number;
  limit?: number;
}

const PRIORITY_TO_CLICKUP: Record<string, number> = {
  urgent: 1,
  high: 2,
  medium: 3,
  low: 4,
};

const CLICKUP_TO_PRIORITY: Record<number, string> = {
  1: 'urgent',
  2: 'high',
  3: 'medium',
  4: 'low',
};

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    private readonly clickUp: ClickUpClient,
  ) {}

  async create(
    dto: CreateTicketDto,
    syncToClickUp = false,
  ): Promise<TicketDocument> {
    const ticket = new this.ticketModel({
      ...dto,
      status: 'open',
    });
    const saved = await ticket.save();

    if (syncToClickUp) {
      try {
        await this.syncToClickUp(saved._id.toString());
      } catch (error) {
        this.logger.warn(
          `Ticket created but ClickUp sync failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return saved;
  }

  async findAll(filters: TicketFilters): Promise<PaginatedResult<Ticket>> {
    const { status, priority, category, search, page = 1, limit = 20 } = filters;
    const query: FilterQuery<TicketDocument> = {};

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.ticketModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.ticketModel.countDocuments(query).exec(),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<Ticket> {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  async findByClickUpId(clickupId: string): Promise<any> {
    return this.ticketModel.findOne({ clickupId }).exec();
  }

  async setClickUpId(id: string, clickupId: string, status?: string): Promise<any> {
    const update: any = { clickupId };
    if (status) update.status = status;
    return this.ticketModel.findByIdAndUpdate(id, { $set: update }, { new: true }).exec();
  }

  async update(id: string, dto: UpdateTicketDto): Promise<Ticket> {
    const ticket = await this.ticketModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .exec();
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  async updateStatus(id: string, status: TicketStatus): Promise<Ticket> {
    const ticket = await this.ticketModel.findById(id).exec();
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);

    const validTransitions: Record<string, string[]> = {
      open: ['in_progress', 'escalated', 'closed'],
      in_progress: ['waiting_approval', 'waiting_customer', 'resolved', 'escalated'],
      waiting_approval: ['in_progress', 'resolved', 'escalated'],
      waiting_customer: ['in_progress', 'resolved', 'closed'],
      resolved: ['closed', 'in_progress'],
      escalated: ['in_progress', 'closed'],
      closed: ['in_progress'],
    };

    const allowed = validTransitions[ticket.status] || [];
    if (!allowed.includes(status)) {
      throw new NotFoundException(
        `Cannot transition from "${ticket.status}" to "${status}"`,
      );
    }

    ticket.status = status;
    return ticket.save();
  }

  async addAgentAction(
    id: string,
    action: { action: string; tool: string; input?: Record<string, any>; output?: Record<string, any>; durationMs?: number; status?: string },
  ): Promise<Ticket> {
    const ticket = await this.ticketModel
      .findByIdAndUpdate(
        id,
        {
          $push: {
            agentActions: { ...action, timestamp: new Date() },
          },
        },
        { new: true },
      )
      .exec();
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  async resolve(
    id: string,
    resolution: { type: string; description: string; approvedBy?: string },
  ): Promise<Ticket> {
    const ticket = await this.ticketModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            resolution,
            status: 'resolved',
            resolvedAt: new Date(),
            resolvedByAgent: !resolution.approvedBy,
          },
        },
        { new: true },
      )
      .exec();
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  async getStats(): Promise<Record<string, any>> {
    const [statusCounts, priorityCounts, avgResolution] = await Promise.all([
      this.ticketModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.ticketModel.aggregate([
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      this.ticketModel.aggregate([
        { $match: { resolvedAt: { $ne: null } } },
        {
          $project: {
            resolutionTime: {
              $subtract: ['$resolvedAt', '$createdAt'],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgResolutionMs: { $avg: '$resolutionTime' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    return {
      byStatus: Object.fromEntries(statusCounts.map((s) => [s._id, s.count])),
      byPriority: Object.fromEntries(priorityCounts.map((p) => [p._id, p.count])),
      resolution: avgResolution[0] || { avgResolutionMs: 0, count: 0 },
      total: await this.ticketModel.countDocuments().exec(),
    };
  }

  async syncToClickUp(ticketId: string): Promise<TicketDocument> {
    const ticket = await this.ticketModel.findById(ticketId).exec();
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} not found`);

    const taskData = this.toClickUpTaskData(ticket);

    if (!ticket.clickupId) {
      const created = await this.clickUp.createTask(undefined, taskData);
      ticket.clickupId = created.id;
      await ticket.save();
      this.logger.log(
        `Synced ticket ${ticketId} -> new ClickUp task ${created.id}`,
      );
    } else {
      await this.clickUp.updateTask(ticket.clickupId, taskData);
      this.logger.log(
        `Synced ticket ${ticketId} -> updated ClickUp task ${ticket.clickupId}`,
      );
    }

    return ticket;
  }

  async syncFromClickUp(clickupTaskId: string): Promise<TicketDocument> {
    const clickUpTask = await this.clickUp.getTask(clickupTaskId);

    let ticket = await this.ticketModel
      .findOne({ clickupId: clickupTaskId })
      .exec();

    const ticketFields = this.fromClickUpTask(clickUpTask);

    if (ticket) {
      Object.assign(ticket, ticketFields);
      await ticket.save();
      this.logger.log(
        `Synced ClickUp task ${clickupTaskId} -> updated ticket ${ticket._id}`,
      );
    } else {
      ticket = new this.ticketModel({
        ...ticketFields,
        clickupId: clickupTaskId,
      });
      await ticket.save();
      this.logger.log(
        `Synced ClickUp task ${clickupTaskId} -> new ticket ${ticket._id}`,
      );
    }

    return ticket;
  }

  private toClickUpTaskData(
    ticket: TicketDocument,
  ): { name: string; description?: string; priority?: number; tags?: string[]; status?: string } {
    return {
      name: ticket.title,
      description: ticket.description,
      priority: PRIORITY_TO_CLICKUP[ticket.priority] ?? 3,
      tags: ticket.tags,
      status: ticket.status,
    };
  }

  private fromClickUpTask(
    task: ClickUpTask,
  ): Partial<Ticket> {
    const priorityId = task.priority ? Number(task.priority.id) : 3;
    return {
      title: task.name,
      description: task.description || '',
      status: task.status?.status || 'open',
      priority: CLICKUP_TO_PRIORITY[priorityId] || 'medium',
      tags: task.tags?.map((t) => t.name) || [],
    };
  }

  // ─── Conversation & Governance methods ──────────────────────

  async findByZapflowAteId(zapflowAteId: number): Promise<TicketDocument | null> {
    return this.ticketModel.findOne({ zapflowAteId }).exec();
  }

  async addConversationMessage(
    id: string,
    message: Partial<ConversationMessage>,
  ): Promise<Ticket> {
    const ticket = await this.ticketModel
      .findByIdAndUpdate(
        id,
        { $push: { conversation: { ...message, timestamp: message.timestamp || new Date() } } },
        { new: true },
      )
      .exec();
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  async getConversation(id: string): Promise<ConversationMessage[]> {
    const ticket = await this.ticketModel.findById(id).select('conversation').exec();
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket.conversation || [];
  }

  async recordAttempt(id: string, attempt: Partial<SolutionAttempt>): Promise<Ticket> {
    const ticket = await this.ticketModel
      .findByIdAndUpdate(
        id,
        {
          $push: { attempts: { ...attempt, proposedAt: attempt.proposedAt || new Date() } },
          $inc: { attemptCount: 1 },
          $set: { lastAttemptAt: new Date() },
        },
        { new: true },
      )
      .exec();
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  async updateAttemptOutcome(
    id: string,
    attemptNumber: number,
    outcome: 'success' | 'failed',
    clientFeedback: string,
  ): Promise<Ticket> {
    const ticket = await this.ticketModel
      .findOneAndUpdate(
        { _id: id, 'attempts.attemptNumber': attemptNumber },
        {
          $set: {
            'attempts.$.outcome': outcome,
            'attempts.$.clientFeedback': clientFeedback,
            'attempts.$.resolvedAt': new Date(),
          },
        },
        { new: true },
      )
      .exec();
    if (!ticket) throw new NotFoundException(`Ticket ${id} / attempt ${attemptNumber} not found`);
    return ticket;
  }

  async recordKnowledgeHit(id: string, hit: Partial<KnowledgeHit>): Promise<void> {
    await this.ticketModel.findByIdAndUpdate(id, {
      $push: { knowledgeHits: { ...hit, consultedAt: hit.consultedAt || new Date() } },
    }).exec();
  }

  async recordKnowledgeHits(id: string, hits: Partial<KnowledgeHit>[]): Promise<void> {
    if (hits.length === 0) return;
    const withTimestamp = hits.map((h) => ({ ...h, consultedAt: h.consultedAt || new Date() }));
    await this.ticketModel.findByIdAndUpdate(id, {
      $push: { knowledgeHits: { $each: withTimestamp } },
    }).exec();
  }

  async recordEscalation(id: string, escalation: Partial<EscalationRecord>): Promise<Ticket> {
    const ticket = await this.ticketModel
      .findByIdAndUpdate(
        id,
        {
          $push: { escalations: { ...escalation, escalatedAt: escalation.escalatedAt || new Date() } },
          $set: { status: 'escalated' },
        },
        { new: true },
      )
      .exec();
    if (!ticket) throw new NotFoundException(`Ticket ${id} not found`);
    return ticket;
  }

  async updateGovernance(
    id: string,
    fields: {
      conversationPhase?: string;
      evidenceStatus?: string;
      decisionTraceEntry?: string;
    },
  ): Promise<void> {
    const $set: Record<string, any> = {};
    const $push: Record<string, any> = {};

    if (fields.conversationPhase) $set.conversationPhase = fields.conversationPhase;
    if (fields.evidenceStatus) $set.evidenceStatus = fields.evidenceStatus;
    if (fields.decisionTraceEntry) $push.decisionTrace = fields.decisionTraceEntry;

    const update: Record<string, any> = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($push).length) update.$push = $push;
    if (Object.keys(update).length === 0) return;

    await this.ticketModel.findByIdAndUpdate(id, update).exec();
  }
}
