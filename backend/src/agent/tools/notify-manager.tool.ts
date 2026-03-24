import { Injectable } from '@nestjs/common';
import { AgentTool, ToolDefinition, ToolResult, AgentContext } from './tool.interface';

@Injectable()
export class NotifyManagerTool implements AgentTool {
  readonly definition: ToolDefinition = {
    name: 'notify_manager',
    description:
      'Envia uma mensagem interna para o gerente (Cássio). Use para: escalar atendimento, confirmar se caso é bug, pedir transferência para outro analista, ou qualquer comunicação interna que o cliente NÃO deve ver. O cliente NUNCA vê essa mensagem.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: [
            'escalation_needed',
            'possible_bug',
            'cannot_handle',
            'needs_system_access',
            'client_requested_human',
            'max_attempts_reached',
            'other',
          ],
          description: 'Motivo da notificação',
        },
        message: {
          type: 'string',
          description:
            'Mensagem detalhada para o gerente explicando a situação, o que o cliente precisa e por que está escalando',
        },
        customerSummary: {
          type: 'string',
          description: 'Resumo breve do problema do cliente para contexto',
        },
      },
      required: ['reason', 'message'],
    },
  };

  async execute(args: Record<string, any>, context: AgentContext): Promise<ToolResult> {
    const { reason, message, customerSummary } = args;

    if (!context.metadata) context.metadata = {};
    if (!context.metadata.managerNotifications) context.metadata.managerNotifications = [];

    context.metadata.managerNotifications.push({
      reason,
      message,
      customerSummary: customerSummary || '',
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      data: {
        notified: true,
        note: 'Mensagem enviada ao gerente. Continue a conversa com o cliente normalmente.',
      },
    };
  }
}
