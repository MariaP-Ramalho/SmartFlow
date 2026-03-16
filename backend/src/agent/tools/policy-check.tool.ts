import { Injectable } from '@nestjs/common';
import { PoliciesService } from '../../policies/policies.service';
import { AgentTool, ToolDefinition, ToolResult, AgentContext } from './tool.interface';

@Injectable()
export class PolicyCheckTool implements AgentTool {
  readonly definition: ToolDefinition = {
    name: 'check_policy',
    description:
      'Check if an action requires approval based on company policies. Must be called before executing high-risk actions like refunds, RMA, or cancellations.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          description: "The action type to check (e.g. 'refund', 'rma', 'cancellation', 'replacement')",
        },
        context: {
          type: 'object',
          description: 'Relevant data such as amount, customer tier, product info',
        },
      },
      required: ['action'],
    },
  };

  constructor(private readonly policiesService: PoliciesService) {}

  async execute(args: Record<string, any>, agentContext: AgentContext): Promise<ToolResult> {
    try {
      const { action, context = {} } = args;
      if (!action) return { success: false, error: 'action is required' };

      const enrichedContext = {
        ...context,
        caseId: agentContext.caseId,
        ticketId: agentContext.ticketId,
      };

      const result = await this.policiesService.evaluate(action, enrichedContext);

      if (result.requiresApproval && result.matchedPolicies.length > 0) {
        const approval = await this.policiesService.requestApproval({
          policyId: (result.matchedPolicies[0] as any)._id.toString(),
          caseId: agentContext.caseId,
          ticketId: agentContext.ticketId || '',
          action,
          context: enrichedContext,
          requestedBy: 'agent',
        });

        return {
          success: true,
          data: {
            requiresApproval: true,
            approvalId: (approval as any)._id,
            riskLevel: result.riskLevel,
            matchedPolicies: result.matchedPolicies.map((p) => p.name),
            status: 'pending_approval',
          },
        };
      }

      return {
        success: true,
        data: {
          requiresApproval: false,
          riskLevel: result.riskLevel,
          status: 'approved',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
