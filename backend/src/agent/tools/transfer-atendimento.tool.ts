import { Injectable } from '@nestjs/common';
import { AgentTool, ToolDefinition, ToolResult, AgentContext } from './tool.interface';
import { ZapFlowPgService } from '../../zapflow/zapflow-pg.service';

@Injectable()
export class TransferAtendimentoTool implements AgentTool {
  readonly definition: ToolDefinition = {
    name: 'transfer_atendimento',
    description:
      'Transfere o atendimento atual para outro analista humano. ' +
      'Valida automaticamente: feriados, horário de expediente, disponibilidade dos técnicos e carga de trabalho. ' +
      'Use quando precisar transferir (escalação, acesso ao sistema, configuração/evento, cliente pediu humano, máximo de tentativas). ' +
      'O cliente NÃO vê essa ação — apenas o resultado (a transferência acontece internamente).',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          enum: [
            'needs_system_access',
            'configuration_or_event',
            'client_requested_human',
            'max_attempts_reached',
            'escalation_needed',
            'possible_bug',
            'other',
          ],
          description: 'Motivo da transferência',
        },
        message: {
          type: 'string',
          description:
            'Descrição detalhada do motivo da transferência: o que o cliente precisa, o que já foi tentado, e por que está transferindo',
        },
      },
      required: ['reason', 'message'],
    },
  };

  constructor(private readonly zapflow: ZapFlowPgService) {}

  async execute(args: Record<string, any>, context: AgentContext): Promise<ToolResult> {
    const { reason, message } = args;
    const atendimentoId = context.metadata?.atendimentoId;

    if (!atendimentoId) {
      this.storeManagerNotification(context, reason, message);
      return {
        success: false,
        data: {
          transferred: false,
          reason: 'Não foi possível identificar o ID do atendimento atual. O gerente foi notificado para realizar a transferência manualmente.',
        },
      };
    }

    const agentTecnicoId = context.metadata?.agentTecnicoId;
    const result = await this.zapflow.validateAndSelectForTransfer(atendimentoId, agentTecnicoId);

    if (!result.canTransfer) {
      this.storeManagerNotification(context, reason, `${message}\n[Transferência automática bloqueada: ${result.reason}]`);
      return {
        success: true,
        data: {
          transferred: false,
          blocked: true,
          blockReason: result.reason,
          note: 'A transferência não pode ser realizada neste momento. O gerente foi notificado. Informe o cliente que a equipe entrará em contato assim que possível.',
        },
      };
    }

    if (!context.metadata) context.metadata = {};
    if (!context.metadata.transferCommands) context.metadata.transferCommands = [];

    context.metadata.transferCommands.push({
      atendimentoId,
      targetTecnicoId: result.selectedTecnicoId,
      targetTecnicoName: result.selectedTecnicoName,
      isCoordinator: result.isCoordinator,
      reason: message,
      timestamp: new Date().toISOString(),
    });

    this.storeManagerNotification(
      context,
      reason,
      `${message}\n[Transferido automaticamente para ${result.selectedTecnicoName} (ID ${result.selectedTecnicoId})${result.isCoordinator ? ' - Coordenador' : ''}]`,
    );

    return {
      success: true,
      data: {
        transferred: true,
        targetName: result.selectedTecnicoName,
        isCoordinator: result.isCoordinator,
        note: 'Transferência será executada. Informe o cliente que um colega vai dar continuidade no atendimento.',
      },
    };
  }

  private storeManagerNotification(context: AgentContext, reason: string, message: string): void {
    if (!context.metadata) context.metadata = {};
    if (!context.metadata.managerNotifications) context.metadata.managerNotifications = [];
    context.metadata.managerNotifications.push({
      reason,
      message,
      customerSummary: '',
      timestamp: new Date().toISOString(),
    });
  }
}
