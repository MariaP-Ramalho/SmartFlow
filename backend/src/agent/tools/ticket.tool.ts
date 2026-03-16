import { Injectable } from '@nestjs/common';
import { TicketsService } from '../../tickets/tickets.service';
import { AgentTool, ToolDefinition, ToolResult, AgentContext } from './tool.interface';

@Injectable()
export class TicketTool implements AgentTool {
  readonly definition: ToolDefinition = {
    name: 'manage_ticket',
    description:
      'Create, update, or resolve support tickets. Use this to manage the lifecycle of a support case.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['create', 'update', 'update_status', 'resolve', 'get_info'],
          description: 'The ticket action to perform',
        },
        ticketId: {
          type: 'string',
          description: 'The ticket ID (required for all actions except create)',
        },
        data: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
            category: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            resolution: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                description: { type: 'string' },
              },
            },
          },
          description: 'Data payload for the action',
        },
      },
      required: ['action'],
    },
  };

  constructor(private readonly ticketsService: TicketsService) {}

  async execute(args: Record<string, any>, context: AgentContext): Promise<ToolResult> {
    try {
      const { action, ticketId, data } = args;
      const id = ticketId || context.ticketId;

      switch (action) {
        case 'create': {
          const ticket = await this.ticketsService.create({
            title: data?.title || 'Auto-created ticket',
            description: data?.description || '',
            priority: data?.priority,
            category: data?.category,
            tags: data?.tags,
          });
          return { success: true, data: { ticketId: (ticket as any)._id, status: ticket.status } };
        }

        case 'update': {
          if (!id) return { success: false, error: 'ticketId is required for update' };
          const ticket = await this.ticketsService.update(id, data || {});
          return { success: true, data: ticket };
        }

        case 'update_status': {
          if (!id) return { success: false, error: 'ticketId is required for update_status' };
          if (!data?.status) return { success: false, error: 'data.status is required' };
          const ticket = await this.ticketsService.updateStatus(id, data.status);
          return { success: true, data: { ticketId: (ticket as any)._id, status: ticket.status } };
        }

        case 'resolve': {
          if (!id) return { success: false, error: 'ticketId is required for resolve' };
          const resolution = data?.resolution || {
            type: 'agent_resolved',
            description: data?.description || 'Resolved by agent',
          };
          const ticket = await this.ticketsService.resolve(id, resolution);
          return { success: true, data: { ticketId: (ticket as any)._id, status: ticket.status } };
        }

        case 'get_info': {
          if (!id) return { success: false, error: 'ticketId is required for get_info' };
          const ticket = await this.ticketsService.findById(id);
          return { success: true, data: ticket };
        }

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
