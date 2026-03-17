import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import { Policy, PolicyDocument } from './schemas/policy.schema';
import { Approval, ApprovalDocument } from './schemas/approval.schema';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { evaluateConditions } from './evaluator';

export interface PolicyFilters {
  trigger?: string;
  riskLevel?: string;
  active?: boolean;
}

export interface EvaluationResult {
  requiresApproval: boolean;
  matchedPolicies: Policy[];
  riskLevel: string;
}

@Injectable()
export class PoliciesService {
  constructor(
    @InjectModel(Policy.name) private policyModel: Model<PolicyDocument>,
    @InjectModel(Approval.name) private approvalModel: Model<ApprovalDocument>,
  ) {}

  async createPolicy(dto: CreatePolicyDto): Promise<Policy> {
    return new this.policyModel(dto).save();
  }

  async findAllPolicies(filters: PolicyFilters): Promise<Policy[]> {
    const query: FilterQuery<PolicyDocument> = {};
    if (filters.trigger) query.trigger = filters.trigger;
    if (filters.riskLevel) query.riskLevel = filters.riskLevel;
    if (filters.active !== undefined) query.active = filters.active;
    return this.policyModel.find(query).sort({ createdAt: -1 }).exec();
  }

  async findPolicyById(id: string): Promise<Policy> {
    const policy = await this.policyModel.findById(id).exec();
    if (!policy) throw new NotFoundException(`Policy ${id} not found`);
    return policy;
  }

  async updatePolicy(id: string, dto: Partial<CreatePolicyDto>): Promise<Policy> {
    const policy = await this.policyModel
      .findByIdAndUpdate(id, { $set: dto }, { new: true })
      .exec();
    if (!policy) throw new NotFoundException(`Policy ${id} not found`);
    return policy;
  }

  async togglePolicy(id: string, active: boolean): Promise<Policy> {
    const policy = await this.policyModel
      .findByIdAndUpdate(id, { $set: { active } }, { new: true })
      .exec();
    if (!policy) throw new NotFoundException(`Policy ${id} not found`);
    return policy;
  }

  async evaluate(
    action: string,
    context: Record<string, any> = {},
  ): Promise<EvaluationResult> {
    const policies = await this.policyModel
      .find({ trigger: action, active: true })
      .exec();

    const matchedPolicies = policies.filter((p) =>
      evaluateConditions(p.conditions, context),
    );

    if (matchedPolicies.length === 0) {
      return { requiresApproval: false, matchedPolicies: [], riskLevel: 'low' };
    }

    const riskOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    const highestRisk = matchedPolicies.reduce((max, p) => {
      const current = riskOrder[p.riskLevel] ?? 0;
      const best = riskOrder[max] ?? 0;
      return current > best ? p.riskLevel : max;
    }, 'low');

    const requiresApproval = matchedPolicies.some((p) => p.requiresApproval);

    return { requiresApproval, matchedPolicies, riskLevel: highestRisk };
  }

  async requestApproval(data: {
    policyId: string;
    caseId: string;
    ticketId: string;
    action: string;
    context?: Record<string, any>;
    requestedBy?: string;
  }): Promise<Approval> {
    return new this.approvalModel({ ...data, status: 'pending' }).save();
  }

  async findPendingApprovals(): Promise<Approval[]> {
    return this.approvalModel
      .find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .exec();
  }

  async resolveApproval(
    id: string,
    status: 'approved' | 'rejected',
    resolvedBy: string,
    reason?: string,
  ): Promise<Approval> {
    const approval = await this.approvalModel
      .findByIdAndUpdate(
        id,
        { $set: { status, resolvedBy, reason, resolvedAt: new Date() } },
        { new: true },
      )
      .exec();
    if (!approval) throw new NotFoundException(`Approval ${id} not found`);
    return approval;
  }

  async findApprovalsByCase(caseId: string): Promise<Approval[]> {
    return this.approvalModel.find({ caseId }).sort({ createdAt: -1 }).exec();
  }
}
